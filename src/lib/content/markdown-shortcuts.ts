import type { EditorCommand } from '$lib/content/markdown-editor';

export type ShortcutEvent = {
	key: string;
	code?: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
};

export const MOD =
	typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';

const SHIFTED_SYMBOLS: Record<string, string> = {
	'&': '7',
	'*': '8',
	'(': '9',
	')': '0',
	'>': '.'
};

const ALT_COMMANDS: Record<string, EditorCommand> = {
	'0': 'paragraph',
	'1': 'heading1',
	'2': 'heading2',
	'3': 'heading3',
	'4': 'heading4',
	'5': 'heading5',
	'6': 'heading6'
};

const SHIFT_COMMANDS: Record<string, EditorCommand> = {
	x: 'strikethrough',
	'7': 'numbered',
	'8': 'bullet',
	'9': 'checklist',
	'.': 'quote',
	c: 'codeblock',
	k: 'wikilink'
};

const PLAIN_COMMANDS: Record<string, EditorCommand> = {
	b: 'bold',
	i: 'italic',
	e: 'code',
	k: 'link',
	enter: 'checked'
};

function normalizeKey(event: ShortcutEvent): string {
	if (event.code && /^Digit\d$/.test(event.code)) return event.code.slice(5);
	if (event.code === 'Period') return '.';
	if (event.shiftKey) {
		const shifted = SHIFTED_SYMBOLS[event.key];
		if (shifted) return shifted;
	}
	return event.key.toLowerCase();
}

export function shortcutCommand(event: ShortcutEvent): EditorCommand | null {
	if (!event.ctrlKey && !event.metaKey) return null;
	const key = normalizeKey(event);
	if (event.altKey && !event.shiftKey) return ALT_COMMANDS[key] ?? null;
	if (event.shiftKey && !event.altKey) return SHIFT_COMMANDS[key] ?? null;
	if (event.altKey || event.shiftKey) return null;
	return PLAIN_COMMANDS[key] ?? null;
}
