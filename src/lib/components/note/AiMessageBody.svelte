<script lang="ts">
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import { handlePreviewAction } from '$lib/content/preview-actions';

	/**
	 * Renders assistant text as sanitized Markdown, using the exact pipeline the
	 * note preview uses (`renderNoteHtml` → `renderNotePreviewHtml`). Wiki links
	 * the assistant writes are clickable, so a reply can route straight to a
	 * note or task.
	 *
	 * While `streaming` is true it shows the raw text so partial output does not
	 * flicker through a re-render on every token; the finished reply is rendered
	 * once the stream ends.
	 */
	let {
		content,
		streaming = false,
		onwikilink,
		class: className = ''
	}: {
		content: string;
		streaming?: boolean;
		/** Called when a `[[wiki link]]` in the reply is clicked. */
		onwikilink?: (click: WikiClick) => void;
		class?: string;
	} = $props();

	let html = $state('');
	let bodyEl = $state<HTMLDivElement | null>(null);

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

	/** Routes a click on a wiki link (or a copy action) the same way the editor does. */
	async function onBodyClick(event: MouseEvent) {
		if (!bodyEl) return;
		if (await handlePreviewAction(event, bodyEl)) return;
		const wikiClick = wikiClickFromTarget(event.target, bodyEl);
		if (wikiClick) {
			event.preventDefault();
			onwikilink?.(wikiClick);
		}
	}
</script>

{#if html}
	<!-- Sanitized by renderNoteHtml (DOMPurify); same trust boundary as the note preview. -->
	<div bind:this={bodyEl} class={className} onclick={onBodyClick} role="presentation">{@html html}</div>
{:else}
	<div class="{className} whitespace-pre-wrap">{content}</div>
{/if}
