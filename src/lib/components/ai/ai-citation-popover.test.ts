import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CitationSource } from '$lib/content/ai-citations';

import AiCitationPopover from './AiCitationPopover.svelte';

const noteSource: CitationSource = {
	index: 1,
	kind: 'note',
	ref: 'w1/n1',
	id: 'n1',
	title: 'Roadmap',
	description: 'Old excerpt',
	content: 'Captured body'
};

const webSource: CitationSource = {
	index: 2,
	kind: 'web',
	ref: 'https://example.com/a',
	id: 'https://example.com/a',
	title: 'Docs',
	content: 'Page text'
};

function mountCard(
	source: CitationSource,
	entities: { id: string; title: string; body?: string }[] = [],
	onopen = vi.fn()
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(AiCitationPopover as never, {
		target,
		props: { source, entities, onopen }
	});
	flushSync();
	return { target, app, onopen };
}

function button(target: HTMLElement, text: string): HTMLButtonElement {
	const match = [...target.querySelectorAll('button')].find((element) =>
		element.textContent?.includes(text)
	);
	if (!match) throw new Error(`no button matching ${text}`);
	return match as HTMLButtonElement;
}

describe('AiCitationPopover', () => {
	it('shows the title and the live body over the captured content', () => {
		const { target, app } = mountCard(noteSource, [
			{ id: 'n1', title: 'Roadmap', body: 'Fresh live body' }
		]);
		expect(target.textContent).toContain('Roadmap');
		expect(target.textContent).toContain('Fresh live body');
		expect(target.textContent).not.toContain('Captured body');
		unmount(app);
	});

	it('falls back to the captured content when no live record matches', () => {
		const { target, app } = mountCard(noteSource);
		expect(target.textContent).toContain('Captured body');
		unmount(app);
	});

	it('offers a note-specific open action', () => {
		const { target, app } = mountCard(noteSource);
		expect(target.textContent).toContain('Open note');
		unmount(app);
	});

	it('offers a browser action for a web source and shows its host', () => {
		const { target, app } = mountCard(webSource);
		expect(target.textContent).toContain('Open in browser');
		expect(target.textContent).toContain('example.com');
		unmount(app);
	});

	it('reports the open action with the source', () => {
		const onopen = vi.fn();
		const { target, app } = mountCard(noteSource, [], onopen);
		button(target, 'Open note').click();
		expect(onopen).toHaveBeenCalledWith(noteSource);
		unmount(app);
	});

	it('says so when there is nothing to preview', () => {
		const { target, app } = mountCard({
			index: 3,
			kind: 'task',
			ref: 'w1/t1',
			id: 't1',
			title: 'Ship it'
		});
		expect(target.textContent).toContain('No preview available.');
		unmount(app);
	});
});
