/**
 * Export helpers for Mermaid diagram markup.
 *
 * Diagrams are stored upstream as sanitized SVG *strings*, so the export path
 * has to add the XML namespace and explicit dimensions without touching a live
 * DOM tree.
 */

const SVG_TAG = /<svg\b[^>]*>/i;

function readAttribute(tag: string, name: string): string | null {
	const match = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
	return match ? match[1] : null;
}

function viewBoxSize(tag: string): { width: number; height: number } | null {
	const viewBox = readAttribute(tag, 'viewBox');
	if (!viewBox) return null;
	const parts = viewBox.trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
	return { width: parts[2], height: parts[3] };
}

function numeric(value: string | null): number {
	if (!value) return 0;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Adds `xmlns`, `width` and `height` so the SVG stands alone as a file. */
export function extractSvgText(markup: string): string {
	const match = SVG_TAG.exec(markup);
	if (!match) return markup;

	let attributes = match[0];
	if (!/\sxmlns\s*=/i.test(attributes)) {
		attributes = attributes.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
	}

	const box = viewBoxSize(attributes);
	const hasWidth = numeric(readAttribute(attributes, 'width')) > 0;
	const hasHeight = numeric(readAttribute(attributes, 'height')) > 0;

	const additions: string[] = [];
	if (!hasWidth && box) additions.push(`width="${box.width}"`);
	if (!hasHeight && box) additions.push(`height="${box.height}"`);
	if (additions.length) {
		attributes = attributes.replace(/<svg\b/i, `<svg ${additions.join(' ')}`);
	}

	return markup.replace(match[0], attributes);
}
