import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import type MarkdownItType = require('markdown-it');
import taskLists from 'markdown-it-task-lists';
import { katex } from '@mdit/plugin-katex';
import { fencedLanguages, installShiki, loadLanguages } from '$lib/content/code-highlight';
import wrapperlessFenceRule from '@olets/markdown-it-wrapperless-fence-rule';
import { addCodeCopyButtons } from '$lib/content/preview-actions';
import { noteMarkdown, type Note } from '$lib/content/content';
import { preserveBlankLines } from '$lib/content/markdown-preview';
import {
	repairLocalImageLinks,
	resolveAttachmentSources,
	rewriteAttachmentReferences
} from '$lib/content/attachments';
import {
	primeAttachmentStore,
	resolveAttachmentUrl
} from '$lib/content/attachment-url';
import { TOC_DIGEST_ATTR } from '$lib/content/preview-toc';
import { slugifyFolder } from '$lib/stores/notes';
import { isTauri } from '$lib/windows';
import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
import {
	installWikiLinkRule,
	renderWikiToken,
	slugifyHeading,
	type WikiRenderContext,
} from '$lib/content/wiki-links';
import { t } from '$lib/i18n/index.svelte';

/** Keeps DOMPurify's default URI allow-list while accepting the Tauri asset
 * protocol and the store's own portable scheme (so a blob missing on this device
 * still survives sanitising as an unresolved reference rather than vanishing). */
const ALLOWED_URI =
	/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|asset|stylenotes-attachment):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

function createMarkdownParser() {
	const parser = new MarkdownIt({ breaks: true, html: true, linkify: true });
	installWikiLinkRule(parser);
	parser.renderer.rules.wiki_link = (tokens, index, options, env) =>
		renderWikiToken(parser, tokens, index, (env as { wiki?: WikiRenderContext }).wiki);
	parser.renderer.rules.wiki_embed = (tokens, index, options, env) =>
		renderWikiToken(parser, tokens, index, (env as { wiki?: WikiRenderContext }).wiki);
	parser.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
		const inline = tokens[index + 1];
		if (inline?.type === 'inline') {
			// Anchors from wiki links (`[[Note#Heading]]`) and the table of
			// contents both target these ids, so they must be unique per note.
			const base = slugifyHeading(inline.content);
			const seen = (env as { headingIds?: Map<string, number> }).headingIds ?? new Map();
			const count = seen.get(base) ?? 0;
			seen.set(base, count + 1);
			(env as { headingIds?: Map<string, number> }).headingIds = seen;
			tokens[index].attrSet('id', count === 0 ? base : `${base}-${count + 1}`);
			// Read back by the outline sync: toggling this changes the table of
			// contents without changing the rendered body.
			tokens[index].attrSet(TOC_DIGEST_ATTR, '');
		}
		return renderer.renderToken(tokens, index, options);
	};
	parser.use(taskLists, { enabled: true, label: false });
	parser.use(katex, { delimiters: 'dollars', throwOnError: false, trust: false });
	const defaultFence = parser.renderer.rules.fence;
	parser.renderer.rules.fence = (tokens, index, options, env, renderer) => {
		const language = tokens[index].info.trim().split(/\s+/, 1)[0].toLowerCase();
		if (language === 'mermaid') return renderMermaidFence(tokens, index);
		return defaultFence
			? defaultFence(tokens, index, options, env, renderer)
			: renderer.renderToken(tokens, index, options);
	};
	return parser;
}

function renderMermaidFence(tokens: MarkdownItType.Token[], index: number) {
	const code = escapeHtml(tokens[index].content);
	return `<pre><code class="language-mermaid">${code}</code></pre>\n`;
}

/**
 * Shiki only knows the grammars loaded so far, so a fence in a language it does
 * not bundle would throw and cost the whole note its highlighting. Keep just
 * that block readable instead.
 */
