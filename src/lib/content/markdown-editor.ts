export type EditState = {
	value: string;
	start: number;
	end: number;
};

export type EditorCommand =
	| 'bold'
	| 'italic'
	| 'strikethrough'
	| 'code'
	| 'link'
	| 'image'
	| 'heading1'
	| 'heading2'
	| 'heading3'
	| 'heading4'
	| 'heading5'
	| 'heading6'
	| 'paragraph'
	| 'bullet'
	| 'numbered'
	| 'checklist'
	| 'checked'
	| 'quote'
	| 'codeblock'
	| 'divider'
	| 'table';

const LIST_MARKER = /^(\s*)([-*+]|\d+\.)\s+/;
const CHECKLIST_MARKER = /^(\s*)([-*+])\s+\[( |x|X)\]\s+/;

export function lineBlock(state: EditState) {
	const from = state.value.lastIndexOf('\n', Math.max(0, state.start - 1)) + 1;
	const found = state.value.indexOf('\n', state.end);
	const to = found === -1 ? state.value.length : found;
	return { from, to, lines: state.value.slice(from, to).split('\n') };
}

export function replaceLines(state: EditState, mapper: (line: string) => string): EditState {
	const { from, to, lines } = lineBlock(state);
	const next = lines.map(mapper).join('\n');
	return {
		value: state.value.slice(0, from) + next + state.value.slice(to),
		start: from,
		end: from + next.length,
	};
}

export function unwrapMarker(line: string): { indent: string; content: string } {
	const indent = /^\s*/.exec(line)?.[0] ?? '';
	const bare = line.slice(indent.length);
	const content = bare.replace(CHECKLIST_MARKER, '').replace(LIST_MARKER, '');
	return { indent, content };
}

export function activeLines(state: EditState, test: (line: string) => boolean) {
	const { lines } = lineBlock(state);
	const meaningful = lines.filter((line) => line.trim());
	return {
		single: state.start === state.end,
		active: meaningful.length > 0 && meaningful.every(test),
	};
}

export function wrapInline(
	state: EditState,
	before: string,
	after = before,
	placeholder = 'text'
): EditState {
	const { value, start, end } = state;
	const selected = value.slice(start, end);

	if (
		selected.length >= before.length + after.length &&
		selected.startsWith(before) &&
		selected.endsWith(after)
	) {
		const inner = selected.slice(before.length, selected.length - after.length);
		return {
			value: value.slice(0, start) + inner + value.slice(end),
			start,
			end: start + inner.length,
		};
	}

	const aroundStart = start - before.length;
	if (
		aroundStart >= 0 &&
		value.slice(aroundStart, start) === before &&
		value.slice(end, end + after.length) === after
	) {
		return {
			value: value.slice(0, aroundStart) + selected + value.slice(end + after.length),
			start: aroundStart,
			end: aroundStart + selected.length,
		};
	}

	const inner = selected || placeholder;
	return {
		value: value.slice(0, start) + before + inner + after + value.slice(end),
		start: start + before.length,
		end: start + before.length + inner.length,
	};
}

export function insertBlock(state: EditState, block: string, caretOffset = block.length): EditState {
	const before = state.value.slice(0, state.start);
	const after = state.value.slice(state.end);
	const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
	const trail = after === '' || after.startsWith('\n') ? '' : '\n\n';
	const caret = state.start + lead.length + caretOffset;
	return {
		value: `${before}${lead}${block}${trail}${after}`,
		start: caret,
		end: caret,
	};
}

export function wrapCodeBlock(state: EditState): EditState {
	const selected = state.value.slice(state.start, state.end);
	const next = insertBlock(state, `\`\`\`\n${selected}\n\`\`\``, 4);
	if (!selected) return next;
	return { ...next, end: next.start + selected.length };
}

export function insertTable(state: EditState): EditState {
	return insertBlock(state, '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |', 2);
}
