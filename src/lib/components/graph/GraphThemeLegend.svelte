<script lang="ts">
	import { Palette } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { ClusterRecord } from '$lib/db/clusters';
	import { themeClusterCss } from '$lib/components/graph/graph-palette';

	/**
	 * Theme legend (docs/design/constella-features.md #D9).
	 *
	 * Selecting a theme recolours its member nodes on the canvas — the swatch
	 * here is the exact colour they take, because both read `themeClusterCss`.
	 * It does **not** reposition nodes: the graph's "focus means the world steps
	 * back" rule still holds.
	 */
	let {
		themes,
		selected,
		onselect,
		onbuild,
		busy = false,
	}: {
		themes: ClusterRecord[];
		selected: number | null;
		onselect: (clusterId: number | null) => void;
		onbuild: () => void;
		busy?: boolean;
	} = $props();
</script>

<div class="glass-panel flex w-60 flex-col gap-2 rounded-2xl px-4 py-3 text-on-surface-variant">
	<div class="flex items-center justify-between">
		<span class="text-label-sm font-bold tracking-[0.14em] uppercase">
			{t('graph.themes.title')}
		</span>
		<Button variant="ghost" size="icon-xs" aria-label={t('graph.themes.build')} disabled={busy} onclick={onbuild}>
			<Palette size={13} />
		</Button>
	</div>

	{#if themes.length === 0}
		<span class="text-label-sm">{t('graph.themes.empty')}</span>
	{:else}
		<div class="grid gap-0.5">
			{#each themes as theme, index (theme.clusterId)}
				<Button
					variant="ghost"
					size="sm"
					class="h-auto w-full justify-start gap-2.5 rounded-lg px-1.5 py-1 text-label-md {selected ===
					theme.clusterId
						? 'bg-surface-container/60'
						: 'opacity-70'}"
					aria-pressed={selected === theme.clusterId}
					onclick={() => onselect(selected === theme.clusterId ? null : theme.clusterId)}
				>
					<span
						class="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
						style="background: {themeClusterCss(index)}"
					></span>
					<span class="flex-1 truncate text-left">{theme.label}</span>
					<span class="text-on-surface-variant">{theme.members.length}</span>
				</Button>
			{/each}
		</div>
		{#if selected !== null}
			<Button variant="ghost" size="xs" class="self-start text-outline" onclick={() => onselect(null)}>
				{t('graph.themes.clear')}
			</Button>
		{/if}
	{/if}
</div>
