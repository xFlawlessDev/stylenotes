import { describe, expect, it, vi } from 'vitest';
import {
	cancelPreviewLineEdit,
	commitPreviewLineEdit,
	lineRangeText,
	replaceLineRange,
	startPreviewLineEdit
} from '$lib/content/preview-line-editor';

const block = { start: 2, end: 4, editable: true };

describe('replaceLineRange', () => {
	it('swaps only the lines the block covers', () => {
		expect(replaceLineRange('a\nb\nc\nd\ne', block, 'X')).toBe('a\nb\nX\ne');
	});

	it('keeps multiple replacement lines', () => {
		expect(replaceLineRange('a\nb\nc\nd', block, 'X\nY')).toBe('a\nb\nX\nY');
	});
});

describe('lineRangeText', () => {
	it('reads back exactly the block source', () => {
		expect(lineRangeText('a\nb\nc\nd\ne', block)).toBe('c\nd');
	});
});

function mount(html: string): HTMLElement {
	const root = document.createElement('div');
	root.innerHTML = html;
	document.body.append(root);
	return root;
}

function clickOn(target: Element, root: HTMLElement): MouseEvent {
	const event = new MouseEvent('click', { bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

describe('startPreviewLineEdit', () => {
	it('replaces a block with a focused textarea holding its source lines', () => {
		const root = mount('<p data-line-block="2:4"><span>Body</span></p>');
		const span = root.querySelector('span')!;
		const oncommit = vi.fn();

		const host = startPreviewLineEdit(clickOn(span, root), root, 'a\nb\nc\nd', oncommit);
		expect(host).not.toBeNull();
		const editor = root.querySelector<HTMLTextAreaElement>('.preview-line-editor');
		expect(editor?.value).toBe('c\nd');
		expect(editor?.rows).toBe(2);
		expect(span.isConnected).toBe(false);

		commitPreviewLineEdit();
		expect(root.querySelector('.preview-line-editor')).toBeNull();
		expect(oncommit).toHaveBeenCalledWith('c\nd', block);
	});

	it('restores markup without committing on cancel', () => {
		const root = mount('<p data-line-block="2:4">Body</p>');
		const oncommit = vi.fn();

		startPreviewLineEdit(clickOn(root.querySelector('p')!, root), root, 'a\nb\nc\nd', oncommit);
		(root.querySelector('.preview-line-editor') as HTMLTextAreaElement).value = 'changed';
		cancelPreviewLineEdit();

		expect(root.querySelector('.preview-line-editor')).toBeNull();
		expect(root.innerHTML).toContain('Body');
		expect(oncommit).not.toHaveBeenCalled();
	});

	it('ignores clicks on interactive elements and untagged blocks', () => {
		const root = mount('<p data-line-block="0:1"><a href="#">link</a></p><p>plain</p>');
		expect(startPreviewLineEdit(clickOn(root.querySelector('a')!, root), root, 'a', vi.fn())).toBeNull();
		expect(startPreviewLineEdit(clickOn(root.querySelectorAll('p')[1], root), root, 'a', vi.fn())).toBeNull();
	});
});
