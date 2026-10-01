/**
 * Attachment helpers: store references, path parsing, and markdown insertion.
 *
 * Since docs/design/artifacts.md, an attached file can be addressed two ways:
 *
 * - a **store reference** — `stylenotes-attachment://<sha256>[.<ext>]` — a
 *   portable, content-addressed id produced by the Rust artifact store. This is
 *   what a note should hold: it survives moving the original file and syncs to
 *   another device unchanged.
 * - a **local path** — `C:/pics/cat.png`, `/home/a/cat.png`, `file://…` — the
 *   older in-place reference. Still supported so notes written before the store
 *   keep rendering, but new attachments always go through the store.
 *
 * The module stays pure (no Tauri, no filesystem): resolution to a webview URL
 * is passed in by the caller, and I/O lives in Rust (`attachment_import`).
 */

/** Scheme of a store-owned, portable attachment reference. */
export const ATTACHMENT_SCHEME = 'stylenotes-attachment://';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'];
const PDF_EXTENSIONS = ['pdf'];

/** How a file should be presented inside a note. */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'file';

export type AttachmentReference = { id: string; ext: string };

export function fileNameFromPath(path: string): string {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1] || path;
}

export function fileExtension(path: string): string {
	const name = fileNameFromPath(path);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Lowercase, no dot, ASCII-alphanumeric-only extension (or `''`). */
export function normalizeExtension(ext: string): string {
	const trimmed = ext.trim().replace(/^\./, '').toLowerCase();
	return /^[a-z0-9]{1,16}$/.test(trimmed) ? trimmed : '';
}

/** The store reference for a blob id and extension. */
export function attachmentReference(id: string, ext: string): string {
	const clean = normalizeExtension(ext);
	return clean ? `${ATTACHMENT_SCHEME}${id}.${clean}` : `${ATTACHMENT_SCHEME}${id}`;
}

/** Parses a store reference, or null when `src` is any other kind of URL. */
export function parseAttachmentReference(src: string): AttachmentReference | null {
	if (!src || !src.toLowerCase().startsWith(ATTACHMENT_SCHEME)) return null;
	const rest = src.slice(ATTACHMENT_SCHEME.length).split(/[#?]/)[0];
	if (!rest) return null;
	const dot = rest.lastIndexOf('.');
	const id = dot > 0 ? rest.slice(0, dot) : rest;
	const ext = dot > 0 ? normalizeExtension(rest.slice(dot + 1)) : '';
	if (!/^[0-9a-f]+$/.test(id.toLowerCase())) return null;
	return { id: id.toLowerCase(), ext };
}

export function isAttachmentReference(src: string): boolean {
	return parseAttachmentReference(src) !== null;
}

/** The extension behind either a store reference or a plain path. */
export function targetExtension(target: string): string {
	const ref = parseAttachmentReference(target);
	return ref ? ref.ext : fileExtension(target);
}

export function attachmentKind(extOrPath: string): AttachmentKind {
	// Accept a bare extension or a full path/name.
	const ext = extOrPath.includes('.') || extOrPath.includes('/') || extOrPath.includes('\\')
		? fileExtension(extOrPath)
		: normalizeExtension(extOrPath);
	if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
	if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
	if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
	if (PDF_EXTENSIONS.includes(ext)) return 'pdf';
	return 'file';
}

/** Store-relative path for a blob: `attachments/<ab>/<hash>[.<ext>]`.
 *
 * Mirrors `object_rel_path` in `src-tauri/src/attachments/mod.rs`; this is both
 * the on-disk layout and the future S3 object key. */
export function attachmentObjectPath(id: string, ext: string): string {
	const clean = normalizeExtension(ext);
	const shard = id.slice(0, 2) || '00';
	return clean ? `attachments/${shard}/${id}.${clean}` : `attachments/${shard}/${id}`;
}

export function isImagePath(path: string): boolean {
	return attachmentKind(path) === 'image';
}

export function isVideoPath(path: string): boolean {
	return attachmentKind(path) === 'video';
}

export function isAudioPath(path: string): boolean {
	return attachmentKind(path) === 'audio';
}

/** Kinds rendered inline with `![]` rather than a plain link. */
export function isEmbeddablePath(path: string): boolean {
	const kind = attachmentKind(path);
	return kind === 'image' || kind === 'video' || kind === 'audio';
}

export function isEmbeddableKind(ext: string): boolean {
	const kind = attachmentKind(ext);
	return kind === 'image' || kind === 'video' || kind === 'audio';
}

/**
 * For a link target that is a stored or local file, the kind a click should act
 * on (`pdf` opens the OS viewer, `file` opens the default app); null when the
 * target is not an attachment and should stay an ordinary link.
 */
export function fileLinkKind(target: string): AttachmentKind | null {
	if (!isAttachmentReference(target) && localFilePath(target) === null) return null;
	const kind = attachmentKind(targetExtension(target));
	return kind === 'file' || kind === 'pdf' ? kind : null;
}

/**
 * The attachment target behind a link click, or null when the click is not on a
 * file link. Callers open the returned target with the OS default app instead of
 * letting the webview navigate to it.
 */
export function attachmentLinkTarget(
	target: EventTarget | null,
	root: HTMLElement
): string | null {
	if (!(target instanceof Element)) return null;
	const anchor = target.closest<HTMLAnchorElement>('a[href]');
	if (!anchor || !root.contains(anchor)) return null;
	if (anchor.closest('a[data-wiki-target], a[data-wiki-target-text], a[data-wiki-candidates]')) {
		return null;
	}
	if (anchor.hasAttribute('download')) return null;
	const href = anchor.getAttribute('href') ?? '';
	return fileLinkKind(href) ? href : null;
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

type Resolver = (target: string) => string | null;

function rewriteAttribute(
	doc: Document,
	selector: string,
	attribute: 'src' | 'href',
	resolve: Resolver
): boolean {
	let changed = false;
	for (const el of Array.from(doc.querySelectorAll(selector))) {
		const value = el.getAttribute(attribute);
		if (!value) continue;
		const next = resolve(value);
		if (!next || next === value) continue;
		el.setAttribute(attribute, next);
		changed = true;
	}
	return changed;
}

/**
 * Rewrites every media source (`img`/`video`/`audio`/`source`) that points at an
 * attachment through `resolve`, so the webview can load it. File links are left
 * alone: a click on those is handled separately (they open in the OS app, they
 * are not navigated to inside the webview).
 *
 * `resolve` is called with the raw target (a store reference or a local path)
 * and returns a webview-loadable URL or null to leave it untouched.
 */
export function resolveAttachmentSources(html: string, resolve: Resolver): string {
	if (typeof DOMParser === 'undefined') return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	let changed = false;
	changed = rewriteAttribute(doc, 'img[src]', 'src', resolve) || changed;
	changed = rewriteAttribute(doc, 'video[src]', 'src', resolve) || changed;
	changed = rewriteAttribute(doc, 'audio[src]', 'src', resolve) || changed;
	changed = rewriteAttribute(doc, 'source[src]', 'src', resolve) || changed;
	return changed ? doc.body.innerHTML : html;
}

/**
 * Back-compat wrapper: rewrites only `<img src>` local files. Kept because the
 * older notes and tests rely on it; new code should prefer
 * `resolveAttachmentSources`, which also covers video/audio and file links.
 */
export function resolveLocalImages(html: string, resolve: Resolver): string {
	if (typeof DOMParser === 'undefined') return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const changed = rewriteAttribute(doc, 'img[src]', 'src', (value) => {
		const path = localFilePath(value);
		return path ? resolve(path) : null;
	});
	return changed ? doc.body.innerHTML : html;
}

function needsAngleBrackets(url: string): boolean {
	return /[\s()<>#?]/.test(url);
}

/**
 * The markdown for one attachment, embedding images and media and linking the
 * rest. `target` may be a store reference or a legacy local path; `label` is the
 * original file name, shown as alt text or link text.
 */
export function attachmentMarkdown(target: string, label?: string): string {
	const ref = parseAttachmentReference(target);
	if (ref) {
		const name = label?.trim() || `attachment${ref.ext ? `.${ref.ext}` : ''}`;
		const embed = isEmbeddableKind(ref.ext);
		return embed ? `![${name}](${target})` : `[${name}](${target})`;
	}
	const name = label?.trim() || fileNameFromPath(target);
	const url = target.replace(/\\/g, '/');
	const dest = needsAngleBrackets(url) ? `<${url}>` : url;
	return isEmbeddablePath(target) ? `![${name}](${dest})` : `[${name}](${dest})`;
}

export function joinAttachmentMarkdown(targets: string[]): string {
	return targets.map((target) => attachmentMarkdown(target)).join('\n');
}

/**
 * Rewrites every store reference in body text to its store-relative object path
 * (`attachments/<ab>/<id>.<ext>`), for markdown export.
 *
 * A reference is a single token, so the surrounding markdown (image `![]`,
 * link `[]`, angle brackets) is preserved untouched; only the destination
 * changes to a path a reader can find beside the exported `.md` files.
 */
export function rewriteAttachmentReferences(markdown: string): string {
	return markdown.replace(
		/stylenotes-attachment:\/\/[0-9a-fA-F]+(?:\.[a-z0-9]{1,16})?/g,
		(reference) => {
			const parsed = parseAttachmentReference(reference);
			return parsed ? attachmentObjectPath(parsed.id, parsed.ext) : reference;
		}
	);
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
