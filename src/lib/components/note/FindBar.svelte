<script lang="ts">
	import { ChevronUp, ChevronDown, Search, X } from '@lucide/svelte';
	import { Button, Input } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * Floating find bar. It owns no matching of its own: `query`, `count`, and
	 * the active index come from the editor, which also handles the keyboard
	 * (Enter/Shift+Enter/Escape) so the caret never leaves the textarea.
	 */
	let {
		open = false,
		query = $bindable(''),
		caseSensitive = $bindable(false),
		activeIndex = 0,
		count = 0,
		onstep,
		onclose
	}: {
		open?: boolean;
		query?: string;
		caseSensitive?: boolean;
		activeIndex?: number;
		count?: number;
		onstep: (direction: 1 | -1) => void;
		onclose: () => void;
	} = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (open) void Promise.resolve().then(() => inputEl?.focus());
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			onstep(event.shiftKey ? -1 : 1);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onclose();
		}
	}
</script>

{#if open}
	<div
		class="glass-solid absolute top-2 right-2 z-30 flex items-center gap-1 rounded-xl border border-outline-variant/30 px-1.5 py-1 shadow-xl"
	>
		<Search size={13} class="shrink-0 text-outline" />
		<Input
			bind:ref={inputEl}
			bind:value={query}
			variant="bare"
			size="sm"
			class="w-40 px-1 text-body-sm"
			placeholder={t('editor.find.placeholder')}
			aria-label={t('editor.find.placeholder')}
			onkeydown={onKeydown}
		/>
		<span class="shrink-0 px-1 text-code-sm font-code tabular-nums text-outline">
			{count ? `${activeIndex + 1}/${count}` : t('editor.find.noResults')}
		</span>
		<Button
			size="icon-xs"
			bare
			class="text-on-surface-variant hover:text-on-surface"
			aria-label={t('editor.find.previous')}
			disabled={!count}
			onclick={() => onstep(-1)}
		>
			<ChevronUp size={14} />
		</Button>
		<Button
			size="icon-xs"
			bare
			class="text-on-surface-variant hover:text-on-surface"
			aria-label={t('editor.find.next')}
			disabled={!count}
			onclick={() => onstep(1)}
		>
			<ChevronDown size={14} />
		</Button>
		<Button
			bare
			size="xs"
			class="px-1 font-code text-code-sm {caseSensitive
				? 'text-primary'
				: 'text-outline hover:text-on-surface'}"
			aria-pressed={caseSensitive}
			aria-label={t('editor.find.caseSensitive')}
			onclick={() => (caseSensitive = !caseSensitive)}
		>
			Aa
		</Button>
		<Button
			size="icon-xs"
			bare
			class="text-on-surface-variant hover:text-on-surface"
			aria-label={t('editor.find.close')}
			onclick={onclose}
		>
			<X size={14} />
		</Button>
	</div>
{/if}
