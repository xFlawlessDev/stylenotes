<script lang="ts">
	import type { EditorView } from '$lib/stores/settings.svelte';
	import { Textarea } from '$lib/components/base';
	import WikiLinkPopover from '$lib/components/note/WikiLinkPopover.svelte';
	import PreviewSurface from '$lib/components/note/PreviewSurface.svelte';
	import type { TocEntry } from '$lib/content/preview-toc';
	import type { WikiSuggestion, WikiSuggestionSet } from '$lib/content/wiki-autocomplete';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * The editing surface: write, split, or preview. Owns the textarea and
	 * preview element refs (bound up so the parent can restore the caret and
	 * sync scrolling) and forwards the wiki-link popover.
	 */
	let {
		view,
		draft,
		html,
		spellcheck,
		suggestions,
		activeIndex,
		tocEntries = [],
		tocActive = -1,
		textareaEl = $bindable(),
		previewEl = $bindable(),
		oninput,
		onkeydown,
		onkeyup,
		onclickeditor,
		onblur,
		oneditorscroll,
		onpreviewscroll,
		onpreviewclick,
		onchoose,
		onhover,
		ontocselect
	}: {
		view: EditorView;
		draft: string;
		html: string;
		spellcheck: boolean;
		suggestions: WikiSuggestionSet | null;
		activeIndex: number;
		tocEntries?: TocEntry[];
		tocActive?: number;
		textareaEl?: HTMLTextAreaElement | null;
		previewEl?: HTMLDivElement | undefined;
		oninput: (value: string) => void;
		onkeydown: (event: KeyboardEvent) => void;
		onkeyup: (event: KeyboardEvent) => void;
		onclickeditor: () => void;
		onblur: () => void;
		oneditorscroll: () => void;
		onpreviewscroll: () => void;
		onpreviewclick: (event: MouseEvent) => void;
		onchoose: (item: WikiSuggestion) => void;
		onhover: (position: number) => void;
		ontocselect: (slug: string) => void;
	} = $props();

	const open = $derived(!!suggestions?.items.length);
</script>

<div class="relative grid min-h-0 flex-1 overflow-hidden">
	{#if view === 'write'}
		<Textarea
			bind:ref={textareaEl}
			value={draft}
			oninput={(event) => oninput((event.currentTarget as HTMLTextAreaElement).value)}
			{onkeydown}
			{onkeyup}
			onclick={onclickeditor}
			{onblur}
			{spellcheck}
			variant="bare"
			size="lg"
			placeholder={t('notes.editor.writePlaceholder')}
			class="scrollbar-thin h-full w-full px-6 py-4 text-on-surface-variant"
		></Textarea>
	{:else if view === 'split'}
		<div class="grid min-h-0 grid-cols-2 divide-x divide-hairline">
			<Textarea
				bind:ref={textareaEl}
				value={draft}
				oninput={(event) => oninput((event.currentTarget as HTMLTextAreaElement).value)}
				{onkeydown}
				{onkeyup}
				onclick={onclickeditor}
				{onblur}
				{spellcheck}
				variant="bare"
				size="md"
				placeholder={t('notes.editor.splitPlaceholder')}
				class="scrollbar-thin h-full w-full overflow-y-auto px-4 py-4 text-on-surface-variant"
				onscroll={oneditorscroll}
			></Textarea>
			<PreviewSurface
				{html}
				entries={tocEntries}
				active={tocActive}
				placeholder={t('notes.editor.previewHere')}
				paneClass="px-5 py-4"
				scrollClass="scrollbar-thin"
				bind:previewEl
				onscroll={onpreviewscroll}
				onclick={onpreviewclick}
				{ontocselect}
			/>
		</div>
	{:else}
		<PreviewSurface
			{html}
			entries={tocEntries}
			active={tocActive}
			bodyClass="mx-auto max-w-2xl"
			paneClass="px-6 py-4"
			scrollClass="scrollbar-thin"
			placeholder={t('notes.editor.emptyPreview')}
			bind:previewEl
			onclick={onpreviewclick}
			{ontocselect}
		/>
	{/if}

	<WikiLinkPopover
		{open}
		target={textareaEl ?? null}
		items={suggestions?.items ?? []}
		index={activeIndex}
		onselect={onchoose}
		onhover={onhover}
	/>
</div>
