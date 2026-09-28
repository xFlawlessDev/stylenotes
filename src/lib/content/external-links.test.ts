// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openUrl = vi.fn(async (_url: string) => undefined);

vi.mock('@tauri-apps/plugin-opener', () => ({
	openUrl: (url: string) => openUrl(url),
}));

// `isTauri` is read once at module load; fake the internals marker so the
// opener branch runs (the real desktop path).
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
const { externalHrefFromTarget, handleExternalLink } = await import('$lib/content/external-links');

function build(html: string): HTMLElement {
	const root = document.createElement('div');
	root.innerHTML = html;
	document.body.append(root);
	return root;
}

function click(root: HTMLElement, selector: string, init: MouseEventInit = {}): MouseEvent {
	const target = root.querySelector(selector);
	if (!target) throw new Error(`missing ${selector}`);
	const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
}

/** Lets the fire-and-forget opener import/settle before assertions. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	openUrl.mockClear();
	document.body.innerHTML = '';
	// jsdom has no Tauri internals, so `isTauri` is false and the browser path runs.
});

describe('externalHrefFromTarget', () => {
	it('resolves http and mailto links inside the root', () => {
		const root = build('<a href="https://example.com/a">x</a><a href="mailto:me@example.com">m</a>');
		expect(externalHrefFromTarget(root.querySelector('a'), root)).toBe('https://example.com/a');
		expect(externalHrefFromTarget(root.querySelectorAll('a')[1], root)).toBe('mailto:me@example.com');
	});

	it('ignores wiki links, in-page anchors, relative paths, and asset URLs', () => {
		const root = build(
			'<a href="#" data-wiki-target="n1">w</a><a href="#section">s</a><a href="./note">r</a><a href="asset://localhost/cat.png">i</a>',
		);
		for (const anchor of root.querySelectorAll('a')) {
			expect(externalHrefFromTarget(anchor, root)).toBeNull();
		}
	});

	it('ignores anchors outside the root and non-element targets', () => {
		const root = build('<p>hi</p>');
		const outside = build('<a href="https://example.com">x</a>');
		expect(externalHrefFromTarget(outside.querySelector('a'), root)).toBeNull();
		expect(externalHrefFromTarget(new EventTarget(), root)).toBeNull();
	});
});

describe('handleExternalLink', () => {
	it('opens the default browser and consumes a plain left click', async () => {
		const root = build('<a href="https://example.com/docs">docs</a>');
		const event = click(root, 'a');
		expect(handleExternalLink(event, root)).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		await flush();
		expect(openUrl).toHaveBeenCalledWith('https://example.com/docs');
	});

	it('ignores modified clicks so the webview can keep them', () => {
		const root = build('<a href="https://example.com">x</a>');
		for (const init of [
			{ ctrlKey: true },
			{ metaKey: true },
			{ shiftKey: true },
			{ altKey: true },
			{ button: 1 },
		]) {
			openUrl.mockClear();
			expect(handleExternalLink(click(root, 'a', init), root)).toBe(false);
			expect(openUrl).not.toHaveBeenCalled();
		}
	});

	it('lets wiki links fall through to their own handler', () => {
		const root = build('<a href="https://example.com" data-wiki-target="n1">w</a>');
		expect(handleExternalLink(click(root, 'a'), root)).toBe(false);
		expect(openUrl).not.toHaveBeenCalled();
	});

	it('returns false for clicks that are not on a link', () => {
		const root = build('<p>plain text</p>');
		expect(handleExternalLink(click(root, 'p'), root)).toBe(false);
		expect(openUrl).not.toHaveBeenCalled();
	});
});
