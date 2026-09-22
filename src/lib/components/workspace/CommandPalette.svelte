<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Search,
		FileText,
		Folder,
		CornerDownLeft,
		ArrowUp,
		ArrowDown,
		ListTodo,
	} from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder as FolderType } from '$lib/stores/notes';
	import { Button, Input } from '$lib/components/base';
	import { statusMeta, taskStatus, matchesTaskQuery, type Task } from '$lib/stores/tasks';

	type Action = {
		id: string;
		label: string;
		hint?: string;
		icon: typeof Search;
		run: () => void;
	};

	let {
		open = false,
		notes,
		tasks,
		folders,
		actions,
		onselectnote,
		onselecttask,
		onselectfolder,
		onclose,
	}: {
		open?: boolean;
		notes: Note[];
		tasks: Task[];
		folders: FolderType[];
		actions: Action[];
		onselectnote: (id: string) => void;
		onselecttask: (id: string) => void;
		onselectfolder: (id: string) => void;
		onclose: () => void;
	} = $props();

	type Item = {
		id: string;
		group: 'Notes' | 'Tasks' | 'Folders' | 'Actions';
		label: string;
		hint?: string;
		icon: typeof Search;
		run: () => void;
	};

	let query = $state('');
	let activeIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement>();

	const items = $derived.by<Item[]>(() => {
		const q = query.trim().toLowerCase();

		const noteItems: Item[] = notes
			.filter((note) => {
				if (!q) return true;
				return `${note.title} ${note.tags.join(' ')} ${note.excerpt}`.toLowerCase().includes(q);
			})
			.slice(0, 6)
			.map((note) => ({
				id: `note:${note.id}`,
				group: 'Notes' as const,
				label: note.title || 'Untitled note',
				hint: note.folder,
				icon: FileText,
				run: () => {
					onselectnote(note.id);
					onclose();
				},
			}));

		const taskItems: Item[] = tasks
			.filter((task) => matchesTaskQuery(task, q))
			.slice(0, 5)
			.map((task) => ({
				id: `task:${task.id}`,
				group: 'Tasks' as const,
				label: task.title || 'Untitled task',
				hint: statusMeta[taskStatus(task)].label,
				icon: ListTodo,
				run: () => {
					onselecttask(task.id);
					onclose();
				},
			}));

		const folderItems: Item[] = folders
			.filter((folder) => !q || folder.label.toLowerCase().includes(q))
			.slice(0, 4)
			.map((folder) => ({
				id: `folder:${folder.id}`,
				group: 'Folders' as const,
				label: folder.label,
				hint: `${folder.count}`,
				icon: Folder,
				run: () => {
					onselectfolder(folder.id);
					onclose();
				},
			}));

		const actionItems: Item[] = actions
			.filter((action) => !q || action.label.toLowerCase().includes(q))
			.map((action) => ({
				id: `action:${action.id}`,
				group: 'Actions' as const,
				label: action.label,
				hint: action.hint,
				icon: action.icon,
				run: () => {
					action.run();
					onclose();
				},
			}));

		return [...noteItems, ...taskItems, ...folderItems, ...actionItems];
	});

	const grouped = $derived.by(() => {
		const order: Item['group'][] = ['Notes', 'Tasks', 'Folders', 'Actions'];
		return order
			.map((group) => ({ group, items: items.filter((item) => item.group === group) }))
			.filter((section) => section.items.length > 0);
	});

	$effect(() => {
		if (open) {
			query = '';
			activeIndex = 0;
			tick(() => inputEl?.focus());
		}
	});

	$effect(() => {
		if (activeIndex >= items.length) activeIndex = Math.max(0, items.length - 1);
	});

	$effect(() => {
		// Reading `items` and `activeIndex` is what makes this re-run on every
		// arrow press and keystroke — without them it only ran when the list mounted.
		const results = items;
		const index = activeIndex;
		if (!open || results.length === 0) return;
		const el = listEl?.querySelector<HTMLElement>(`[data-index="${index}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	});

	function tick(callback: () => void) {
		requestAnimationFrame(callback);
	}

	function move(delta: number) {
		if (!items.length) return;
		activeIndex = (activeIndex + delta + items.length) % items.length;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			items[activeIndex]?.run();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	onMount(() => {
		const onGlobal = (event: KeyboardEvent) => {
			if (open && event.key === 'Escape') onclose();
		};
		window.addEventListener('keydown', onGlobal);
		return () => window.removeEventListener('keydown', onGlobal);
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
		<button
			class="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
			aria-label="Close command palette"
			onclick={onclose}
		></button>

		<div
			class="glass-solid relative flex max-h-[62vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl max-sm:max-h-[80vh]"
			role="dialog"
			aria-modal="true"
		>
			<div class="flex items-center gap-3 px-4 py-3">
				<Search size={17} class="shrink-0 text-outline" />
				<Input
					variant="bare"
					size="sm"
					bind:ref={inputEl}
					bind:value={query}
					onkeydown={onkeydown}
					class="h-6 px-0 text-body-lg"
					placeholder="Search notes, tasks, folders, and actions"
					spellcheck="false"
				/>
				<kbd class="glass-chip shrink-0 rounded-md px-1.5 py-0.5 text-code-sm font-code text-outline"
					>Esc</kbd
				>
			</div>

			<div class="glass-divider h-px"></div>

			<div bind:this={listEl} class="scrollbar-none flex-1 overflow-y-auto p-2">
				{#if items.length === 0}
					<p class="px-3 py-8 text-center text-body-sm font-body text-outline">
						No results for “{query}”.
					</p>
				{/if}

				{#each grouped as section (section.group)}
					<div class="mb-1">
						<p class="px-3 py-1.5 text-label-sm font-label tracking-wider text-outline uppercase">
							{section.group}
						</p>
						{#each section.items as item (item.id)}
							{@const index = items.indexOf(item)}
							{@const Icon = item.icon}
							<Button
								bare
								data-index={index}
								class="w-full gap-3 rounded-xl px-3 py-2 text-left {index === activeIndex
									? 'glass-chip text-on-surface'
									: 'text-on-surface-variant hover:bg-surface-container/50'}"
								onmouseenter={() => (activeIndex = index)}
								onclick={item.run}
							>
								<Icon size={16} class="shrink-0 {index === activeIndex ? 'text-primary' : 'text-outline'}" />
								<span class="flex-1 truncate text-body-md font-body">{item.label}</span>
								{#if item.hint}
									<span class="shrink-0 text-code-sm font-code capitalize text-outline">{item.hint}</span>
								{/if}
							</Button>
						{/each}
					</div>
				{/each}
			</div>

			<div class="glass-divider h-px"></div>

			<div
				class="flex items-center gap-4 px-4 py-2 text-code-sm font-code text-outline [&>span]:flex [&>span]:items-center [&>span]:gap-1"
			>
				<span><ArrowUp size={13} /><ArrowDown size={13} /> navigate</span>
				<span><CornerDownLeft size={13} /> open</span>
				<span>Esc close</span>
			</div>
		</div>
	</div>
{/if}