function installPlainFenceFallback(parser: MarkdownItType.MarkdownIt) {
	const highlight = parser.options.highlight;
	if (!highlight) return;
	parser.options.highlight = (code, lang, attrs) => {
		try {
			return highlight(code, lang, attrs);
		} catch {
			return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>\n`;
		}
	};
}

const fallbackMarkdown = createMarkdownParser();
let markdownSetup: Promise<MarkdownItType.MarkdownIt> | undefined;

export async function prewarmNoteRenderer(): Promise<void> {
	await getMarkdownParser();
}

async function getMarkdownParser(): Promise<MarkdownItType.MarkdownIt> {
	if (!markdownSetup) {
		markdownSetup = (async () => {
			const parser = createMarkdownParser();
			parser.renderer.rules.fence = (tokens, index, options, env, renderer) => {
				const language = tokens[index].info.trim().split(/\s+/, 1)[0].toLowerCase();
				if (language === 'mermaid') return renderMermaidFence(tokens, index);
				return wrapperlessFenceRule(tokens, index, options, env, renderer);
			};
			await installShiki(parser);
			installPlainFenceFallback(parser);
			return parser;
		})();
		markdownSetup = markdownSetup.catch((error) => {
			markdownSetup = undefined;
			throw error;
		});
	}
	return markdownSetup;
}

function assetUrl(target: string): string | null {
	return resolveAttachmentUrl(target);
}

export async function renderNoteHtml(body: string, wiki?: WikiRenderContext): Promise<string> {
	// Make sure the store root is known before resolving references; the call is
	// cached, so this is a no-op after the first render.
	if (isTauri) await primeAttachmentStore();
	const source = repairLocalImageLinks(body);
	const markdownSource = preserveBlankLines(source);
	const codeLangs = fencedLanguages(markdownSource).filter((lang) => lang !== 'mermaid');
	let rendered: string;
	if (codeLangs.length === 0) {
		rendered = fallbackMarkdown.render(markdownSource, { wiki });
	} else {
		try {
			const parser = await getMarkdownParser();
			await loadLanguages(codeLangs);
			rendered = parser.render(markdownSource, { wiki });
		} catch {
			rendered = fallbackMarkdown.render(markdownSource, { wiki });
		}
	}
	const resolved = resolveAttachmentSources(rendered, assetUrl);
	const sanitized = DOMPurify.sanitize(resolved, { ALLOWED_URI_REGEXP: ALLOWED_URI });
	return addCodeCopyButtons(sanitized);
}

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			default:
				return '&#39;';
		}
	});
}

export function notePrintDocument(note: Note, rendered: string, stylesheets: string[] = []): string {
	const title = escapeHtml(note.title || 'Untitled note');
	const links = stylesheets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('');
	return (
		`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${links}` +
		'<style>body{font-family:system-ui,sans-serif;line-height:1.7;max-width:720px;margin:40px auto;padding:0 24px;color:#111}' +
		'h1{font-size:1.8rem;margin-bottom:1rem}img,svg{max-width:100%;height:auto}.mermaid-diagram{margin:1.5rem 0;overflow-x:auto}.mermaid-diagram svg{display:block;margin:auto}</style></head><body>' +
		`<h1>${title}</h1>${rendered}` +
		'</body></html>'
	);
}

function printStylesheets(): string[] {
	return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
		.map((link) => link.href)
		.filter(Boolean);
}

export function printNoteDocument(note: Note, rendered: string | Promise<string>): boolean {
	if (typeof document === 'undefined') return false;

	const popup = window.open('', '_blank', 'width=800,height=900');
	if (popup) {
		void Promise.resolve(rendered).then((html) => {
			popup.document.write(notePrintDocument(note, html, printStylesheets()));
			popup.document.close();
			popup.focus();
			popup.onload = () => {
				void popup.document.fonts.ready.then(() => popup.print());
			};
		});
		return true;
	}

	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
	void Promise.resolve(rendered).then((html) => {
		iframe.onload = () => {
			const printWindow = iframe.contentWindow;
			if (!printWindow) return;
			void printWindow.document.fonts.ready.then(() => {
				try {
					printWindow.focus();
					printWindow.print();
				} finally {
					setTimeout(() => iframe.remove(), 1000);
				}
			});
		};
		iframe.srcdoc = notePrintDocument(note, html, printStylesheets());
		document.body.appendChild(iframe);
	});
	return true;
}

export async function copyNoteToClipboard(note: Note): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(`${note.title}\n\n${note.body}`);
		return true;
	} catch {
		return false;
	}
}

/** Turns a note title into a file name base that is safe on every platform. */
export function markdownBaseName(title: string): string {
	const base = (title || 'note')
		.trim()
		.replace(/[\\/:*?"<>|]+/g, '-')
		.replace(/\s+/g, ' ')
		.replace(/^\.+/, '')
		.trim();
	return base || 'note';
}

export function noteFileName(note: Note): string {
	return `${markdownBaseName(note.title)}.md`;
}

/** Asks the user where to save via the native dialog, then writes the file. Null when cancelled. */
async function saveMarkdownDialog(fileName: string, content: string): Promise<string | null> {
	const [{ save }, { writeTextFile }] = await Promise.all([
		import('@tauri-apps/plugin-dialog'),
		import('@tauri-apps/plugin-fs'),
	]);
	const path = await save({
		defaultPath: fileName,
		filters: [{ name: 'Markdown', extensions: ['md'] }],
	});
	if (!path) return null;
	await writeTextFile(path, content);
	return fileName;
}

function downloadMarkdown(fileName: string, content: string): string {
	const blob = new Blob([content], { type: 'text/markdown' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
	return fileName;
}

export async function exportNoteMarkdown(note: Note): Promise<string | null> {
	const content = rewriteAttachmentReferences(noteMarkdown(note));
	const fileName = noteFileName(note);
	if (isTauri) return saveMarkdownDialog(fileName, content);
	return downloadMarkdown(fileName, content);
}

export type FolderRef = { id: string; label: string };

export type FolderExport = { dir: string; written: number; failed: string[] };

function joinPath(dir: string, name: string): string {
	const sep = dir.includes('\\') ? '\\' : '/';
	return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`;
}

/** File name no other note in this export claimed yet (lower-cased, since Windows is case-insensitive). */
function uniqueFileName(dirPath: string, base: string, used: Set<string>): string {
	const key = (file: string) => joinPath(dirPath, file).toLowerCase();
	let file = `${base}.md`;
	for (let n = 2; used.has(key(file)); n += 1) file = `${base}-${n}.md`;
	used.add(key(file));
	return file;
}

/** Last path segment, for toasts (the path plugin has no permission here). */
function lastSegment(dir: string): string {
	return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
}

/**
 * Writes every note as its own .md file into a folder the user picks,
 * grouped into a subfolder per note folder. Null when the user cancels.
 */
export async function exportNotesToFolder(
	notes: Note[],
	folders: FolderRef[],
): Promise<FolderExport | null> {
	if (!isTauri) {
		// Browser/dev fallback: no folder picker on the web, download one file per note.
		for (const note of notes)
			downloadMarkdown(noteFileName(note), rewriteAttachmentReferences(noteMarkdown(note)));
		return { dir: 'Downloads', written: notes.length, failed: [] };
	}

	const [{ open }, { mkdir, writeTextFile }] = await Promise.all([
		import('@tauri-apps/plugin-dialog'),
		import('@tauri-apps/plugin-fs'),
	]);
	// recursive: true extends the fs scope to the subfolders created inside the picked folder.
	const picked = await open({
		directory: true,
		multiple: false,
		recursive: true,
		title: t('editor.actions.chooseFolder'),
	});
	const dir = typeof picked === 'string' ? picked : null;
	if (!dir) return null;

	const madeDirs = new Set<string>();
	const used = new Set<string>();
	const failed: string[] = [];
	let written = 0;

	for (const note of notes) {
		const label = folders.find((folder) => folder.id === note.folder)?.label ?? note.folder;
		const dirPath = joinPath(dir, slugifyFolder(label));
		try {
			if (!madeDirs.has(dirPath.toLowerCase())) {
				await mkdir(dirPath, { recursive: true });
				madeDirs.add(dirPath.toLowerCase());
			}
			const file = uniqueFileName(dirPath, markdownBaseName(note.title), used);
			await writeTextFile(joinPath(dirPath, file), rewriteAttachmentReferences(noteMarkdown(note)));
			written += 1;
		} catch {
			failed.push(note.title || 'Untitled note');
		}
	}

	return { dir, written, failed };
}

/** Note file actions wired to a toast callback. */
export function createNoteActions(notify: (message: string) => void) {
	return {
		async copy(note: Note) {
			const ok = await copyNoteToClipboard(note);
			notify(ok ? t('editor.actions.noteCopied') : t('editor.actions.noteCopyFailed'));
		},
		print(note: Note) {
			const rendered = renderNoteHtml(note.body)
				.then(renderNotePreviewHtml)
				.catch(() => renderNoteHtml(note.body));
			if (!printNoteDocument(note, rendered)) {
				notify(t('editor.actions.printFailed'));
			}
		},
		async export(note: Note) {
			try {
				const name = await exportNoteMarkdown(note);
				if (name) notify(t('editor.actions.exported', { name }));
			} catch {
				notify(t('editor.actions.exportFailed'));
			}
		},
		async exportAll(notes: Note[], folders: FolderRef[]) {
			try {
				const result = await exportNotesToFolder(notes, folders);
				if (!result) return;
				if (result.failed.length > 0) {
					const total = result.written + result.failed.length;
					notify(
						t('editor.actions.exportedSome', {
							written: result.written,
							total,
							failed: result.failed.length,
						})
					);
				} else {
					notify(t('editor.actions.exportedAll', { written: result.written, dir: lastSegment(result.dir) }));
				}
			} catch {
				notify(t('editor.actions.exportFailedPlural'));
			}
		},
	};
}