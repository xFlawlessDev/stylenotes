<script lang="ts">
	import { tocIndent, type TocEntry } from '$lib/content/preview-toc';
	import { t } from '$lib/i18n/index.svelte';

	let {
		entries = [],
		active = -1,
		onselect,
		onclose
	}: {
		entries?: TocEntry[];
		active?: number;
		onselect: (slug: string) => void;
		onclose: () => void;
	} = $props();

	const indent = $derived(tocIndent(entries.map((entry) => entry.level)));
</script>

<div class="glass-solid mr-1 flex max-h-full min-h-0 flex-col rounded-lg shadow-lg">
	<div class="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
		<span class="text-label-sm font-label tracking-wide text-on-surface-variant uppercase">
			{t('notes.editor.toc.title')}
		</span>
		<button
			type="button"
			class="rounded-md p-0.5 text-outline transition-colors hover:text-on-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			aria-label={t('notes.editor.toc.close')}
			onclick={onclose}
		>
			<svg
				viewBox="0 0 24 24"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<path d="M18 6 6 18M6 6l12 12" />
			</svg>
		</button>
	</div>

	{#if entries.length === 0}
		<p class="px-3 py-2 text-label-md font-body text-outline">{t('notes.editor.toc.empty')}</p>
	{:else}
		<nav class="scrollbar-none min-h-0 overflow-y-auto py-1">
			<ul class="flex flex-col">
				{#each entries as entry, index (entry.slug)}
					<li>
						<button
							type="button"
							class="block w-full truncate rounded-md py-1 pr-3 text-left text-label-md font-body transition-colors {index ===
							active
								? 'bg-primary/10 font-medium text-primary'
								: 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}"
							style="padding-left: {indent[index] * 0.75 + 0.75}rem"
							title={entry.text}
							aria-current={index === active ? 'location' : undefined}
							onclick={() => onselect(entry.slug)}
						>
							{entry.text}
						</button>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
</div>
