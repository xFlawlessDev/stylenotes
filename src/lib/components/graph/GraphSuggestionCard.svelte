<script lang="ts">
	import { Link2, Sparkles, TriangleAlert, X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { GraphSuggestion } from '$lib/content/workspace-graph';

	/**
	 * One auto-link suggestion (docs/design/constella-features.md #D7).
	 *
	 * Auto-linking only *proposes*: the card is where the user decides, and
	 * nothing reaches the real graph until they accept. A `contradicts` kind is
	 * shown distinctly, because a conflict is a different claim from a mere
	 * similarity.
	 */
	let {
		suggestion,
		sourceTitle,
		targetTitle,
		onaccept,
		onreject,
	}: {
		suggestion: GraphSuggestion;
		sourceTitle: string;
		targetTitle: string;
		onaccept: (id: string) => void;
		onreject: (id: string) => void;
	} = $props();

	const score = $derived(suggestion.score.toFixed(2));
	const isContradiction = $derived(suggestion.kind === 'contradicts');
</script>

<div
	class="glass-panel flex flex-col gap-2 rounded-2xl px-3 py-2.5 text-on-surface"
	aria-label={isContradiction ? t('graph.contradiction.aria') : t('graph.suggestion.aria')}
>
	<div class="flex items-center gap-2">
		<span
			class="flex size-6 shrink-0 items-center justify-center rounded-full {isContradiction
				? 'bg-error-container/30 text-error'
				: 'bg-tertiary-container text-on-tertiary-container'}"
		>
			{#if isContradiction}
				<TriangleAlert size={13} />
			{:else}
				<Sparkles size={13} />
			{/if}
		</span>
		<span class="flex-1 truncate text-label-md font-label">{sourceTitle}</span>
		<span class="shrink-0 text-label-sm text-on-surface-variant">{score}</span>
	</div>
	<div class="flex items-center gap-2 pl-8 text-label-sm text-on-surface-variant">
		<Link2 size={12} class="shrink-0" />
		<span class="truncate">{targetTitle}</span>
	</div>
	{#if isContradiction && suggestion.reason}
		<p class="pl-8 text-label-sm text-error/90">{suggestion.reason}</p>
	{/if}
	<div class="flex items-center gap-2 pt-0.5">
		<Button variant="tonal" size="sm" class="flex-1" onclick={() => onaccept(suggestion.id)}>
			{t('graph.suggestion.accept')}
		</Button>
		<Button variant="ghost" size="sm" class="flex-1" onclick={() => onreject(suggestion.id)}>
			<X size={13} />
			{t('graph.suggestion.reject')}
		</Button>
	</div>
</div>
