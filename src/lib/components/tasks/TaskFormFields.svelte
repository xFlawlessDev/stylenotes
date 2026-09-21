<script lang="ts">
	import type { Note } from '$lib/content/content';
	import { tick } from 'svelte';
	import type { Folder } from '$lib/stores/notes';
	import {
		TASK_PRIORITIES,
		TASK_STATUSES,
		priorityMeta,
		statusMeta,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import SelectField from '$lib/components/fields/SelectField.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		title = $bindable(''),
		detail = $bindable(''),
		status = $bindable<TaskStatus>('todo'),
		priority = $bindable<TaskPriority>('medium'),
		folder = $bindable('personal'),
		noteId = $bindable(''),
		startDate = $bindable(''),
		dueDate = $bindable(''),
		folders,
		notes,
		idPrefix = 'task',
		autofocus = false,
		compact = false
	}: {
		title?: string;
		detail?: string;
		status?: TaskStatus;
		priority?: TaskPriority;
		folder?: string;
		noteId?: string;
		startDate?: string;
		dueDate?: string;
		folders: Folder[];
		notes: Note[];
		idPrefix?: string;
		autofocus?: boolean;
		compact?: boolean;
	} = $props();

	let titleEl = $state<HTMLInputElement | null>(null);
	let focusedOnce = false;

	const folderOptions = $derived(folders.filter((item) => item.id !== 'all'));

	// Compact mode is for dialogs inside small windows (e.g. the Kanban board).
	const stack = $derived(compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3.5');
	const group = $derived(compact ? 'flex flex-col gap-1' : 'flex flex-col gap-1.5');
	const label = $derived(
		compact
			? 'text-label-sm font-label text-on-surface-variant'
			: 'text-label-md font-label text-on-surface-variant'
	);
	const input = $derived(
		compact
			? 'glass-well h-8 border-0 text-body-sm font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50'
			: 'glass-well h-9 border-0 text-body-md font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50'
	);
	const grid = $derived(compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3');
	const select = $derived(compact ? 'h-8 px-2 text-code-sm font-code' : '');

	$effect(() => {
		if (!autofocus || focusedOnce) return;
		focusedOnce = true;
		void tick().then(() => titleEl?.focus());
	});

	function shortDate(value: string): boolean {
		return !!value && value.length === 10;
	}

	const dateError = $derived(shortDate(startDate) && shortDate(dueDate) && dueDate < startDate);
</script>

<div class={stack}>
	<div class={group}>
		<Label for="{idPrefix}-title" class={label}>Title</Label>
		<Input
			id="{idPrefix}-title"
			bind:ref={titleEl}
			bind:value={title}
			placeholder="What needs doing?"
			class={input}
		/>
	</div>

	<div class={group}>
		<Label for="{idPrefix}-notes" class={label}>
			Details <span class="text-outline">(optional)</span>
		</Label>
		<textarea
			id="{idPrefix}-notes"
			bind:value={detail}
			rows={compact ? 2 : 3}
			placeholder="Context, links, next steps."
			class="glass-well w-full resize-none rounded-lg px-3 text-body-sm font-body text-on-surface placeholder:text-outline focus:border-primary/50 focus:outline-none {compact
				? 'py-1.5'
				: 'py-2'}"
		></textarea>
	</div>

	<div class={grid}>
		<div class={group}>
			<Label class={label}>Status</Label>
			<SelectField
				label="Status"
				size={compact ? 'sm' : 'default'}
				options={TASK_STATUSES.map((value) => ({ value, label: statusMeta[value].label }))}
				bind:value={status}
				class={select}
			/>
		</div>

		<div class={group}>
			<Label class={label}>Priority</Label>
			<SelectField
				label="Priority"
				size={compact ? 'sm' : 'default'}
				options={TASK_PRIORITIES.map((value) => ({ value, label: priorityMeta[value].label }))}
				bind:value={priority}
				class={select}
			/>
		</div>

		<div class={group}>
			<Label for="{idPrefix}-start" class={label}>Start</Label>
			<Input id="{idPrefix}-start" type="date" bind:value={startDate} class={input} />
		</div>

		<div class={group}>
			<Label for="{idPrefix}-due" class={label}>Due</Label>
			<Input id="{idPrefix}-due" type="date" bind:value={dueDate} class={input} />
		</div>
	</div>

	{#if dateError}
		<p class="text-label-sm font-label text-error">The due date cannot precede the start date.</p>
	{/if}

	<div class={grid}>
		<div class={group}>
			<Label class={label}>Folder</Label>
			<SelectField
				label="Folder"
				size={compact ? 'sm' : 'default'}
				options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
				bind:value={folder}
				class={select}
			/>
		</div>

		<div class={group}>
			<Label class={label}>
				Linked note <span class="text-outline">(optional)</span>
			</Label>
			<SelectField
				label="Linked note"
				placeholder="None"
				size={compact ? 'sm' : 'default'}
				options={[
					{ value: '', label: 'None' },
					...notes.map((note) => ({ value: note.id, label: note.title || 'Untitled note' }))
				]}
				bind:value={noteId}
				class={select}
			/>
		</div>
	</div>
</div>
