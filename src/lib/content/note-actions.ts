import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { convertFileSrc } from '@tauri-apps/api/core';
import { noteMarkdown, type Note } from '$lib/content/content';
import { preserveBlankLines } from '$lib/content/markdown-preview';
import { repairLocalImageLinks, resolveLocalImages } from '$lib/content/attachments';
import { slugifyFolder } from '$lib/stores/notes';
import { isTauri } from '$lib/windows';
import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';

/** Keeps DOMPurify's default URI allow-list while accepting the Tauri asset protocol. */
const ALLOWED_URI =
	/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

function assetUrl(path: string): string | null {
	if (!isTauri) return null;
	try {
		return convertFileSrc(path);
	} catch {
		return null;
	}
}

export function renderNoteHtml(body: string): string {
	const source = repairLocalImageLinks(body);
	const rendered = marked.parse(preserveBlankLines(source), { breaks: true }) as string;
	const resolved = resolveLocalImages(rendered, assetUrl);
	return DOMPurify.sanitize(resolved, { ALLOWED_URI_REGEXP: ALLOWED_URI });
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

export function notePrintDocument(note: Note, rendered: string): string {
	const title = escapeHtml(note.title || 'Untitled note');
	return (
		`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
		'<style>body{font-family:system-ui,sans-serif;line-height:1.7;max-width:720px;margin:40px auto;padding:0 24px;color:#111}' +
		'h1{font-size:1.8rem;margin-bottom:1rem}img,svg{max-width:100%;height:auto}.mermaid-diagram{margin:1.5rem 0;overflow-x:auto}.mermaid-diagram svg{display:block;margin:auto}</style></head><body>' +
		`<h1>${title}</h1>${rendered}` +
		'</body></html>'
	);
}

export function printNoteDocument(note: Note, rendered: string | Promise<string>): boolean {
	if (typeof document === 'undefined') return false;

	const popup = window.open('', '_blank', 'width=800,height=900');
	if (popup) {
		void Promise.resolve(rendered).then((html) => {
			popup.document.write(notePrintDocument(note, html));
			popup.document.close();
			popup.focus();
			popup.print();
		});
		return true;
	}

	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
	void Promise.resolve(rendered).then((html) => {
		iframe.onload = () => {
			try {
				iframe.contentWindow?.focus();
				iframe.contentWindow?.print();
			} finally {
				setTimeout(() => iframe.remove(), 1000);
			}
		};
		iframe.srcdoc = notePrintDocument(note, html);
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
	const content = noteMarkdown(note);
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
		for (const note of notes) downloadMarkdown(noteFileName(note), noteMarkdown(note));
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
		title: 'Choose a folder to export into',
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
			await writeTextFile(joinPath(dirPath, file), noteMarkdown(note));
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
			notify(ok ? 'Note copied to clipboard' : 'Could not copy note');
		},
		print(note: Note) {
			const rendered = renderNotePreviewHtml(renderNoteHtml(note.body)).catch(() =>
				renderNoteHtml(note.body),
			);
			if (!printNoteDocument(note, rendered)) {
				notify('Could not open print view');
			}
		},
		async export(note: Note) {
			try {
				const name = await exportNoteMarkdown(note);
				if (name) notify(`Exported ${name}`);
			} catch {
				notify('Could not export note');
			}
		},
		async exportAll(notes: Note[], folders: FolderRef[]) {
			try {
				const result = await exportNotesToFolder(notes, folders);
				if (!result) return;
				if (result.failed.length > 0) {
					const total = result.written + result.failed.length;
					notify(`Exported ${result.written} of ${total} notes, ${result.failed.length} failed`);
				} else {
					notify(`Exported ${result.written} notes to ${lastSegment(result.dir)}`);
				}
			} catch {
				notify('Could not export notes');
			}
		},
	};
}