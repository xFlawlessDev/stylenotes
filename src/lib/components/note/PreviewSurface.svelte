<script lang="ts">
	import { hydrateMermaid } from '$lib/content/mermaid-viewer';
	import type { TocEntry } from '$lib/content/preview-toc';
	import TocPanel from '$lib/components/note/TocPanel.svelte';
	import TocToggle from '$lib/components/note/TocToggle.svelte';
	import { Skeleton } from '$lib/components/base';
	import { cn } from '$lib/utils.js';
	import { t } from '$lib/i18n/index.svelte';

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
		loading = false,
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
		/** Renders placeholder text lines instead of the body, while it renders. */
		loading?: boolean;
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
		{#if loading}
			<div
				class={cn('flex flex-col gap-3', bodyClass)}
				role="status"
				aria-busy="true"
				aria-label={t('common.loading')}
			>
				<Skeleton class="h-6 w-3/5" />
				<Skeleton class="h-3 w-full" />
				<Skeleton class="h-3 w-11/12" />
				<Skeleton class="h-3 w-4/5" />
				<Skeleton class="mt-1 h-5 w-2/5" />
				<Skeleton class="h-3 w-full" />
				<Skeleton class="h-3 w-10/12" />
			</div>
		{:else if html}
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
