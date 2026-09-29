import MarkdownIt from 'markdown-it';

/**
 * Click-to-edit for the preview surface.
 *
 * `renderNoteHtml` and this module parse the same source through the same
 * processable tokens (`fence`, `heading`, `list`, `table`, `blockquote`, …),
 * but the rendered HTML is a flat string. Re-parsing here recovers the source
 * line ranges `token.map` carries, so a rendered block can be tied back to the
 * exact source lines it came from — which markdown-it does not expose in HTML.
 */
const mappingParser = new MarkdownIt({ html: true, linkify: false });

const TAG = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;
const SELF_CLOSING = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

export type LineBlock = { start: number; end: number; editable: boolean };

/** Block containers whose source lines can be opened in the inline editor. */
const EDITABLE_BLOCK = /^(heading|paragraph|blockquote|bullet_list|ordered_list|table)(_open)?$/;

/**
 * Source line ranges of the top-level blocks, in document order. `renderNoteHtml`
 * renders the same tokens in the same order, so the Nth range here is the Nth
 * top-level HTML element there.
 */
export function sourceLineBlocks(source: string): LineBlock[] {
	const tokens = mappingParser.parse(source, {});
	const blocks: LineBlock[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token.block || token.level !== 0) continue;
		const map = token.map;
		if (!map) continue;
		blocks.push({ start: map[0], end: map[1], editable: EDITABLE_BLOCK.test(token.type) });
	}
	return blocks;
}

/** Text left outside any block markup is its own flow block, if it has content. */
function pushLoose(
	ranges: { start: number; end: number; line?: LineBlock }[],
	html: string,
	from: number,
	to: number,
): void {
	if (to <= from || !html.slice(from, to).trim()) return;
	ranges.push({ start: from, end: to });
}

function topLevelRanges(
	html: string,
): { start: number; end: number; line?: LineBlock }[] {
	const ranges: { start: number; end: number; line?: LineBlock }[] = [];
	const stack: { name: string; start: number }[] = [];
	let cursor = 0;
	let index = 0;

	while (index < html.length) {
		if (html[index] !== '<') {
			index += 1;
			continue;
		}
		if (html.startsWith('<!--', index)) {
			const close = html.indexOf('-->', index + 4);
			index = close < 0 ? html.length : close + 3;
			continue;
		}

		TAG.lastIndex = index;
		const match = TAG.exec(html);
		if (!match || match.index !== index) {
			index += 1;
			continue;
		}

		const raw = match[0];
		const name = match[2].toLowerCase();
		const end = index + raw.length;
		const closing = match[1] === '/';

		if (closing) {
			if (stack.length === 0) {
				index = end;
				continue;
			}
			const frame = stack.pop()!;
			if (stack.length === 0) {
				ranges.push({ start: frame.start, end });
				cursor = end;
			}
			index = end;
			continue;
		}

		const selfClose = match[3].length > 0 || SELF_CLOSING.has(name);
		if (selfClose) {
			if (stack.length === 0) {
				pushLoose(ranges, html, cursor, index);
				ranges.push({ start: index, end });
				cursor = end;
			}
			index = end;
			continue;
		}

		if (stack.length === 0) {
			// Text sitting between the previous block and this tag is its own
			// markdown-it output block (a bare text run); keep it in the walk.
			pushLoose(ranges, html, cursor, index);
		}
		stack.push({ name, start: index });
		index = end;
	}

	if (stack.length > 0) {
		const first = stack[0].start;
		pushLoose(ranges, html, cursor, first);
		ranges.push({ start: first, end: html.length });
	} else {
		pushLoose(ranges, html, cursor, html.length);
	}
	return ranges;
}

/**
 * Tags a rendered preview with `data-line-block` (the source line block each
 * visible block came from) when the pairs line up. Mismatched documents are
 * returned untouched so the preview never points at the wrong line.
 */
export function annotatePreviewLines(html: string, source: string): string {
	const ranges = topLevelRanges(html);
	const blocks = sourceLineBlocks(source);
	if (ranges.length === 0 || blocks.length === 0) return html;

	const limit = Math.min(ranges.length, blocks.length);
	let usable = 0;
	for (let position = 0; position < limit; position += 1) {
		ranges[position].line = blocks[position];
		if (blocks[position].editable) usable += 1;
	}
	if (usable === 0) return html;
	ranges.length = limit;

	// Walk backwards so the HTML offsets stay valid as tags are inserted.
	let output = html;
	for (let position = ranges.length - 1; position >= 0; position -= 1) {
		const range = ranges[position];
		const line = range.line;
		if (!line?.editable) continue;
		const opening = /^<([a-z][a-z0-9]*)\b[^>]*?(\/?)>/i.exec(output.slice(range.start, range.start + 64));
		if (!opening) continue;
		const attr = ` data-line-block="${line.start}:${line.end}"`;
		const insertAt = range.start + opening[0].length - 1;
		output = output.slice(0, insertAt) + attr + output.slice(insertAt);
	}
	return output;
}

function parseBlockAttribute(value: string | undefined): LineBlock | null {
	if (!value) return null;
	const [start, end] = value.split(':', 2).map(Number);
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null;
	return { start, end, editable: true };
}

/** The source line block wrapped by a click inside the preview, if any. */
export function previewLineBlockFromTarget(target: EventTarget | null, root: HTMLElement): LineBlock | null {
	if (!(target instanceof Element)) return null;
	const element = target.closest<HTMLElement>('[data-line-block]');
	if (!element || !root.contains(element)) return null;
	return parseBlockAttribute(element.dataset.lineBlock);
}

/** Whether a click inside a block should open the inline editor. */
export function isEditablePreviewClick(target: EventTarget | null, root: HTMLElement): boolean {
	if (!(target instanceof Element)) return false;
	if (target.closest('a, button, input, textarea, select, [data-preview-action]')) return false;
	return !!previewLineBlockFromTarget(target, root);
}
