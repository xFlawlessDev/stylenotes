<script lang="ts">
	import type { Note } from '$lib/content/content';
	import { settings } from '$lib/stores/settings.svelte';

	let { note }: { note: Note } = $props();
</script>

{#if settings.showWordCount}
	<span class="whitespace-nowrap text-code-sm font-code text-outline">
		{note.words} words · {note.chars} chars
	</span>
{/if}
