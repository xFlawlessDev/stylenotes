import {
	activeLines,
	lineBlock,
	replaceLines,
	unwrapMarker,
	type EditState
} from '$lib/content/markdown-editor';

const CHECKLIST_MARKER = /^(\s*)([-*+])\s+\[( |x|X)\]\s+/;
const CHECKED_ITEM = /^(\s*[-*+]\s+\[)( |x|X)(\]\s.*)$/;
const ORDERED_ITEM = /^(\s*)(\d+)\.\s+(.*)$/;
const BULLET_ITEM = /^(\s*)([-*+])\s+(.*)$/;
const HEADING_MARKER = /^(\s*)(#{1,6})\s+/;
const QUOTE_MARKER = /^(\s*)>\s?/;
const LIST_MARKER = /^(\s*)([-*+]|\d+\.)\s+/;

export function toggleHeading(state: EditState, level: 1 | 2 | 3 | 4 | 5 | 6): EditState {
	const marker = '#'.repeat(level);
	return replaceLines(state, (line) => {
		const match = HEADING_MARKER.exec(line);
		if (match && match[2].length === level) return `${match[1]}${line.slice(match[0].length)}`;
		if (match) return `${match[1]}${marker} ${line.slice(match[0].length)}`;
		if (!line.trim()) return `${marker} `;
		return `${marker} ${line}`;
	});
}

export function stripHeading(state: EditState): EditState {
	return replaceLines(state, (line) => {
		const match = HEADING_MARKER.exec(line);
		return match ? `${match[1]}${line.slice(match[0].length)}` : line;
	});
}

export function toggleBulletList(state: EditState): EditState {
	const { single, active } = activeLines(
		state,
		(line) => BULLET_ITEM.test(line) && !CHECKLIST_MARKER.test(line)
	);
	return replaceLines(state, (line) => {
		if (!line.trim() && !single) return line;
		const { indent, content } = unwrapMarker(line);
		if (active) return `${indent}${content}`;
		return `${indent}- ${content}`;
	});
}

export function toggleNumberedList(state: EditState): EditState {
	const { single, active } = activeLines(state, (line) => ORDERED_ITEM.test(line));
	let counter = 1;
	return replaceLines(state, (line) => {
		if (!line.trim() && !single) return line;
		const { indent, content } = unwrapMarker(line);
		if (active) return `${indent}${content}`;
		return `${indent}${counter++}. ${content}`;
	});
}

export function toggleChecklist(state: EditState): EditState {
	const { single, active } = activeLines(state, (line) => CHECKLIST_MARKER.test(line));
	return replaceLines(state, (line) => {
		if (!line.trim() && !single) return line;
		const match = CHECKLIST_MARKER.exec(line);
		if (active && match) return `${match[1]}${line.slice(match[0].length)}`;
		if (match) return line;
		const { indent, content } = unwrapMarker(line);
		return `${indent}- [ ] ${content}`;
	});
}

export function toggleChecked(state: EditState): EditState | null {
	const { lines } = lineBlock(state);
	if (!lines.some((line) => CHECKED_ITEM.test(line))) return null;
	return replaceLines(state, (line) => {
		const match = CHECKED_ITEM.exec(line);
		if (!match) return line;
		const next = match[2].toLowerCase() === 'x' ? ' ' : 'x';
		return `${match[1]}${next}${match[3]}`;
	});
}

export function toggleQuote(state: EditState): EditState {
	const { single, active } = activeLines(state, (line) => QUOTE_MARKER.test(line));
	return replaceLines(state, (line) => {
		if (!line.trim() && !single) return line;
		const match = QUOTE_MARKER.exec(line);
		if (active) return match ? `${match[1]}${line.slice(match[0].length)}` : line;
		if (match) return line;
		const indent = /^\s*/.exec(line)?.[0] ?? '';
		return `${indent}> ${line.slice(indent.length)}`;
	});
}

export function continueList(state: EditState): EditState | null {
	if (state.start !== state.end) return null;
	const { from, to, lines } = lineBlock(state);
	const line = lines[0] ?? '';
	const insertAt = (insert: string): EditState => ({
		value: state.value.slice(0, state.start) + insert + state.value.slice(state.end),
		start: state.start + insert.length,
		end: state.start + insert.length,
	});
	const exit = (indent: string): EditState => ({
		value: state.value.slice(0, from) + indent + state.value.slice(to),
		start: from + indent.length,
		end: from + indent.length,
	});

	const checklist = CHECKED_ITEM.exec(line);
	if (checklist) {
		const indent = /^\s*/.exec(line)?.[0] ?? '';
		if (!checklist[3].slice(1).trim()) return exit(indent);
		return insertAt(`\n${indent}- [ ] `);
	}

	const ordered = ORDERED_ITEM.exec(line);
	if (ordered) {
		if (!ordered[3].trim()) return exit(ordered[1]);
		return insertAt(`\n${ordered[1]}${Number(ordered[2]) + 1}. `);
	}

	const bullet = BULLET_ITEM.exec(line);
	if (bullet) {
		if (!bullet[3].trim()) return exit(bullet[1]);
		return insertAt(`\n${bullet[1]}- `);
	}

	const quote = QUOTE_MARKER.exec(line);
	if (quote) {
		const indent = /^\s*/.exec(line)?.[0] ?? '';
		if (!line.slice(quote[0].length).trim()) return exit(indent);
		return insertAt(`\n${indent}> `);
	}

	return null;
}

export function indentLines(state: EditState, outdent: boolean): EditState | null {
	const { lines } = lineBlock(state);
	const listLike = lines.some(
		(line) => LIST_MARKER.test(line) || CHECKLIST_MARKER.test(line) || QUOTE_MARKER.test(line)
	);
	if (!listLike) return null;
	return replaceLines(state, (line) => {
		if (!line.trim()) return line;
		if (outdent) return line.replace(/^( {1,2}|\t)/, '');
		return `  ${line}`;
	});
}
