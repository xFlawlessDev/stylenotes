<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { settings } from '$lib/stores/settings.svelte';

	let { note }: { note: Note } = $props();
</script>

<div class="flex items-center gap-2 text-code-sm font-code text-outline">
	{#if settings.showWordCount}
		<span class="hidden whitespace-nowrap @[560px]:inline">
			{note.words} words · {note.chars} chars
		</span>
	{/if}
	<span class="flex items-center gap-1.5 whitespace-nowrap text-tertiary" title="Saved locally">
		<Check size={12} />
		Saved locally
	</span>
</div>
