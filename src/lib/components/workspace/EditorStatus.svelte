<script lang="ts">
	import type { Note } from '$lib/content/content';
	import { settings } from '$lib/stores/settings.svelte';
	import { t } from '$lib/i18n/index.svelte';

	let { note }: { note: Note } = $props();
</script>

{#if settings.showWordCount}
	<span class="whitespace-nowrap text-code-sm font-code text-outline">
		{t('editor.status.wordsChars', { words: note.words, chars: note.chars })}
	</span>
{/if}
