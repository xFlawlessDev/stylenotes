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
	import { ListTodo, Plus } from '@lucide/svelte';
	import { isTauri, openWorkspace } from '$lib/windows';
	import {
		DOCK_RAIL,
		dockCardOffset,
		dockTooltipSide,
		dockWindowSize,
		snapToDockEdge,
		type DockEdge,
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
		loadDockTasks,
		removeDockTask,
		toggleDockComplete,
		toggleDockProgress
	} from '$lib/stores/dock.svelte';
	import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import type { Task } from '$lib/stores/tasks';
	import DockHandle from '$lib/components/overlay/DockHandle.svelte';
	import DockTaskButton from '$lib/components/overlay/DockTaskButton.svelte';
	import TaskDockCard from '$lib/components/overlay/TaskDockCard.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	const CARD: DockSize = { width: 288, height: 280 };
	const POLL_MS = 40;

	const railClasses: Record<DockEdge, string> = {
		left: 'top-3 left-0 flex-col rounded-r-2xl py-3',
		right: 'top-3 right-0 flex-col rounded-l-2xl py-3',
		top: 'top-0 left-0 w-full flex-row rounded-b-2xl px-3'
	};

	const edge = $derived(settings.overlayPosition);
	const railSide = $derived(railClasses[edge]);
	const tooltipSide = $derived(dockTooltipSide(edge));
	let collapsed = $state(false);
	let hovered = $state<Task | null>(null);
	let cardOffset = $state<DockPoint>({ x: 0, y: 0 });
	let railEl: HTMLElement | undefined = $state();
	let cardEl: HTMLElement | undefined = $state();
	let ignoring = false;
	let dragging = false;

	function syncHovered() {
		if (hovered && !dockStore.tasks.some((item) => item.id === hovered?.id)) hovered = null;
	}

	async function reload() {
		await loadDockTasks();
		syncHovered();
	}

	async function toggleProgress(task: Task) {
		hovered = await toggleDockProgress(task);
	}

	async function toggleComplete(task: Task) {
		hovered = await toggleDockComplete(task);
	}

	async function removeFromDock(task: Task) {
		hovered = null;
		await removeDockTask(task);
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
		if (collapsed) hovered = null;
		await applyDockGeometry();
	}

	function inRect(el: HTMLElement | undefined, x: number, y: number) {
		if (!el) return false;
		const r = el.getBoundingClientRect();
		return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
	}

	async function setIgnore(value: boolean) {
		if (!isTauri || ignoring === value) return;
		ignoring = value;
		await getCurrentWindow().setIgnoreCursorEvents(value);
	}

	function taskAtPoint(x: number, y: number): { task: Task; anchor: DockPoint } | null {
		if (!railEl) return null;
		const buttons = railEl.querySelectorAll<HTMLElement>('[data-task-id]');
		for (const btn of buttons) {
			const r = btn.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
				const task = dockStore.tasks.find((item) => item.id === btn.dataset.taskId);
				if (task) {
					return { task, anchor: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
				}
			}
		}
		return null;
	}

	async function openWorkspaceWindow() {
		await openWorkspace();
	}

	onMount(() => {
		void reload();

		let unlistenFocus: (() => void) | undefined;
		let unlistenTasks: (() => void) | undefined;
		let unlistenSettings: (() => void) | undefined;
		let unlistenBrowser: (() => void) | undefined;

		if (isTauri) {
			void getCurrentWindow()
				.onFocusChanged(({ payload: focused }) => {
					if (focused) void reload();
				})
				.then((fn) => (unlistenFocus = fn));
			void listen(TASKS_CHANGED, () => void reload()).then((fn) => (unlistenTasks = fn));
			void listen<Settings>(SETTINGS_CHANGED, (event) => {
				const edgeChanged = event.payload?.overlayPosition !== settings.overlayPosition;
				applySettingsSnapshot(event.payload);
				applyDockFilters();
				syncHovered();
				if (edgeChanged) {
					hovered = null;
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
			unlistenSettings?.();
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

				if (collapsed) {
					if (overRail) await setIgnore(false);
					else await setIgnore(true);
				} else {
					const hit = taskAtPoint(x, y);
					const overCard = inRect(cardEl, x, y);
					if (overRail) {
						await setIgnore(false);
						if (hit) {
							hovered = hit.task;
							cardOffset = dockCardOffset({
								edge: settings.overlayPosition,
								pointer: hit.anchor,
								window: dockWindowSize(settings.overlayPosition, false),
								card: CARD
							});
						}
					} else if (overCard) {
						await setIgnore(false);
					} else {
						hovered = null;
						await setIgnore(true);
					}
				}
			} catch {
				/* ignore */
			}
			timer = setTimeout(tick, POLL_MS);
		};
		timer = setTimeout(tick, POLL_MS);

		return () => {
			clearTimeout(timer);
			cleanupListeners();
		};
	});
</script>

<div class="relative h-screen w-screen overflow-hidden" role="presentation">
	<!-- Task preview card -->
	{#if hovered}
		<div
			bind:this={cardEl}
			class="absolute w-72"
			style="left: {cardOffset.x}px; top: {cardOffset.y}px;"
		>
			<TaskDockCard
				task={hovered}
				onopen={openWorkspaceWindow}
				onprogress={toggleProgress}
				oncomplete={toggleComplete}
				onremove={removeFromDock}
				onclose={() => (hovered = null)}
			/>
		</div>
	{/if}

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

			<div
				class="scrollbar-none flex items-center gap-2.5 {edge === 'top'
					? 'max-w-[168px] flex-row overflow-x-auto'
					: 'max-h-[168px] w-full flex-col overflow-y-auto'}"
			>
				{#each dockStore.tasks as task (task.id)}
					<DockTaskButton {task} {edge} active={hovered?.id === task.id} />
				{/each}

				{#if dockStore.tasks.length === 0}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									class="glass-chip flex size-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:text-on-surface"
									aria-label={dockStore.docked > 0
										? 'No tasks match the dock filters'
										: 'No tasks in the dock'}
									onclick={openWorkspaceWindow}
								>
									<ListTodo size={18} />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side={tooltipSide}>
							{dockStore.docked > 0 ? 'No tasks match the dock filters' : 'No tasks in the dock'}
						</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</div>

			<div
				class={edge === 'top'
					? 'mx-0.5 h-6 w-px bg-surface-container'
					: 'my-0.5 h-px w-6 bg-surface-container'}
			></div>

			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							class="emphasis-container flex size-9 shrink-0 items-center justify-center rounded-2xl text-on-primary-container shadow-md ring-1 ring-inset ring-emphasis-container-ring transition-all hover:scale-105"
							aria-label="Open Tasks"
							onclick={openWorkspaceWindow}
						>
							<Plus size={19} class="relative" />
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side={tooltipSide}>Open Tasks</Tooltip.Content>
			</Tooltip.Root>
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
