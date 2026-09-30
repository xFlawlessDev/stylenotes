<script lang="ts">
	import { Sparkles, X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { GraphSuggestion } from '$lib/content/workspace-graph';
	import GraphSuggestionCard from '$lib/components/graph/GraphSuggestionCard.svelte';

	/**
	 * Auto-link suggestions in a popover (docs/design/constella-features.md #D7).
	 *
	 * The proposals used to sit permanently over the canvas, hiding the graph
	 * they were about. They now open from a count badge in the header, so the
	 * graph stays readable and the queue is there when the user wants it.
	 *
	 * The badge is the caller's (so it can sit in the header row); this component
	 * renders the popover and its dismiss backdrop.
	 */
	let {
		open,
		suggestions,
		sourceTitle,
		targetTitle,
		onaccept,
		onreject,
		onclose,
	}: {
		open: boolean;
		suggestions: GraphSuggestion[];
		/** Resolves an entity title from a suggestion end, for the card labels. */
		sourceTitle: (suggestion: GraphSuggestion) => string;
		targetTitle: (suggestion: GraphSuggestion) => string;
		onaccept: (id: string) => void;
		onreject: (id: string) => void;
		onclose: () => void;
	} = $props();
</script>

{#if open}
	<!-- Backdrop: any click outside the popover closes it. -->
	<div class="absolute inset-0 z-20" role="presentation" onclick={onclose}></div>

	<div
		class="glass-solid absolute top-14 left-3 z-30 flex max-h-[min(480px,calc(100%-96px))] w-76 flex-col overflow-hidden rounded-2xl text-on-surface shadow-xl"
		role="dialog"
		aria-label={t('graph.suggestion.title')}
	>
		<div class="flex items-center gap-2 border-b border-outline-variant/50 px-3 py-2">
			<Sparkles size={14} class="shrink-0 text-tertiary" />
			<span class="flex-1 text-label-md font-label">{t('graph.suggestion.title')}</span>
			<Button bare size="icon-xs" aria-label={t('graph.suggestion.close')} onclick={onclose}>
				<X size={14} />
			</Button>
		</div>

		<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
			{#each suggestions as item (item.id)}
				<GraphSuggestionCard
					suggestion={item}
					sourceTitle={sourceTitle(item)}
					targetTitle={targetTitle(item)}
					onaccept={onaccept}
					onreject={onreject}
				/>
			{:else}
				<p class="px-2.5 py-4 text-center text-label-md text-on-surface-variant">
					{t('graph.suggestion.empty')}
				</p>
			{/each}
		</div>
	</div>
{/if}
