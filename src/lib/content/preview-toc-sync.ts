import { activeTocIndex, cleanHeadingText, tocFromHtml, type TocEntry, type TocOffset } from '$lib/content/preview-toc';

const HEADING_SELECTOR = 'h1, h2, h3, h4';

/** Outline of a rendered preview: digest headings, or the DOM as a fallback. */
export function outlineFor(root: HTMLElement, html: string): TocEntry[] {
	const digest = tocFromHtml(html);
	if (digest.length) return digest;
	return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map((heading) => ({
		level: Number(heading.tagName.slice(1)),
		text: cleanHeadingText(heading.textContent ?? ''),
		slug: heading.id,
	}));
}

/** Heading ids that can anchor an outline: body headings, not Mermaid labels. */
export function anchorHeadings(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).filter(
		(heading) => heading.id !== '' && heading.closest('.mermaid-diagram') === null,
	);
}

/** Each heading's offset from the top of the scroll container. */
export function headingOffsets(root: HTMLElement, headings: HTMLElement[]): TocOffset[] {
	const top = root.getBoundingClientRect().top;
	return headings.map((heading) => ({
		slug: heading.id,
		top: heading.getBoundingClientRect().top - top,
	}));
}

/**
 * Keeps an outline's active index in step with a scroll container. Returns a
 * cleanup function; nothing is read until `sync` runs.
 */
export function trackPreviewHeadings(root: HTMLElement, sync: (index: number) => void): () => void {
	const headings = anchorHeadings(root);
	let frame = 0;

	const run = () => {
		frame = 0;
		sync(activeTocIndex(headingOffsets(root, headings), 0));
	};

	// Scroll fires far more often than the active heading can change, so the
	// measurement waits for the next frame instead of running per event.
	const onScroll = () => {
		if (frame) return;
		frame = requestAnimationFrame(run);
	};

	run();
	root.addEventListener('scroll', onScroll, { passive: true });
	return () => {
		if (frame) cancelAnimationFrame(frame);
		root.removeEventListener('scroll', onScroll);
	};
}

/** Scrolls the heading into view, clamped to the container instead of the page. */
export function scrollPreviewToHeading(root: HTMLElement, id: string): void {
	if (!id) return;
	const target = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
	if (!target) return;
	root.scrollTop = Math.max(0, root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top);
}
