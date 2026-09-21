import { browser } from '$app/environment';
import { noteMarkdown, notes as seedNotes } from '$lib/content/content';
import type { Note } from '$lib/content/content';
import { foldersRepo, metaRepo, notesRepo } from '$lib/db';

export const TONES = ['primary', 'secondary', 'tertiary', 'sky', 'violet', 'outline'] as const;

export type Folder = {
	id: string;
	label: string;
	count: number;
	tone: string;
	icon: string;
};

export const folderLabels: Record<string, string> = {
	all: 'All Notes',
	work: 'Work',
	ideas: 'Ideas',
	dev: 'Development',
	personal: 'Personal',
	archive: 'Archive',
};

export const KNOWN_FOLDER_IDS = ['work', 'ideas', 'dev', 'personal', 'archive'] as const;

export function foldersFor(all: Note[], custom: CustomFolder[] = []): Folder[] {
	const folders: Folder[] = [
		{ id: 'all', label: folderLabels.all, count: all.length, tone: 'primary', icon: 'all' },
	];

	const known = new Map<string, string>(Object.entries(folderLabels));
	const icons = new Map<string, string>();
	const order: string[] = [];
	const seen = new Set<string>(['all']);
	const push = (id: string) => {
		if (!id || seen.has(id)) return;
		seen.add(id);
		order.push(id);
	};

	for (const folder of custom) {
		known.set(folder.id, folder.label);
		if (folder.icon) icons.set(folder.id, folder.icon);
		push(folder.id);
	}
	for (const id of KNOWN_FOLDER_IDS) push(id);
	for (const note of all) push(note.folder);

	order.forEach((id, index) => {
		folders.push({
			id,
			label: known.get(id) ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
			count: all.filter((note) => note.folder === id).length,
			tone: TONES[index % TONES.length],
			icon: icons.get(id) ?? id,
		});
	});

	return folders;
}

export type CustomFolder = {
	id: string;
	label: string;
	icon?: string;
	position?: number;
};

export function mergeFolderIntoList(list: CustomFolder[], id: string): CustomFolder[] {
	if (list.some((folder) => folder.id === id)) return list;
	return [...list, { id, label: folderLabels[id] ?? id, icon: id }];
}

export function isCustomFolder(id: string): boolean {
	if (id === 'all') return false;
	return !(KNOWN_FOLDER_IDS as readonly string[]).includes(id);
}

export function reorderFolders(display: Folder[], fromId: string, toId: string): CustomFolder[] {
	const order = display.filter((folder) => folder.id !== 'all');
	const from = order.findIndex((folder) => folder.id === fromId);
	const to = order.findIndex((folder) => folder.id === toId);
	if (from < 0 || to < 0 || from === to) return order;
	const [moved] = order.splice(from, 1);
	order.splice(to, 0, moved);
	return order.map(({ id, label, icon }) => ({ id, label, icon }));
}

export function renameFolderInList(
	list: CustomFolder[],
	id: string,
	label: string
): CustomFolder[] {
	return mergeFolderIntoList(list, id).map((folder) =>
		folder.id === id ? { ...folder, label } : folder
	);
}

export function setFolderIconInList(
	list: CustomFolder[],
	id: string,
	icon: string
): CustomFolder[] {
	return mergeFolderIntoList(list, id).map((folder) =>
		folder.id === id ? { ...folder, icon } : folder
	);
}

export function removeFolderFromList(list: CustomFolder[], id: string): CustomFolder[] {
	return list.filter((folder) => folder.id !== id);
}

export function reassignNotesFolder(notes: Note[], id: string, to = 'personal'): Note[] {
	return notes.map((note) => (note.folder === id ? { ...note, folder: to } : note));
}

const SEED_FLAG = 'notes_seeded_v1';

export async function hydrateNotes(): Promise<Note[]> {
	if (!browser) return [...seedNotes];
	try {
		const seeded = await metaRepo.get(SEED_FLAG);
		if (!seeded) {
			await notesRepo.replaceAll(seedNotes);
			await metaRepo.set(SEED_FLAG, new Date().toISOString());
			return await notesRepo.list();
		}
		return await notesRepo.list();
	} catch {
		return [...seedNotes];
	}
}

export async function loadFolders(): Promise<CustomFolder[]> {
	if (!browser) return [];
	try {
		return await foldersRepo.list();
	} catch {
		return [];
	}
}

export async function persistFolders(folders: CustomFolder[]): Promise<void> {
	if (!browser) return;
	try {
		await foldersRepo.replaceAll(folders);
	} catch {
		/* ignore */
	}
}

export async function persistNote(note: Note): Promise<boolean> {
	if (!browser) return false;
	try {
		await notesRepo.upsert(note);
		return true;
	} catch {
		return false;
	}
}

export async function persistNotes(notes: Note[]): Promise<boolean> {
	if (!browser) return false;
	try {
		await notesRepo.replaceAll(notes);
		return true;
	} catch {
		return false;
	}
}

export async function removeNote(id: string): Promise<boolean> {
	if (!browser) return false;
	try {
		await notesRepo.remove(id);
		return true;
	} catch {
		return false;
	}
}

export async function clearNotes(): Promise<void> {
	if (!browser) return;
	try {
		await notesRepo.replaceAll([]);
		await foldersRepo.replaceAll([]);
	} catch {
		/* ignore */
	}
}

export async function resetNotesToSeed(): Promise<Note[]> {
	await persistNotes(seedNotes);
	await persistFolders([]);
	await metaRepo.set(SEED_FLAG, new Date().toISOString()).catch(() => undefined);
	return [...seedNotes];
}

export function parseChecklist(body: string, limit = 3): { text: string; done: boolean }[] {
	const items: { text: string; done: boolean }[] = [];
	for (const line of body.split(/\r?\n/)) {
		const match = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
		if (match) items.push({ text: match[2].trim(), done: match[1].toLowerCase() === 'x' });
		if (items.length >= limit) break;
	}
	return items;
}

export function toggleChecklistItem(body: string, index: number): string {
	if (index < 0) return body;
	const eol = body.includes('\r\n') ? '\r\n' : '\n';
	const lines = body.split(/\r?\n/);
	let seen = 0;
	for (let i = 0; i < lines.length; i += 1) {
		const match = /^(\s*[-*+]\s+\[)( |x|X)(\]\s.*)$/.exec(lines[i]);
		if (!match) continue;
		if (seen === index) {
			const next = match[2].toLowerCase() === 'x' ? ' ' : 'x';
			lines[i] = `${match[1]}${next}${match[3]}`;
			return lines.join(eol);
		}
		seen += 1;
	}
	return body;
}

export function slugifyFolder(label: string): string {
	const base = label
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base || 'folder';
}

export function uniqueFolderId(label: string, existing: string[]): string {
	const base = slugifyFolder(label);
	if (!existing.includes(base)) return base;
	let n = 2;
	while (existing.includes(`${base}-${n}`)) n += 1;
	return `${base}-${n}`;
}

export function exportNotes(notes: Note[]): string {
	return notes.map((note) => noteMarkdown(note)).join('\n');
}