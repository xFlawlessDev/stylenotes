import { browser } from '$app/environment';
import { notes as seedNotes } from '$lib/content/content';
import type { Note } from '$lib/content/content';

export const TONES = ['primary', 'secondary', 'tertiary', 'sky', 'violet', 'outline'] as const;

export type Folder = {
	id: string;
	label: string;
	count: number;
	tone: string;
};

export const folderLabels: Record<string, string> = {
	all: 'All Notes',
	work: 'Work',
	ideas: 'Ideas',
	dev: 'Development',
	personal: 'Personal',
	archive: 'Archive',
};

export function foldersFor(all: Note[], custom: CustomFolder[] = []): Folder[] {
	const present = new Set(all.map((note) => note.folder));
	const folders: Folder[] = [
		{ id: 'all', label: folderLabels.all, count: all.length, tone: 'primary' },
	];

	const known = new Map<string, string>(Object.entries(folderLabels));
	for (const folder of custom) known.set(folder.id, folder.label);

	const ids = new Set([...present, ...custom.map((folder) => folder.id)]);

	[...ids].forEach((id, index) => {
		if (id === 'all') return;
		folders.push({
			id,
			label: known.get(id) ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
			count: all.filter((note) => note.folder === id).length,
			tone: TONES[index % TONES.length],
		});
	});

	return folders;
}

const NOTES_KEY = 'stylenotes.notes.v1';
const FOLDERS_KEY = 'stylenotes.folders.v1';

export type CustomFolder = {
	id: string;
	label: string;
};

export function loadFolders(): CustomFolder[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(FOLDERS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as CustomFolder[];
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((folder) => folder && typeof folder.id === 'string' && folder.label);
	} catch {
		return [];
	}
}

export function saveFolders(folders: CustomFolder[]) {
	if (!browser) return;
	try {
		localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
	} catch {
		/* ignore */
	}
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

function sanitize(value: unknown): Note[] | null {
	if (!Array.isArray(value)) return null;
	const notes = value.filter(
		(note): note is Note =>
			!!note && typeof note === 'object' && typeof (note as Note).id === 'string'
	);
	return notes.length ? notes : null;
}

export function loadNotes(): Note[] {
	if (!browser) return [...seedNotes];
	try {
		const raw = localStorage.getItem(NOTES_KEY);
		if (!raw) return [...seedNotes];
		return sanitize(JSON.parse(raw)) ?? [...seedNotes];
	} catch {
		return [...seedNotes];
	}
}

export function saveNotes(notes: Note[]) {
	if (!browser) return;
	try {
		localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
	} catch {
		/* storage full or unavailable */
	}
}

export function clearNotes() {
	if (!browser) return;
	try {
		localStorage.removeItem(NOTES_KEY);
	} catch {
		/* ignore */
	}
}

export function exportNotes(notes: Note[]): string {
	return notes
		.map((note) => {
			const meta = [
				'---',
				`title: ${note.title}`,
				`folder: ${note.folder}`,
				`tags: [${note.tags.join(', ')}]`,
				`updated: ${note.updated}`,
				`pinned: ${note.pinned}`,
				'---',
				'',
			].join('\n');
			return `${meta}${note.body}\n`;
		})
		.join('\n');
}