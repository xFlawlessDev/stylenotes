import { isEditablePreviewClick, previewLineBlockFromTarget, type LineBlock } from '$lib/content/preview-lines';

/**
 * In-place editor for a rendered preview block.
 *
 * The preview HTML is sanitized markdown output, so the editor swaps the
 * clicked element's contents for a `<textarea>` sized to the source lines and
 * restores the rendered markup on exit. Source text is read/written through the
 * two helpers below, keeping this module DOM-only.
 */

export type InlineCommit = (value: string, block: LineBlock) => void;

type Session = {
	host: HTMLElement;
	block: LineBlock;
	editor: HTMLTextAreaElement;
	original: string;
	oncommit: InlineCommit;
};

let session: Session | null = null;

/** Replaces the source lines `[start, end)` with `text`, preserving others. */
export function replaceLineRange(source: string, block: LineBlock, text: string): string {
	const lines = source.split('\n');
	const replaced = text.split('\n');
	return [...lines.slice(0, block.start), ...replaced, ...lines.slice(block.end)].join('\n');
}

/** Source text of the lines a block covers, ready for the textarea. */
export function lineRangeText(source: string, block: LineBlock): string {
	return source.split('\n').slice(block.start, block.end).join('\n');
}

function closeSession(commit: boolean) {
	const current = session;
	if (!current) return;
	session = null;
	const value = current.editor.value;
	current.editor.remove();
	current.host.innerHTML = current.original;
	if (commit) current.oncommit(value, current.block);
}

/** Restores the rendered markup without applying any pending edit. */
export function cancelPreviewLineEdit() {
	closeSession(false);
}

/** Commits the open inline editor, if any. */
export function commitPreviewLineEdit() {
	closeSession(true);
}

/**
 * Opens the inline editor for the block under the click. Returns the edited
 * element, or null when the click did not land on an editable block.
 */
export function startPreviewLineEdit(
	event: MouseEvent,
	root: HTMLElement,
	source: string,
	oncommit: InlineCommit,
): HTMLElement | null {
	if (!isEditablePreviewClick(event.target, root)) return null;
	const block = previewLineBlockFromTarget(event.target, root);
	if (!block || !(event.target instanceof Element)) return null;
	const host = event.target.closest<HTMLElement>('[data-line-block]');
	if (!host || !root.contains(host)) return null;

	closeSession(false);

	const editor = document.createElement('textarea');
	editor.className = 'preview-line-editor';
	editor.value = lineRangeText(source, block);
	editor.rows = Math.min(16, Math.max(1, block.end - block.start));
	editor.spellcheck = false;
	editor.addEventListener('keydown', (keyboard) => {
		if (keyboard.key === 'Escape') {
			keyboard.preventDefault();
			cancelPreviewLineEdit();
			return;
		}
		if (keyboard.key === 'Enter' && (keyboard.ctrlKey || keyboard.metaKey)) {
			keyboard.preventDefault();
			commitPreviewLineEdit();
		}
	});
	editor.addEventListener('blur', () => commitPreviewLineEdit());

	session = { host, block, editor, original: host.innerHTML, oncommit };
	host.innerHTML = '';
	host.append(editor);
	editor.focus();
	editor.setSelectionRange(editor.value.length, editor.value.length);
	return host;
}
