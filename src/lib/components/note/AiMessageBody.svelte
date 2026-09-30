<script lang="ts">
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import { handlePreviewAction } from '$lib/content/preview-actions';
	import { handleExternalLink } from '$lib/content/external-links';
	import { hydrateMermaid } from '$lib/content/mermaid-viewer';
	import { citationAt, linkCiteMarkers, type CitationSource } from '$lib/content/ai-citations';

	/**
	 * Renders assistant text as sanitized Markdown, using the exact pipeline the
	 * note preview uses (`renderNoteHtml` → `renderNotePreviewHtml`). Wiki links
	 * the assistant writes are clickable, so a reply can route straight to a
	 * note or task, and external links open in the user's default browser.
	 *
	 * Inline `[n]` citation markers are rewritten to anchors before rendering
	 * when `sources` is supplied; a click routes to the matching source rather
	 * than navigating. A marker with no matching source is left as text.
	 *
	 * While `streaming` is true it shows the raw text so partial output does not
	 * flicker through a re-render on every token; the finished reply is rendered
	 * once the stream ends.
	 */
	let {
		content,
		streaming = false,
		onwikilink,
		oncitation,
		sources = [],
		class: className = ''
	}: {
		content: string;
		streaming?: boolean;
		/** Called when a `[[wiki link]]` in the reply is clicked. */
		onwikilink?: (click: WikiClick) => void;
		/** Called when an inline `[n]` marker is clicked. */
		oncitation?: (source: CitationSource) => void;
		/** The turn's sources; enables inline-marker linking when non-empty. */
		sources?: CitationSource[];
		class?: string;
	} = $props();

	let html = $state('');
	let bodyEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const source = content;
		const live = streaming;
		const cited = sources;
		let cancelled = false;

		if (live || !source) {
			html = '';
			return;
		}

		const markdown = cited.length ? linkCiteMarkers(source, cited) : source;
		void renderNoteHtml(markdown)
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
		if (handleExternalLink(event, bodyEl)) return;
		if (routeCitation(event)) return;
		const wikiClick = wikiClickFromTarget(event.target, bodyEl);
		if (wikiClick) {
			event.preventDefault();
			onwikilink?.(wikiClick);
		}
	}

	/** Handles a click on an inline `[n]` anchor, if there is one. */
	function routeCitation(event: MouseEvent): boolean {
		if (!(event.target instanceof Element) || !bodyEl) return false;
		const anchor = event.target.closest<HTMLAnchorElement>('a.cite-marker[data-cite]');
		if (!anchor || !bodyEl.contains(anchor)) return false;
		const number = Number(anchor.dataset.cite);
		const source = citationAt(sources, number);
		if (!source) return false;
		event.preventDefault();
		oncitation?.(source);
		return true;
	}
</script>

{#if html}
	<!-- Sanitized by renderNoteHtml (DOMPurify); same trust boundary as the note preview. -->
	<div bind:this={bodyEl} class={className} onclick={onBodyClick} role="presentation" use:hydrateMermaid>{@html html}</div>
{:else}
	<div class="{className} whitespace-pre-wrap">{content}</div>
{/if}
