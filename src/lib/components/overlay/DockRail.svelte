<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getCurrentWindow,
		cursorPosition,
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
	let dragging = false;
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
		if (!monitor) return;
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

	async function setIgnore(value: boolean) {
		if (!isTauri || ignoring === value) return;
		ignoring = value;
		await getCurrentWindow().setIgnoreCursorEvents(value);
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
		void reload();

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

		void applyDockGeometry();
		void setIgnore(true);

		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = async () => {
			try {
				if (dragging) {
					await setIgnore(false);
					timer = setTimeout(tick, POLL_MS);
					return;
				}
				const [cursor, pos, scale] = await Promise.all([
					cursorPosition(),
					getCurrentWindow().outerPosition(),
					getCurrentWindow().scaleFactor()
				]);
				const x = (cursor.x - pos.x) / scale;
				const y = (cursor.y - pos.y) / scale;

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
			} catch {
				/* ignore */
			}
			timer = setTimeout(tick, POLL_MS);
		};
		timer = setTimeout(tick, POLL_MS);

		return () => {
			clearTimeout(timer);
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
				ondraggingchange={(value) => (dragging = value)}
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
				ondraggingchange={(value) => (dragging = value)}
			/>
		</div>
	{/if}
</div>
