<script lang="ts">
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';

	/**
	 * Renders assistant text as sanitized Markdown, using the exact pipeline the
	 * note preview uses (`renderNoteHtml` → `renderNotePreviewHtml`), minus the
	 * wiki context: chat replies are not tied to the current note graph.
	 *
	 * While `streaming` is true it shows the raw text so partial output does not
	 * flicker through a re-render on every token; the finished reply is rendered
	 * once the stream ends.
	 */
	let {
		content,
		streaming = false,
		class: className = ''
	}: {
		content: string;
		streaming?: boolean;
		class?: string;
	} = $props();

	let html = $state('');

	$effect(() => {
		const source = content;
		const live = streaming;
		let cancelled = false;

		if (live || !source) {
			html = '';
			return;
		}

		void renderNoteHtml(source)
			.then(renderNotePreviewHtml)
			.then((rendered) => {
				if (!cancelled) html = rendered;
			})
			.catch(() => {
				if (!cancelled) html = '';
			});

		return () => {
			cancelled = true;
		};
	});
</script>

{#if html}
	<!-- Sanitized by renderNoteHtml (DOMPurify); same trust boundary as the note preview. -->
	<div class={className}>{@html html}</div>
{:else}
	<div class="{className} whitespace-pre-wrap">{content}</div>
{/if}
