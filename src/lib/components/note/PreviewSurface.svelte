<script lang="ts">
	import { hydrateMermaid } from '$lib/content/mermaid-viewer';
	import type { TocEntry } from '$lib/content/preview-toc';
	import TocPanel from '$lib/components/note/TocPanel.svelte';
	import TocToggle from '$lib/components/note/TocToggle.svelte';

	/**
	 * The rendered preview as a scroll surface, shared by the workspace editor and
	 * the note window: the markdown body plus the table-of-contents overlay and
	 * its toggle. The panel's open/closed state is local UI state; the parent owns
	 * the outline (`entries`/`active`) and the scroll/click wiring.
	 */
	let {
		html,
		entries,
		active = -1,
		bodyClass = '',
		paneClass = 'px-5 py-4',
		scrollClass = 'scrollbar-none',
		placeholder,
		previewEl = $bindable(),
		onscroll,
		onclick,
		ontocselect
	}: {
		html: string;
		entries: TocEntry[];
		active?: number;
		bodyClass?: string;
		paneClass?: string;
		/** Scrollbar treatment for the preview pane; defaults to hidden. */
		scrollClass?: string;
		placeholder: string;
		previewEl?: HTMLDivElement | undefined;
		onscroll?: () => void;
		onclick: (event: MouseEvent) => void;
		ontocselect: (slug: string) => void;
	} = $props();

	let open = $state(false);
</script>

<TocToggle {open} ontoggle={() => (open = !open)} />

<div class="relative min-h-0">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		bind:this={previewEl}
		class="{scrollClass} h-full overflow-y-auto {paneClass}"
		{onscroll}
		onclick={onclick}
	>
		{#if html}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="markdown-body {bodyClass}" use:hydrateMermaid>{@html html}</div>
		{:else}
			<p class="text-body-sm font-body text-outline">{placeholder}</p>
		{/if}
	</div>
	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="absolute inset-y-0 right-0 z-20 flex p-2">
			<TocPanel {entries} {active} onselect={ontocselect} onclose={() => (open = false)} />
		</div>
	{/if}
</div>
