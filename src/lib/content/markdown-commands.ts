import {
	insertBlock,
	insertTable,
	wrapCodeBlock,
	wrapInline,
	type EditState,
	type EditorCommand
} from '$lib/content/markdown-editor';
import {
	stripHeading,
	toggleBulletList,
	toggleChecked,
	toggleChecklist,
	toggleHeading,
	toggleNumberedList,
	toggleQuote
} from '$lib/content/markdown-lines';

export function transform(state: EditState, command: EditorCommand): EditState | null {
	switch (command) {
		case 'bold':
			return wrapInline(state, '**');
		case 'italic':
			return wrapInline(state, '*');
		case 'strikethrough':
			return wrapInline(state, '~~');
		case 'code':
			return wrapInline(state, '`', '`', 'code');
		case 'link':
			return wrapInline(state, '[', '](https://)', 'title');
		case 'wikilink':
			return wrapInline(state, '[[', ']]', 'Note title');
		case 'image':
			return wrapInline(state, '![', '](https://)', 'alt text');
		case 'heading1':
			return toggleHeading(state, 1);
		case 'heading2':
			return toggleHeading(state, 2);
		case 'heading3':
			return toggleHeading(state, 3);
		case 'heading4':
			return toggleHeading(state, 4);
		case 'heading5':
			return toggleHeading(state, 5);
		case 'heading6':
			return toggleHeading(state, 6);
		case 'paragraph':
			return stripHeading(state);
		case 'bullet':
			return toggleBulletList(state);
		case 'numbered':
			return toggleNumberedList(state);
		case 'checklist':
			return toggleChecklist(state);
		case 'checked':
			return toggleChecked(state);
		case 'quote':
			return toggleQuote(state);
		case 'codeblock':
			return wrapCodeBlock(state);
		case 'divider':
			return insertBlock(state, '---');
		case 'table':
			return insertTable(state);
		default:
			return null;
	}
}
