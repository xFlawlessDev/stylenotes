<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getCurrentWindow,
		currentMonitor,
		LogicalSize,
		PhysicalPosition
	} from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import type { Note } from '$lib/content/content';
	import { isTauri, openNoteWindow, openTaskWindow } from '$lib/windows';
	import {
		DOCK_RAIL,
		dockCardOffset,
		dockTooltipSide,
		dockWindowSize,
		snapToDockEdge,
		type DockEdge,
		type DockHover,
		type DockPoint,
		type DockSize
	} from '$lib/dock';
	import { createDockCursorTracker, type DockCursorTracker } from '$lib/dock-tracker';
	import {
		applySettingsSnapshot,
		settings,
		SETTINGS_CHANGED,
		type Settings
	} from '$lib/stores/settings.svelte';
	import {
		applyDockFilters,
		dockStore,
		loadDockItems,
		removeDockNote,
		removeDockTask,
		toggleDockComplete,
		toggleDockProgress
	} from '$lib/stores/dock.svelte';
	import { NOTES_CHANGED } from '$lib/stores/notes';
	import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import {
		createQuickNote,
		createQuickTask,
		listenQuickCapture,
		type QuickCaptureKind
	} from '$lib/stores/shortcuts';
	import type { Task } from '$lib/stores/tasks';
	import { hydrateWorkspaces } from '$lib/stores/workspaces.svelte';
	import DockHandle from '$lib/components/overlay/DockHandle.svelte';
	import DockRailItems from '$lib/components/overlay/DockRailItems.svelte';
	import DockRailLayers from '$lib/components/overlay/DockRailLayers.svelte';

	const CARD: DockSize = { width: 288, height: 280 };
	const CAPTURE_CARD: DockSize = { width: 208, height: 104 };
	const POLL_MS = 40;
	/** Grace period so the pointer can travel from the + button to the menu. */
	const CAPTURE_LINGER_MS = 250;

	const railClasses: Record<DockEdge, string> = {
		left: 'top-3 left-0 flex-col rounded-r-2xl py-3',
		right: 'top-3 right-0 flex-col rounded-l-2xl py-3',
		top: 'top-0 left-0 w-full flex-row rounded-b-2xl px-3'
	};

	const edge = $derived(settings.overlayPosition);
	const railSide = $derived(railClasses[edge]);
	const tooltipSide = $derived(dockTooltipSide(edge));

	let collapsed = $state(false);
	let hovered = $state<DockHover | null>(null);
	let cardOffset = $state<DockPoint>({ x: 0, y: 0 });
	let captureOpen = $state(false);
	let captureOffset = $state<DockPoint>({ x: 0, y: 0 });
	let railEl: HTMLElement | undefined = $state();
	let cardEl: HTMLElement | undefined = $state();
	let captureEl: HTMLElement | undefined = $state();
	let plusEl: HTMLElement | undefined = $state();
	let ignoring = false;
	let ignoreChain: Promise<void> = Promise.resolve();
	let dragging = false;
	let tracker: DockCursorTracker | undefined;
	let captureCloseTimer: ReturnType<typeof setTimeout> | undefined;

	function syncHovered() {
		const current = hovered;
		if (!current) return;
		if (current.kind === 'task' && !dockStore.tasks.some((item) => item.id === current.task.id)) {
			hovered = null;
		}
		if (current.kind === 'note' && !dockStore.notes.some((item) => item.id === current.note.id)) {
			hovered = null;
		}
	}

	async function reload() {
		await loadDockItems();
		syncHovered();
	}

	async function toggleProgress(task: Task) {
		hovered = { kind: 'task', task: await toggleDockProgress(task) };
	}

	async function toggleComplete(task: Task) {
		hovered = { kind: 'task', task: await toggleDockComplete(task) };
	}

	async function removeFromDock(task: Task) {
		hovered = null;
		await removeDockTask(task);
	}

	async function removeNoteFromDock(note: Note) {
		hovered = null;
		await removeDockNote(note);
	}

	function openNote(note: Note) {
		closeCaptureMenu();
		hovered = null;
		void openNoteWindow(note.id);
	}

	function openTask(task: Task) {
		closeCaptureMenu();
		hovered = null;
		void openTaskWindow(task.id);
	}

	async function createDockItem(kind: QuickCaptureKind) {
		closeCaptureMenu();
		if (kind === 'note') await createQuickNote();
		else await createQuickTask();
	}

	/** Sizes the window for the current edge and pins it against that edge. */
	async function applyDockGeometry() {
		if (!isTauri) return;
		const win = getCurrentWindow();
		const [pos, factor, monitor] = await Promise.all([
			win.outerPosition(),
			win.scaleFactor(),
			currentMonitor()
		]);
		const size = dockWindowSize(settings.overlayPosition, collapsed);
		await win.setSize(new LogicalSize(size.width, size.height));
		if (monitor) {
			const next = snapToDockEdge({
				edge: settings.overlayPosition,
				monitor,
				size: {
					width: Math.round(size.width * factor),
					height: Math.round(size.height * factor)
				},
				current: pos
			});
			await win.setPosition(new PhysicalPosition(next.x, next.y));
		}
		// The cursor tracker caches the window position; this just changed it.
		await tracker?.refresh().catch(() => undefined);
	}

	function onDraggingChange(value: boolean) {
		dragging = value;
		// A drag moves the window, so the cached position is stale afterwards.
		if (!value) void tracker?.refresh().catch(() => undefined);
	}

	async function toggleCollapsed() {
		collapsed = !collapsed;
		if (collapsed) {
			hovered = null;
			closeCaptureMenu();
		}
		await applyDockGeometry();
	}

	function inRect(el: HTMLElement | undefined, x: number, y: number) {
		if (!el) return false;
		const r = el.getBoundingClientRect();
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	}

	function rectCenter(r: DOMRect): DockPoint {
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}

	/**
	 * Toggles OS click-through for the dock window.
	 *
	 * Calls are chained so the OS state can never lag behind `ignoring`: the
	 * flag is only committed once the IPC settles, and a failed call rolls it
	 * back. Committing early (the old behaviour) left the window permanently
	 * click-through whenever a call rejected — hover still worked because it is
	 * driven by the poller, but no click ever reached the webview.
	 */
	function setIgnore(value: boolean): Promise<void> {
		if (!isTauri) return Promise.resolve();
		ignoreChain = ignoreChain.then(async () => {
			if (ignoring === value) return;
			try {
				await getCurrentWindow().setIgnoreCursorEvents(value);
				ignoring = value;
			} catch {
				/* keep `ignoring` in sync with the OS; the next tick retries */
			}
		});
		return ignoreChain;
	}

	function itemAtPoint(x: number, y: number): { hover: DockHover; anchor: DockPoint } | null {
		if (!railEl) return null;
		const buttons = railEl.querySelectorAll<HTMLElement>('[data-dock-id]');
		for (const btn of buttons) {
			const r = btn.getBoundingClientRect();
			if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
			const id = btn.dataset.dockId;
			if (btn.dataset.dockKind === 'note') {
				const note = dockStore.notes.find((item) => item.id === id);
				if (note) return { hover: { kind: 'note', note }, anchor: rectCenter(r) };
			} else if (btn.dataset.dockKind === 'task') {
				const task = dockStore.tasks.find((item) => item.id === id);
				if (task) return { hover: { kind: 'task', task }, anchor: rectCenter(r) };
			}
		}
		return null;
	}

	/**
	 * Translates one polled cursor position into the dock's click-through state
	 * and hover targets. Runs once per tick while the dock window is visible.
	 */
	async function handleCursor({ x, y }: DockPoint) {
		// Before the rail mounts there is nothing to hit-test against; keep the
		// mount-time click-through state instead of deciding on empty rects
		// (which would pin the window as ignored until the pointer left and
		// returned).
		if (!railEl) return;

		const overRail = inRect(railEl, x, y);
		const overPlus = inRect(plusEl, x, y);
		const overCard = inRect(cardEl, x, y);
		const overCapture = captureOpen && inRect(captureEl, x, y);

		if (collapsed) {
			await setIgnore(!overRail);
		} else if (overPlus) {
			await setIgnore(false);
			openCaptureMenu();
		} else if (overCapture) {
			await setIgnore(false);
			cancelCaptureClose();
		} else if (overRail) {
			await setIgnore(false);
			const hit = itemAtPoint(x, y);
			if (hit) {
				closeCaptureMenu();
				hovered = hit.hover;
				cardOffset = dockCardOffset({
					edge: settings.overlayPosition,
					pointer: hit.anchor,
					window: dockWindowSize(settings.overlayPosition, false),
					card: CARD
				});
			} else {
				scheduleCaptureClose();
			}
		} else if (overCard) {
			await setIgnore(false);
			scheduleCaptureClose();
		} else {
			hovered = null;
			scheduleCaptureClose();
			await setIgnore(true);
		}
	}

	function openCaptureMenu() {
		if (captureOpen || !plusEl) return;
		cancelCaptureClose();
		captureOpen = true;
		hovered = null;
		captureOffset = dockCardOffset({
			edge: settings.overlayPosition,
			pointer: rectCenter(plusEl.getBoundingClientRect()),
			window: dockWindowSize(settings.overlayPosition, false),
			card: CAPTURE_CARD
		});
	}

	function cancelCaptureClose() {
		if (captureCloseTimer) {
			clearTimeout(captureCloseTimer);
			captureCloseTimer = undefined;
		}
	}

	/** Closes after a short linger so the pointer can cross the gap to the menu. */
	function scheduleCaptureClose() {
		if (!captureOpen || captureCloseTimer) return;
		captureCloseTimer = setTimeout(() => {
			captureCloseTimer = undefined;
			captureOpen = false;
		}, CAPTURE_LINGER_MS);
	}

	function closeCaptureMenu() {
		cancelCaptureClose();
		captureOpen = false;
	}

	onMount(() => {
		void (async () => {
			await hydrateWorkspaces();
			await reload();
		})();

		let unlistenFocus: (() => void) | undefined;
		let unlistenTasks: (() => void) | undefined;
		let unlistenNotes: (() => void) | undefined;
		let unlistenSettings: (() => void) | undefined;
		let unlistenCapture: (() => void) | undefined;
		let unlistenBrowser: (() => void) | undefined;

		if (isTauri) {
			void getCurrentWindow()
				.onFocusChanged(({ payload: focused }) => {
					if (focused) void reload();
				})
				.then((fn) => (unlistenFocus = fn));
			void listen(TASKS_CHANGED, () => void reload()).then((fn) => (unlistenTasks = fn));
			void listen(NOTES_CHANGED, () => void reload()).then((fn) => (unlistenNotes = fn));
			void listenQuickCapture((kind) => void createDockItem(kind)).then(
				(fn) => (unlistenCapture = fn)
			);
			void listen<Settings>(SETTINGS_CHANGED, (event) => {
				const edgeChanged = event.payload?.overlayPosition !== settings.overlayPosition;
				applySettingsSnapshot(event.payload);
				applyDockFilters();
				syncHovered();
				if (edgeChanged) {
					hovered = null;
					closeCaptureMenu();
					void applyDockGeometry();
				}
			}).then((fn) => (unlistenSettings = fn));
		} else {
			const onFocus = () => void reload();
			window.addEventListener('focus', onFocus);
			unlistenBrowser = () => window.removeEventListener('focus', onFocus);
		}

		const cleanupListeners = () => {
			unlistenFocus?.();
			unlistenTasks?.();
			unlistenNotes?.();
			unlistenSettings?.();
			unlistenCapture?.();
			unlistenBrowser?.();
		};

		if (!isTauri) {
			return cleanupListeners;
		}

		tracker = createDockCursorTracker({
			interval: POLL_MS,
			suspended: () => dragging,
			onCursor: handleCursor
		});

		void applyDockGeometry();
		void setIgnore(true);

		return () => {
			tracker?.dispose();
			tracker = undefined;
			cancelCaptureClose();
			cleanupListeners();
		};
	});
