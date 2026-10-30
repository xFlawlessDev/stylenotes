import type { FaqItem } from '#lib/seo.js';

export type Feature = {
	title: string;
	body: string;
	icon: 'file-text' | 'list-checks' | 'network' | 'search' | 'app-window' | 'keyboard' | 'palette' | 'plug';
};

export const features: readonly Feature[] = [
	{
		title: 'Notes that are just Markdown',
		body: 'Headings, tables, checklists, code, math, and Mermaid diagrams render in a live preview. Nothing is locked in a proprietary format, and export is plain .md.',
		icon: 'file-text'
	},
	{
		title: 'Tasks beside your thinking',
		body: 'A board for status, a list for focus, and a Gantt view for what is blocked by what. Link a task to the notes it came from.',
		icon: 'list-checks'
	},
	{
		title: 'A graph, not a filing cabinet',
		body: 'Wiki links turn your notes into a map you can explore, hover, and search.',
		icon: 'network'
	},
	{
		title: 'Search that finds the thought',
		body: 'A command palette (Ctrl K) jumps to any note, task, or action. Full-text search covers titles, tags, and bodies; an optional local embedder adds meaning-based recall.',
		icon: 'search'
	},
	{
		title: 'Windows that fit how you work',
		body: 'A full workspace for deep work, an always-on-top dock for capture, and a Kanban board that can sit behind your other windows as a desktop underlay.',
		icon: 'app-window'
	},
	{
		title: 'Capture from anywhere',
		body: 'Ctrl+Shift+N and Ctrl+Shift+T open a new note or task in a small, always-on-top window — without leaving what you were doing.',
		icon: 'keyboard'
	},
	{
		title: 'Yours to make',
		body: 'Light and dark, accent colour, density, reduced motion, and the editor layout are all a setting away.',
		icon: 'palette'
	},
	{
		title: 'Yours to connect',
		body: 'A built-in MCP server lets Claude Desktop, Cursor, and other assistants read and write your vault locally — off by default, read-only until you allow writes.',
		icon: 'plug'
	}
];

export const faq: readonly FaqItem[] = [
	{
		question: 'Does StyleNotes need an account?',
		answer:
			'No. There is no sign-up and no login. Notes live in a SQLite file on your machine and the app opens and edits with no connection.'
	},
	{
		question: 'Where is my data stored?',
		answer:
			'In a local SQLite database in your app data folder. You can also point a workspace at a folder and get a plain-Markdown mirror of it, exported and re-imported automatically, so your writing is never trapped in the app.'
	},
	{
		question: 'Does it work offline?',
		answer:
			'Yes, entirely. The app is local-first by design: nothing is sent anywhere unless you explicitly turn on an optional cloud feature.'
	},
	{
		question: 'Is it free?',
		answer:
			'Yes. The full desktop app is free and open source under the AGPL-3.0. Optional extras that need a server — cloud sync, a hosted AI gateway, and remote MCP access — are served by a separate service; the app works completely offline without them.'
	},
	{
		question: 'Which platforms are supported?',
		answer:
			'Windows, macOS on Apple silicon, and Linux. Every release ships signed update metadata, so the app can update itself from GitHub Releases.'
	},
	{
		question: 'Can an AI assistant read my notes?',
		answer:
			'Only if you turn it on. The MCP server is off by default and read-only until you grant writes. Reads never touch the database directly, and every write goes through the running app with the same validation the UI uses.'
	}
];
