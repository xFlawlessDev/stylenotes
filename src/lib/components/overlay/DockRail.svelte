<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getCurrentWindow,
		cursorPosition,
		currentMonitor,
		LogicalSize,
		PhysicalPosition,
	} from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import {
		Circle,
		CircleCheck,
		CircleDashed,
		Eye,
		ListTodo,
		PanelRightClose,
		PanelRightOpen,
		Plus,
	} from '@lucide/svelte';
	import { isTauri, openWorkspace } from '$lib/windows';
	import { verticalDrag } from '$lib/drag';
	import { persistTask, refreshTasks, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import {
		settings,
		refreshSettings,
		applySettingsSnapshot,
		SETTINGS_CHANGED,
		type Settings,
	} from '$lib/stores/settings.svelte';
	import {
		applyTaskPatch,
		matchesOverlayFilter,
		overlayTasks,
		sortOverlayTasks,
		taskPriority,
		taskStatus,
		type Task,
		type TaskPriority,
		type TaskStatus,
	} from '$lib/stores/tasks';
	import TaskDockCard from '$lib/components/overlay/TaskDockCard.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	const statusIcons: Record<TaskStatus, typeof Circle> = {
		todo: Circle,
		doing: CircleDashed,
		review: Eye,
		done: CircleCheck,
	};

	const priorityBar: Record<TaskPriority, string> = {
		low: 'bg-outline',
		medium: 'bg-secondary',
		high: 'bg-error',
	};

	const priorityText: Record<TaskPriority, string> = {
		low: 'text-on-surface-variant',
		medium: 'text-secondary',
		high: 'text-error',
	};

	const RAIL_W = 60;
	const WINDOW_W = 360;
	const WINDOW_H = 304;
	const CARD_H = 280;
	const MIN_W = 28;
	const MIN_H = 96;
	const POLL_MS = 40;

	let dockTasks = $state<Task[]>([]);
	let dockedCount = $state(0);
	let hovered = $state<Task | null>(null);
	let cardTop = $state(8);
	let railEl: HTMLElement | undefined = $state();
	let cardEl: HTMLElement | undefined = $state();
	let ignoring = false;
	let dragging = false;
	let collapsed = $state(false);
	let loadToken = 0;
	let loadedTasks: Task[] = [];

	function applyDockFilters() {
		const docked = overlayTasks(loadedTasks);
		dockedCount = docked.length;
		dockTasks = sortOverlayTasks(
			docked.filter((task) =>
				matchesOverlayFilter(task, {
					status: settings.overlayStatus,
					priority: settings.overlayPriority,
				})
			),
			settings.overlaySort
		);
		if (hovered && !dockTasks.some((item) => item.id === hovered?.id)) hovered = null;
	}

	async function loadTasks() {
		const token = ++loadToken;
		await refreshSettings();
		const tasks = await refreshTasks();
		if (token !== loadToken) return;
		loadedTasks = tasks;
		applyDockFilters();
	}

	async function toggleProgress(task: Task) {
		const next = applyTaskPatch(task, {
			status: taskStatus(task) === 'doing' ? 'todo' : 'doing',
		});
		dockTasks = dockTasks.map((item) => (item.id === task.id ? next : item));
		hovered = next;
		if (!(await persistTask(next))) await loadTasks();
	}

	async function toggleComplete(task: Task) {
		const next = applyTaskPatch(task, {
			status: taskStatus(task) === 'done' ? 'todo' : 'done',
		});
		dockTasks = dockTasks.map((item) => (item.id === task.id ? next : item));
		hovered = next;
		if (!(await persistTask(next))) await loadTasks();
	}

	async function removeFromDock(task: Task) {
		const next = applyTaskPatch(task, { overlay: false });
		dockTasks = dockTasks.filter((item) => item.id !== task.id);
		hovered = null;
		if (!(await persistTask(next))) await loadTasks();
	}

	async function resizeWindow(w: number, h: number) {
		if (!isTauri) return;
		const win = getCurrentWindow();
		const [pos, factor, monitor] = await Promise.all([
			win.outerPosition(),
			win.scaleFactor(),
			currentMonitor(),
		]);
		await win.setSize(new LogicalSize(w, h));
		if (!monitor) return;
		const physW = Math.round(w * factor);
		const physH = Math.round(h * factor);
		const maxY = monitor.position.y + monitor.size.height - physH;
		const y = Math.min(maxY, Math.max(monitor.position.y, pos.y));
		await win.setPosition(
			new PhysicalPosition(monitor.position.x + monitor.size.width - physW, y)
		);
	}

	async function toggleCollapsed() {
		const next = !collapsed;
		collapsed = next;
		if (next) hovered = null;
		await resizeWindow(next ? MIN_W : WINDOW_W, next ? MIN_H : WINDOW_H);
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

	function taskAtPoint(x: number, y: number): { task: Task; top: number } | null {
		if (!railEl) return null;
		const buttons = railEl.querySelectorAll<HTMLElement>('[data-task-id]');
		for (const btn of buttons) {
			const r = btn.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
				const task = dockTasks.find((item) => item.id === btn.dataset.taskId);
				if (task) {
					const top = Math.min(WINDOW_H - CARD_H - 8, Math.max(8, r.top + r.height / 2 - CARD_H / 2));
					return { task, top };
				}
			}
		}
		return null;
	}

	async function openWorkspaceAndClose() {
		await openWorkspace();
		if (isTauri) await getCurrentWindow().hide();
	}

	onMount(() => {
		void loadTasks();

		let unlistenFocus: (() => void) | undefined;
		let unlistenTasks: (() => void) | undefined;
		let unlistenSettings: (() => void) | undefined;
		let unlistenBrowser: (() => void) | undefined;

		if (isTauri) {
			void getCurrentWindow()
				.onFocusChanged(({ payload: focused }) => {
					if (focused) void loadTasks();
				})
				.then((fn) => (unlistenFocus = fn));
			void listen(TASKS_CHANGED, () => void loadTasks()).then((fn) => (unlistenTasks = fn));
			void listen<Settings>(SETTINGS_CHANGED, (event) => {
				applySettingsSnapshot(event.payload);
				applyDockFilters();
			}).then((fn) => (unlistenSettings = fn));
		} else {
			const onFocus = () => void loadTasks();
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
					getCurrentWindow().scaleFactor(),
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
							cardTop = hit.top;
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
			style="right: 52px; top: {cardTop}px;"
		>
			<TaskDockCard
				task={hovered}
				onopen={openWorkspaceAndClose}
				onprogress={toggleProgress}
				oncomplete={toggleComplete}
				onremove={removeFromDock}
				onclose={() => (hovered = null)}
			/>
		</div>
	{/if}

	<!-- Rail (full) -->
	{#if !collapsed}
		<div
			bind:this={railEl}
			class="absolute top-3 right-0 flex flex-col items-center gap-2.5 rounded-l-2xl bg-surface-container-lowest/90 py-3 shadow-2xl backdrop-blur-2xl"
			style="width: {RAIL_W}px;"
		>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							use:verticalDrag={{
								onClick: toggleCollapsed,
								onStateChange: (value) => (dragging = value),
							}}
							class="glass-chip flex size-6 cursor-grab touch-none items-center justify-center rounded-lg text-on-surface-variant transition-all hover:text-on-surface active:cursor-grabbing"
							aria-label="Minimize to edge"
							onclick={(event) => {
								// Pointer presses are resolved by the drag action (click vs
								// drag); keyboard and assistive tech report detail 0.
								if (event.detail === 0) void toggleCollapsed();
							}}
						>
							<PanelRightClose size={14} />
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Click to minimize · drag to move</Tooltip.Content>
			</Tooltip.Root>

			<div
				class="flex max-h-[168px] w-full flex-col items-center gap-2.5 overflow-y-auto scrollbar-none"
			>
				{#each dockTasks as task (task.id)}
					{@const Icon = statusIcons[taskStatus(task)]}
					{@const priority = taskPriority(task)}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									data-task-id={task.id}
									class="glass-chip group relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-all {hovered?.id ===
									task.id
										? 'scale-105 ring-1 ring-inset ring-primary/60'
										: 'hover:scale-105 hover:text-on-surface'}"
									aria-label={task.title}
								>
									<Icon size={19} class={priorityText[priority]} />
									{#if hovered?.id === task.id}
										<span
											class="absolute top-0.5 right-0 h-8 w-1.5 rounded-l {priorityBar[
												priority
											]}"
										></span>
									{:else}
										<span
											class="absolute top-1 right-0 h-7 w-1 rounded-l {priorityBar[
												priority
											]}"
										></span>
									{/if}
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="left">{task.title}</Tooltip.Content>
					</Tooltip.Root>
				{/each}

				{#if dockTasks.length === 0}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									class="glass-chip flex size-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:text-on-surface"
									aria-label={dockedCount > 0
										? 'No tasks match the dock filters'
										: 'No tasks in the dock'}
									onclick={openWorkspaceAndClose}
								>
									<ListTodo size={18} />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="left">
							{dockedCount > 0 ? 'No tasks match the dock filters' : 'No tasks in the dock'}
						</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</div>

			<div class="my-0.5 h-px w-6 bg-surface-container"></div>

			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							class="emphasis-container flex size-9 shrink-0 items-center justify-center rounded-2xl text-on-primary-container shadow-md ring-1 ring-inset ring-emphasis-container-ring transition-all hover:scale-105"
							aria-label="Open Tasks"
							onclick={openWorkspaceAndClose}
						>
							<Plus size={19} class="relative" />
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="left">Open Tasks</Tooltip.Content>
			</Tooltip.Root>
		</div>
	{:else}
		<!-- Collapsed minimal tab -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						bind:this={railEl}
						use:verticalDrag={{
							onClick: toggleCollapsed,
							onStateChange: (value) => (dragging = value),
						}}
						class="absolute top-0 right-0 flex h-full w-full cursor-grab touch-none items-center justify-center rounded-l-xl bg-surface-container-lowest/90 text-on-surface-variant shadow-2xl backdrop-blur-2xl transition-colors hover:text-primary active:cursor-grabbing"
						aria-label="Expand dock"
						onclick={(event) => {
							// Pointer presses are resolved by the drag action (click vs drag);
							// keyboard and assistive tech report detail 0.
							if (event.detail === 0) void toggleCollapsed();
						}}
					>
						<PanelRightOpen size={15} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="left">Expand dock</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>
