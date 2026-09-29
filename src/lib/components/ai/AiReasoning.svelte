<script lang="ts">
	import { Brain, ChevronDown } from '@lucide/svelte';
	import { reasoningLabel } from '$lib/content/ai-trace';

	/**
	 * Collapsible "chain of thought" block.
	 *
	 * Ported from the Svelte AI Elements `Reasoning` component rather than
	 * vendored: no `runed`, no `streamdown-svelte`, and an explicit
	 * `<button>` + `$state` instead of shadcn's `Collapsible`, so it stays
	 * dependency-free and matches the repo's base/ primitives.
	 *
	 * It renders while the tokens arrive and stays put afterwards, so the user
	 * can always reopen what the model was thinking.
	 */
	let {
		content,
		streaming = false,
		/** Measured by the parent, so the header text stays stable on reopen. */
		seconds = 0,
		class: className = ''
	}: {
		content: string;
		streaming?: boolean;
		seconds?: number;
		class?: string;
	} = $props();

	let open = $state(true);

	// Once the answer starts the thought is noise, so close it automatically.
	// Only once: reopening it after that must stick.
	let autoClosed = $state(false);
	$effect(() => {
		if (!streaming && open && !autoClosed && content) {
			autoClosed = true;
			open = false;
		}
	});

	const label = $derived(reasoningLabel(streaming, seconds));
</script>

{#if content}
	<div class="not-prose rounded-xl bg-surface-container-lowest/40 {className}">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-label-sm font-label text-outline transition-colors hover:text-on-surface-variant"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<Brain size={12} class="shrink-0" />
			<span class="flex-1 truncate">{label}</span>
			<ChevronDown
				size={12}
				class="shrink-0 transition-transform {open ? 'rotate-180' : 'rotate-0'}"
			/>
		</button>
		{#if open}
			<div
				class="scrollbar-none max-h-56 overflow-y-auto whitespace-pre-wrap px-2.5 pb-2.5 text-label-sm font-label text-on-surface-variant/80"
			>
				{content}
			</div>
		{/if}
	</div>
{/if}