</script>

<div class="relative h-screen w-screen overflow-hidden" role="presentation">
	<DockRailLayers
		bind:hovered
		{cardOffset}
		{captureOpen}
		{captureOffset}
		bind:cardEl
		bind:captureEl
		onopennote={openNote}
		onopentask={openTask}
		onprogress={toggleProgress}
		oncomplete={toggleComplete}
		onremovetask={removeFromDock}
		onremovenote={removeNoteFromDock}
		oncreate={createDockItem}
	/>

	{#if !collapsed}
		<!-- Rail (full) -->
		<div
			bind:this={railEl}
			class="absolute flex items-center gap-2.5 bg-surface-container-lowest/90 shadow-2xl backdrop-blur-2xl {railSide}"
			style={edge === 'top' ? `height: ${DOCK_RAIL}px;` : `width: ${DOCK_RAIL}px;`}
		>
			<DockHandle
				{edge}
				{collapsed}
				ontoggle={toggleCollapsed}
				ondraggingchange={onDraggingChange}
			/>
			<DockRailItems
				notes={dockStore.notes}
				tasks={dockStore.tasks}
				docked={dockStore.docked}
				{edge}
				{hovered}
				{tooltipSide}
				bind:plusEl
				onopennote={openNote}
				onopentask={openTask}
				onplus={() => (captureOpen ? closeCaptureMenu() : openCaptureMenu())}
				onplusenter={openCaptureMenu}
			/>
		</div>
	{:else}
		<!-- Collapsed minimal tab -->
		<div bind:this={railEl} class="absolute inset-0">
			<DockHandle
				{edge}
				{collapsed}
				ontoggle={toggleCollapsed}
				ondraggingchange={onDraggingChange}
			/>
		</div>
	{/if}
</div>
