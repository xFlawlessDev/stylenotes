<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import {
		getCurrentWindow,
		currentMonitor,
		LogicalSize,
		PhysicalPosition
	} from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import type { Note } from '$lib/content/content';
	import {
		isTauri,
		openNoteWindow,
		openTaskWindow,
		OVERLAY_VISIBILITY_EVENT
	} from '$lib/windows';
	import {
		DOCK_EXPANDED,
		DOCK_MIN_LENGTH,
		DOCK_RAIL,
		dockCardOffset,
		dockOverlayMinLength,
		dockTooltipSide,
		dockWindowLength,
		dockWindowSize,
		fitDockWindow,
		snapToDockEdge,
		type DockEdge,
		type DockHover,
		type DockPoint,
		type DockSize
	} from '$lib/dock';
	import { createDockCursorTracker, type DockCursorTracker } from '$lib/dock-tracker';
	import { captureWorkspaceId, hoverWorkspaceId } from '$lib/dock-workspace';
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
	import { hydrateWorkspaces, workspaceStore } from '$lib/stores/workspaces.svelte';
	import { startWorkspaceSync, workspaceLookup } from '$lib/workspace-sync.svelte';
	import DockHandle from '$lib/components/overlay/DockHandle.svelte';
	import DockRailItems from '$lib/components/overlay/DockRailItems.svelte';
	import DockRailLayers from '$lib/components/overlay/DockRailLayers.svelte';

	const CARD: DockSize = { width: 288, height: 280 };
	const CAPTURE_CARD: DockSize = { width: 208, height: 104 };
	const POLL_MS = 40;
	/** Grace period so the pointer can travel from the + button to the menu. */
	const CAPTURE_LINGER_MS = 250;

	const railClasses: Record<DockEdge, string> = {
		left: 'top-3 left-0 flex-col rounded-r-2xl pt-3 pb-4',
		right: 'top-3 right-0 flex-col rounded-l-2xl pt-3 pb-4',
		top: 'top-0 left-0 w-max flex-row rounded-b-2xl px-3'
	};

	const edge = $derived(settings.overlayPosition);
	const railSide = $derived(railClasses[edge]);
	const tooltipSide = $derived(dockTooltipSide(edge));
	/** Resolves each docked record's workspace for the badge and quick capture. */
	const workspaceFor = $derived(workspaceLookup());
	let collapsed = $state(false);
	let hovered = $state<DockHover | null>(null);
	let captureOpen = $state(false);
	/** Workspace the capture menu was opened from (defaults to the active one). */
	let captureWorkspace = $state('');
	let railEl: HTMLElement | undefined = $state();
	let cardEl: HTMLElement | undefined = $state();
	let captureEl: HTMLElement | undefined = $state();
	let plusEl: HTMLElement | undefined = $state();
	/**
	 * Window size fitted to the rail content. Updated by `fitRail` once the rail
	 * is measurable; `dockWindowSize` (the cap) is the pre-measurement fallback.
	 */
	let windowSize = $state<DockSize>({ ...DOCK_EXPANDED });
	/**
	 * Window-local anchors the cards hang off. Kept separate from the computed
	 * offsets so they can be re-clamped when the window grows to fit a card.
	 */
	const cardAnchor = $state<DockPoint>({ x: 0, y: 0 });
	const captureAnchor = $state<DockPoint>({ x: 0, y: 0 });
	const cardOffset = $derived(
		dockCardOffset({ edge, pointer: cardAnchor, window: windowSize, card: CARD })
	);
	const captureOffset = $derived(
		dockCardOffset({ edge, pointer: captureAnchor, window: windowSize, card: CAPTURE_CARD })
	);
	/**
	 * Overlay currently open beside the rail, which the window has to be long
	 * enough to hold. A hover card or capture menu is wider than a short rail, so
	 * fitting only to the rail would clip it.
	 */
	const openOverlay = $derived(captureOpen ? CAPTURE_CARD : hovered ? CARD : null);
	let ignoring = false;
	let ignoreChain: Promise<void> = Promise.resolve();
	let dragging = false;
	let tracker: DockCursorTracker | undefined;
	let captureCloseTimer: ReturnType<typeof setTimeout> | undefined;
	let railObserver: ResizeObserver | undefined;

	/**
	 * Sizes the window to the rail's natural content length so the transparent,
	 * click-through overlay leaves no dead space beside the rail. The rail fills
	 * the thickness axis on its own, so only the free axis is measured — the
	 * window is fitted after layout every time the rail content changes, and
	 * grown while a hover card or capture menu needs the room.
	 *
	 * Collapsed fits the fixed tab instead; off-screen (nothing to measure) it
	 * keeps the expanded cap as the fallback. Geometry is only applied when the
	 * size actually changed, so the resize never feeds back into the observer.
	 */
	function fitRail(force = false) {
		if (!isTauri) return;
		const overlay = openOverlay;
		const min = overlay
			? dockOverlayMinLength(edge === 'top' ? overlay.width : overlay.height)
			: DOCK_MIN_LENGTH;
		const next =
			collapsed || !railEl
				? dockWindowSize(edge, collapsed)
				: fitDockWindow(
						edge,
						dockWindowLength(edge, edge === 'top' ? railEl.offsetWidth : railEl.offsetHeight),
						min
					);
		const changed = next.width !== windowSize.width || next.height !== windowSize.height;
		// An edge change can keep the size (right ↔ left) while the pin has to
		// move; `force` still re-applies the position in that case.
		if (!changed && !force) return;
		windowSize = next;
		void applyDockGeometry();
	}

	// An open card/menu needs more room than the rail itself; re-fit whenever it
	// appears or disappears so the window grows and shrinks with it. `fitRail`
	// also reads `windowSize`, which it writes — untrack so the effect depends
	// only on `openOverlay` and cannot re-trigger itself.
	$effect(() => {
		void openOverlay;
		untrack(fitRail);
	});

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
		try {
			await loadDockItems();
		} catch {
			/* keep the last known dock when the database is busy */
		}
		syncHovered();
	}

	/**
	 * Reloads the dock, then re-fits the window. Used when the dock becomes
	 * visible: the first mount can race the workspace hydration, so the dock
	 * re-reads the records and re-measures once the toggle actually shows it.
	 *
	 * It also re-asserts the click-through state with `force`, because on
	 * Windows an `ignore` applied before the window was ever shown can stick
	 * even after a later `false` — which left the freshly revealed dock
	 * unresponsive until the user hid and re-showed it by hand.
	 */
	async function showDock() {
		await reload();
		await tick();
		fitRail(true);
		await setIgnore(collapsed, true);
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

	/**
	 * Quick capture targets the workspace the menu was opened from: the dock
	 * mixes every workspace, so a capture started on a "Work" item must not
	 * silently land in whichever workspace is active elsewhere.
	 */
	async function createDockItem(kind: QuickCaptureKind) {
		const target = captureWorkspaceId(captureWorkspace, workspaceStore.activeId);
		closeCaptureMenu();
		if (kind === 'note') await createQuickNote(target);
		else await createQuickTask(target);
		await reload();
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
		const size = windowSize;
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
		// The rail mounts/unmounts with `collapsed`, so wait for layout before
		// measuring the new content and sizing the window to it.
		await tick();
		fitRail(true);
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
	 *
	 * `force` re-applies the value even when `ignoring` already matches. The
	 * Windows backend can drop an `ignore` applied to a window that was not
	 * shown yet, so the flag and the OS state can disagree; a forced call
	 * re-syncs them.
	 */
	function setIgnore(value: boolean, force = false): Promise<void> {
		if (!isTauri) return Promise.resolve();
		ignoreChain = ignoreChain.then(async () => {
			if (!force && ignoring === value) return;
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
		// Before the rail mounts there is nothing to hit-test against. The
		// window is already hidden or click-through at this point, so leave the
		// state alone rather than deciding on empty rects; the first tick after
		// the rail mounts re-evaluates it.
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
				// Captures started on an item follow that item's workspace.
				captureWorkspace = hoverWorkspaceId(hit.hover);
				cardAnchor.x = hit.anchor.x;
				cardAnchor.y = hit.anchor.y;
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
		const anchor = rectCenter(plusEl.getBoundingClientRect());
		captureAnchor.x = anchor.x;
		captureAnchor.y = anchor.y;
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
		// `captureWorkspace` survives until the click it belongs to is handled.
	}

	onMount(() => {
		let disposed = false;
		/** Wraps a listener registration so it is released even past unmount. */
		function track(registration: Promise<() => void>) {
			void registration
				.then((fn) => {
					if (disposed) fn();
					else unlisteners.push(fn);
				})
				.catch(() => undefined);
		}

		void (async () => {
			await hydrateWorkspaces();
			await startWorkspaceSync();
			// The dock window boots alongside the workspace window; reload once
			// more after the sync is up so a race on the first read self-heals.
			if (!disposed) await reload();
		})();

		const unlisteners: (() => void)[] = [];

		if (isTauri) {
			track(
				getCurrentWindow().onFocusChanged(({ payload: focused }) => {
					if (focused) void reload();
				})
			);
			track(listen(TASKS_CHANGED, () => void reload()));
			track(listen(NOTES_CHANGED, () => void reload()));
			track(listenQuickCapture((kind) => void createDockItem(kind)));
			// The toggle emits this from the workspace window. The overlay starts
			// hidden, so its first read can happen before the workspace has
			// written its state; re-read on every show instead of trusting the
			// mount-time snapshot.
			track(
				listen<boolean>(OVERLAY_VISIBILITY_EVENT, ({ payload }) => {
					if (payload) void showDock();
					else {
						hovered = null;
						closeCaptureMenu();
					}
				})
			);
			track(
				listen<Settings>(SETTINGS_CHANGED, (event) => {
					const edgeChanged = event.payload?.overlayPosition !== settings.overlayPosition;
					applySettingsSnapshot(event.payload);
					applyDockFilters();
					syncHovered();
					if (edgeChanged) {
						hovered = null;
						closeCaptureMenu();
						// The rail re-renders along the other axis; re-fit and always
						// re-pin, since a side→side switch keeps the window size.
						void tick().then(() => fitRail(true));
					}
				})
			);
		} else {
			const onFocus = () => void reload();
			window.addEventListener('focus', onFocus);
			unlisteners.push(() => window.removeEventListener('focus', onFocus));
		}

		const cleanupListeners = () => {
			for (const unlisten of unlisteners) unlisten();
			unlisteners.length = 0;
		};

		if (!isTauri) {
			return () => {
				disposed = true;
				cleanupListeners();
			};
		}

		tracker = createDockCursorTracker({
			interval: POLL_MS,
			suspended: () => dragging,
			onCursor: handleCursor
		});

		railObserver = new ResizeObserver(() => fitRail());
		if (railEl) railObserver.observe(railEl);

		void fitRail();
		// The dock is hidden at launch, so it starts click-through. If it is
		// already visible (a re-mount, or the toggle beat this mount) the
		// cursor poller owns the state instead; `handleCursor` will correct it.
		void getCurrentWindow()
			.isVisible()
			.then((visible) => {
				if (disposed) return;
				void setIgnore(visible ? collapsed : true, true);
			})
			.catch(() => void setIgnore(true, true));

		return () => {
			disposed = true;
			railObserver?.disconnect();
			railObserver = undefined;
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
		{captureWorkspace}
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
			class="absolute flex items-center gap-2.5 bg-surface-container-lowest/90 backdrop-blur-2xl {railSide}"
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
				{workspaceFor}
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
