const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'];

export function fileNameFromPath(path: string): string {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1] || path;
}

export function fileExtension(path: string): string {
	const name = fileNameFromPath(path);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.includes(fileExtension(path));
}

/** Returns the filesystem path for a local src, or null for web/data URLs. */
export function localFilePath(src: string): string | null {
	if (!src) return null;
	if (/^file:\/\//i.test(src)) {
		try {
			let path = decodeURIComponent(new URL(src).pathname);
			if (/^\/[a-zA-Z]:\//.test(path)) path = path.slice(1);
			return path;
		} catch {
			return null;
		}
	}
	if (/^(?:[a-zA-Z]:[\\/])/.test(src)) return decodePath(src);
	if (/^\\\\[^\\]/.test(src)) return decodePath(src);
	if (/^\/(?!\/)/.test(src)) return decodePath(src);
	return null;
}

function decodePath(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

/**
 * Repairs local image links whose path contains whitespace: CommonMark needs
 * those destinations wrapped in angle brackets, otherwise they stay as text.
 */
export function repairLocalImageLinks(markdown: string): string {
	return markdown.replace(
		/!\[([^\]]*)\]\(((?:[a-zA-Z]:[\\/]|\/)[^)\n"'(]*\s[^)\n"'(]*)\)/g,
		(_match, alt: string, target: string) => `![${alt}](<${target}>)`
	);
}

/**
 * Rewrites `<img src>` values that point at local files through `resolve`,
 * so the webview can load them (e.g. via the Tauri asset protocol).
 */
export function resolveLocalImages(
	html: string,
	resolve: (path: string) => string | null
): string {
	if (typeof DOMParser === 'undefined') return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	let changed = false;
	for (const img of Array.from(doc.querySelectorAll('img[src]'))) {
		const src = img.getAttribute('src');
		if (!src) continue;
		const path = localFilePath(src);
		if (!path) continue;
		const next = resolve(path);
		if (!next || next === src) continue;
		img.setAttribute('src', next);
		changed = true;
	}
	return changed ? doc.body.innerHTML : html;
}

function needsAngleBrackets(url: string): boolean {
	return /[\s()<>#?]/.test(url);
}

export function attachmentMarkdown(path: string): string {
	const name = fileNameFromPath(path);
	const url = path.replace(/\\/g, '/');
	const target = needsAngleBrackets(url) ? `<${url}>` : url;
	return isImagePath(path) ? `![${name}](${target})` : `[${name}](${target})`;
}

export function joinAttachmentMarkdown(paths: string[]): string {
	return paths.map((path) => attachmentMarkdown(path)).join('\n');
}

export function insertAttachment(
	value: string,
	start: number,
	end: number,
	markdown: string
): { value: string; start: number; end: number } {
	const before = value.slice(0, start);
	const selected = value.slice(start, end);
	const after = value.slice(end);
	const needsLeadingBreak = before.length > 0 && !before.endsWith('\n');
	const needsSelectedBreak = selected.length > 0 && !selected.startsWith('\n');
	const needsTrailingBreak =
		selected.length === 0 && after.length > 0 && !after.startsWith('\n');
	const leading = needsLeadingBreak ? '\n' : '';
	const block = markdown + (needsSelectedBreak ? '\n' : '') + selected;
	const next = before + leading + block + (needsTrailingBreak ? '\n' : '') + after;
	const caret = before.length + leading.length + markdown.length;
	return { value: next, start: caret, end: caret };
}