<script lang="ts">
	import type { EditorView } from '$lib/stores/settings.svelte';
	import { Textarea } from '$lib/components/base';
	import WikiLinkPopover from '$lib/components/note/WikiLinkPopover.svelte';
	import { hydrateMermaid } from '$lib/content/mermaid-viewer';
	import type { WikiSuggestion, WikiSuggestionSet } from '$lib/content/wiki-autocomplete';

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
		onhover
	}: {
		view: EditorView;
		draft: string;
		html: string;
		spellcheck: boolean;
		suggestions: WikiSuggestionSet | null;
		activeIndex: number;
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
			placeholder="Start writing. Use the toolbar or shortcuts to format..."
			class="scrollbar-none h-full w-full px-6 py-4 text-on-surface-variant"
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
				placeholder="Write here..."
				class="scrollbar-none h-full w-full overflow-y-auto px-4 py-4 text-on-surface-variant"
				onscroll={oneditorscroll}
			></Textarea>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				bind:this={previewEl}
				class="scrollbar-none h-full overflow-y-auto px-5 py-4"
				onscroll={onpreviewscroll}
				onclick={onpreviewclick}
			>
				{#if html}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="markdown-body" use:hydrateMermaid>{@html html}</div>
				{:else}
					<p class="text-body-sm font-body text-outline">Preview appears here.</p>
				{/if}
			</div>
		</div>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			bind:this={previewEl}
			class="scrollbar-none h-full overflow-y-auto px-6 py-4"
			onclick={onpreviewclick}
		>
			{#if html}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="markdown-body mx-auto max-w-2xl" use:hydrateMermaid>{@html html}</div>
			{:else}
				<p class="text-body-lg font-body text-outline">
					This note is empty. Switch to Write to start composing.
				</p>
			{/if}
		</div>
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
