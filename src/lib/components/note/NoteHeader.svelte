<script lang="ts">
	import type { Note } from '$lib/content/content';
	import type { SelectOption } from '$lib/components/base';
	import { Button, Input, Select } from '$lib/components/base';
	import AiEditorAssist from '$lib/components/note/AiEditorAssist.svelte';
	import EditorStatus from '$lib/components/workspace/EditorStatus.svelte';
	import NoteTags from '$lib/components/note/NoteTags.svelte';

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
		onapplyai
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
	} = $props();
</script>

<div class="@container flex shrink-0 flex-col gap-2 px-6 pt-1 pb-3">
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
				placeholder="Move to…"
				label="Move note to folder"
				size="sm"
				variant="chip"
				class="max-w-full"
				options={folderOptions}
				onchange={onmovefolder}
			/>
		{/if}
	</div>
	<Input
		variant="bare"
		size="none"
		class="w-full font-headline text-headline-xl font-bold tracking-tight placeholder:text-outline/60"
		placeholder="Untitled note"
		bind:value={title}
		oninput={() => onupdatetitle(title)}
	/>
	<div class="flex flex-wrap items-center gap-1.5">
		<NoteTags tags={note.tags} onchange={onupdatetags} />
		<span class="text-code-sm font-code text-outline">{note.updated}</span>
		<span class="ml-auto flex items-center gap-1.5">
			<AiEditorAssist body={draft} {textarea} onapply={onapplyai} />
			<EditorStatus {note} />
		</span>
	</div>
</div>
