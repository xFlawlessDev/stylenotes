<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { Button, Field, Input } from '$lib/components/base';
	import { normalizeNoteIds } from '$lib/stores/tasks';

	let {
		noteIds = $bindable<string[]>([]),
		notes,
		idPrefix = 'task-note-links',
		compact = false,
		class: className = '',
		labelClass = ''
	}: {
		noteIds?: string[];
		notes: Note[];
		idPrefix?: string;
		compact?: boolean;
		class?: string;
		labelClass?: string;
	} = $props();

	let term = $state('');

	const byId = $derived(new Map(notes.map((note) => [note.id, note])));
	const selected = $derived(normalizeNoteIds(noteIds));
	const suggestions = $derived.by(() => {
		const query = term.trim().toLowerCase();
		if (!query) return [];
		return notes
			.filter((note) => !selected.includes(note.id))
			.filter((note) => (note.title || 'Untitled note').toLowerCase().includes(query))
			.slice(0, 6);
	});

	function labelFor(id: string): string {
		return byId.get(id)?.title || 'Untitled note';
	}

	function add(id: string) {
		if (selected.includes(id)) return;
		noteIds = [...noteIds, id];
		term = '';
	}

	function remove(id: string) {
		noteIds = noteIds.filter((value) => value !== id);
	}
</script>

<Field
	label="Linked notes"
	hint={selected.length ? `${selected.length} linked` : 'optional'}
	class={className}
	{labelClass}
>
	<div class="flex flex-col gap-2">
		{#if selected.length}
			<ul class="flex flex-wrap gap-1.5">
				{#each selected as id (id)}
					<li
						class="flex max-w-full items-center gap-1 rounded-md bg-surface-container-high/60 px-1.5 py-0.5 text-code-sm font-code text-tertiary"
					>
						<span class="max-w-[180px] truncate">{labelFor(id)}</span>
						<Button
							bare
							class="rounded text-outline hover:text-error"
							aria-label="Unlink {labelFor(id)}"
							onclick={() => remove(id)}
						>
							<X size={11} />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="relative">
			<Input
				id="{idPrefix}-search"
				size={compact ? 'md' : 'lg'}
				class={compact ? 'text-body-sm' : ''}
				bind:value={term}
				placeholder={selected.length ? 'Link another note…' : 'Search notes to link…'}
				aria-label="Search notes to link"
			/>
			{#if suggestions.length}
				<ul
					class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-outline-variant/40 bg-surface-container-high p-1 shadow-lg"
				>
					{#each suggestions as note (note.id)}
						<li>
							<Button
								bare
								class="w-full truncate rounded-lg px-2 py-1.5 text-left text-body-sm font-body text-on-surface hover:bg-surface-container"
								onclick={() => add(note.id)}
							>
								{note.title || 'Untitled note'}
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if !notes.length}
			<p class="text-label-sm font-label text-outline">No notes to link yet.</p>
		{/if}
	</div>
</Field>
