import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { convertFileSrc } from '@tauri-apps/api/core';
import { noteMarkdown, type Note } from '$lib/content/content';
import { preserveBlankLines } from '$lib/content/markdown-preview';
import { repairLocalImageLinks, resolveLocalImages } from '$lib/content/attachments';
import { isTauri } from '$lib/windows';

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
		'h1{font-size:1.8rem;margin-bottom:1rem}img{max-width:100%}</style></head><body>' +
		`<h1>${title}</h1>${rendered}` +
		'</body></html>'
	);
}

export function printNoteDocument(note: Note, rendered: string): boolean {
	if (typeof document === 'undefined') return false;
	const html = notePrintDocument(note, rendered);

	const popup = window.open('', '_blank', 'width=800,height=900');
	if (popup) {
		popup.document.write(html);
		popup.document.close();
		popup.focus();
		popup.print();
		return true;
	}

	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
	iframe.srcdoc = html;
	iframe.onload = () => {
		try {
			iframe.contentWindow?.focus();
			iframe.contentWindow?.print();
		} finally {
			setTimeout(() => iframe.remove(), 1000);
		}
	};
	document.body.appendChild(iframe);
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

export function noteFileName(note: Note): string {
	const base =
		(note.title || 'note').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ') || 'note';
	return `${base}.md`;
}

export async function exportNoteMarkdown(note: Note): Promise<string | null> {
	const content = noteMarkdown(note);
	const fileName = noteFileName(note);

	if (isTauri) {
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

	const blob = new Blob([content], { type: 'text/markdown' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
	return fileName;
}

export function exportAllNotes(notes: Note[]): string {
	const blob = new Blob([notes.map((note) => noteMarkdown(note)).join('\n')], {
		type: 'text/markdown',
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'stylenotes.md';
	link.click();
	URL.revokeObjectURL(url);
	return link.download;
}

/** Note file actions wired to a toast callback. */
export function createNoteActions(notify: (message: string) => void) {
	return {
		async copy(note: Note) {
			const ok = await copyNoteToClipboard(note);
			notify(ok ? 'Note copied to clipboard' : 'Could not copy note');
		},
		print(note: Note) {
			if (!printNoteDocument(note, renderNoteHtml(note.body))) {
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
		exportAll(notes: Note[]) {
			const name = exportAllNotes(notes);
			notify(`Exported ${name}`);
		},
	};
}