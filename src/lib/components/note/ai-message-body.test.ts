import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

// The real pipeline pulls in Shiki/Mermaid; stub it to keep this a UI test.
vi.mock('$lib/content/note-actions', () => ({
	renderNoteHtml: vi.fn(async (body: string) => `<p>rendered:${body}</p>`)
}));
vi.mock('$lib/content/mermaid-preview', () => ({
	renderNotePreviewHtml: vi.fn(async (html: string) => html)
}));
vi.mock('$lib/content/preview-actions', () => ({
	handlePreviewAction: vi.fn(async () => false)
}));

import AiMessageBody from './AiMessageBody.svelte';

function mountInto(props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const app = mount(AiMessageBody as any, { target, props });
	flushSync();
	return { target, app };
}

/** Lets the async render effect settle. */
async function settle() {
	for (let i = 0; i < 5; i += 1) {
		await Promise.resolve();
		flushSync();
	}
}

describe('AiMessageBody', () => {
	it('shows raw text while streaming, without rendering Markdown', () => {
		const { target, app } = mountInto({ content: '**bold**', streaming: true });

		expect(target.textContent).toContain('**bold**');
		expect(target.querySelector('p')).toBeNull();

		unmount(app);
	});

	it('renders Markdown once streaming ends', async () => {
		const { target, app } = mountInto({ content: '**bold**', streaming: false });
		await settle();

		expect(target.innerHTML).toContain('rendered:**bold**');

		unmount(app);
	});

	it('falls back to raw text when the render fails', async () => {
		const noteActions = await import('$lib/content/note-actions');
		vi.mocked(noteActions.renderNoteHtml).mockRejectedValueOnce(new Error('boom'));

		const { target, app } = mountInto({ content: '# Heading', streaming: false });
		await settle();

		expect(target.textContent).toContain('# Heading');

		unmount(app);
	});

	it('forwards a wiki-link click', async () => {
		const noteActions = await import('$lib/content/note-actions');
		vi.mocked(noteActions.renderNoteHtml).mockResolvedValueOnce(
			'<p><a class="wiki-link" href="#n1" data-wiki-target="n1" data-wiki-kind="note">Roadmap</a></p>'
		);

		const onwikilink = vi.fn();
		const { target, app } = mountInto({ content: 'see [[Roadmap]]', onwikilink });
		await settle();

		target.querySelector<HTMLAnchorElement>('a.wiki-link')?.click();
		await settle();

		expect(onwikilink).toHaveBeenCalledWith(
			expect.objectContaining({ target: { id: 'n1', kind: 'note' } })
		);

		unmount(app);
	});
});
