import type { FindMatch } from '$lib/content/find';

/**
 * DOM half of find-in-note: scroll the active match into view in a textarea,
 * and highlight preview occurrences with the CSS Custom Highlight API.
 *
 * Both are decorative. The Custom Highlight path is silently skipped on engines
 * that do not ship it; the active match still scrolls into view.
 */

const ALL = 'stylenotes-find';
const ACTIVE = 'stylenotes-find-active';

type HighlightRegistry = {
	set: (name: string, highlight: unknown) => void;
	delete: (name: string) => void;
};

function registry(): HighlightRegistry | null {
	const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
	return css && css.highlights ? css.highlights : null;
}

function makeHighlight(ranges: Range[]): unknown {
	const Ctor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
	return Ctor ? new Ctor(...ranges) : null;
}

/** Scrolls the textarea so the active match sits about a third from the top. */
export function revealTextareaMatch(textarea: HTMLTextAreaElement, match: FindMatch): void {
	const before = textarea.value.slice(0, match.start);
	const lines = (before.match(/\n/g) ?? []).length;
	const style = getComputedStyle(textarea);
	const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
	const target = lines * lineHeight - textarea.clientHeight / 3;
	const max = textarea.scrollHeight - textarea.clientHeight;
	textarea.scrollTop = Math.max(0, Math.min(target, max));
}

/** Every range where `query` appears in the preview's visible text. */
export function collectPreviewMatches(
	root: HTMLElement,
	query: string,
	caseSensitive: boolean
): Range[] {
	if (!query) return [];
	const ranges: Range[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const tag = node.parentElement?.tagName;
			if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') {
				return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		}
	});

	let node = walker.nextNode();
	while (node) {
		const text = node.nodeValue ?? '';
		const haystack = caseSensitive ? text : text.toLowerCase();
		const needle = caseSensitive ? query : query.toLowerCase();
		let from = 0;
		while (needle && from <= haystack.length - needle.length) {
			const index = haystack.indexOf(needle, from);
			if (index < 0) break;
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + needle.length);
			ranges.push(range);
			from = index + needle.length;
		}
		node = walker.nextNode();
	}
	return ranges;
}

/** Paints the preview highlights (all matches, plus the active one). */
export function paintPreviewMatches(ranges: Range[], activeIndex: number): void {
	const store = registry();
	if (store) {
		if (ranges.length) {
			const all = makeHighlight(ranges);
			if (all) store.set(ALL, all);
		} else {
			store.delete(ALL);
		}

		const activeRange = ranges[activeIndex];
		const active = activeRange ? makeHighlight([activeRange]) : null;
		if (active) store.set(ACTIVE, active);
		else store.delete(ACTIVE);
	}
}

export function clearPreviewHighlights(): void {
	const store = registry();
	store?.delete(ALL);
	store?.delete(ACTIVE);
}

export function scrollPreviewRange(root: HTMLElement, range: Range): void {
	const rect = range.getBoundingClientRect();
	const box = root.getBoundingClientRect();
	if (!rect.height) return;
	const offset = rect.top - box.top + root.scrollTop - root.clientHeight / 3;
	const max = root.scrollHeight - root.clientHeight;
	root.scrollTop = Math.max(0, Math.min(offset, max));
}
