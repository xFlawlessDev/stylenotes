<script lang="ts">
	import type { Note } from '$lib/content/content';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import type { SelectOption } from '$lib/components/base';
	import { Button, Input, Select } from '$lib/components/base';
	import AiEditorAssist from '$lib/components/note/AiEditorAssist.svelte';
	import EditorStatus from '$lib/components/workspace/EditorStatus.svelte';
	import NoteTags from '$lib/components/note/NoteTags.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { noteUpdatedLabel } from '$lib/i18n/format';

	/**
	 * The note header: folder chip + move control, the title field, tags, the
	 * updated stamp, the AI affordance and the word/character status.
	 */
	let {
		note,
		title = $bindable(''),
		draft,
		textarea,
		folderLabel,
		folderOptions = [],
		moveFolder = $bindable(''),
		onmovefolder,
		onselectfolder,
		onupdatetitle,
		onupdatetags,
		onapplyai,
		journal,
	}: {
		note: Note;
		title?: string;
		draft: string;
		textarea: HTMLTextAreaElement | null;
		folderLabel: string;
		folderOptions?: SelectOption[];
		moveFolder?: string;
		onmovefolder: (folder: string) => void;
		onselectfolder?: (id: string) => void;
		onupdatetitle: (title: string) => void;
		onupdatetags: (tags: string[]) => void;
		onapplyai: (body: string, caret: number) => void;
		/**
		 * Day navigation for a journal entry. Absent for ordinary notes, so the
		 * header is unchanged for every note that is not a journal.
		 */
		journal?: { previous: string | null; next: string | null; onstep: (day: string) => void };
	} = $props();
</script>

<div data-ui="note-header" class="@container flex shrink-0 flex-col gap-2 px-6 pt-1 pb-3">
	<div class="flex flex-wrap items-center gap-2">
		<Button
			bare
			class="w-fit max-w-full truncate text-label-sm tracking-wide text-primary capitalize hover:brightness-110"
			onclick={() => onselectfolder?.(note.folder)}
		>
			{folderLabel}
		</Button>
		{#if folderOptions.length}
			<Select
				bind:value={moveFolder}
				placeholder={t('notes.editor.moveTo')}
				label={t('notes.editor.moveNote')}
				size="sm"
				variant="chip"
				class="max-w-full"
				options={folderOptions}
				onchange={onmovefolder}
			/>
		{/if}
		{#if journal}
			<span class="ml-auto flex items-center gap-0.5">
				<Button
					size="icon-xs"
					bare
					class="text-outline hover:text-primary disabled:opacity-30"
					disabled={!journal.previous}
					aria-label={t('notes.journal.previous')}
					onclick={() => journal.previous && journal.onstep(journal.previous)}
				>
					<ChevronLeft size={14} />
				</Button>
				<Button
					size="icon-xs"
					bare
					class="text-outline hover:text-primary disabled:opacity-30"
					disabled={!journal.next}
					aria-label={t('notes.journal.next')}
					onclick={() => journal.next && journal.onstep(journal.next)}
				>
					<ChevronRight size={14} />
				</Button>
			</span>
		{/if}
	</div>
	<Input
		variant="bare"
		size="none"
		class="w-full font-headline text-headline-xl font-bold tracking-tight placeholder:text-outline/60"
		placeholder={t('notes.editor.titlePlaceholder')}
		bind:value={title}
		oninput={() => onupdatetitle(title)}
	/>
	<div class="flex flex-wrap items-center gap-1.5">
		<NoteTags tags={note.tags} onchange={onupdatetags} />
		<span class="text-code-sm font-code text-outline">{noteUpdatedLabel(note)}</span>
		<span class="ml-auto flex items-center gap-1.5">
			<AiEditorAssist body={draft} {textarea} onapply={onapplyai} />
			<EditorStatus {note} />
		</span>
	</div>
</div>
