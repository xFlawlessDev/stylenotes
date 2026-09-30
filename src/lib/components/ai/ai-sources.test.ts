import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CitationSource } from '$lib/content/ai-citations';

import AiSources from './AiSources.svelte';

const sources: CitationSource[] = [
	{ index: 1, kind: 'note', ref: 'w1/n1', id: 'n1', title: 'Roadmap', description: 'The plan' },
	{ index: 2, kind: 'web', ref: 'https://example.com/a', id: 'https://example.com/a', title: 'Docs' }
];

function mountSources(items: CitationSource[], onsource = vi.fn()) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(AiSources as never, { target, props: { sources: items, onsource } });
	flushSync();
	return { target, app, onsource };
}

function button(target: HTMLElement, text: string): HTMLButtonElement {
	const match = [...target.querySelectorAll('button')].find((element) =>
		element.textContent?.includes(text)
	);
	if (!match) throw new Error(`no button matching ${text}`);
	return match as HTMLButtonElement;
}

describe('AiSources', () => {
	it('renders nothing without sources', () => {
		const { target, app } = mountSources([]);
		expect(target.textContent?.trim()).toBe('');
		unmount(app);
	});

	it('summarizes the count and hides the list until opened', () => {
		const { target, app } = mountSources(sources);
		expect(target.textContent).toContain('Used 2 sources');
		expect(target.textContent).not.toContain('Roadmap');
		unmount(app);
	});

	it('reveals every source when expanded', () => {
		const { target, app } = mountSources(sources);
		button(target, 'Used 2 sources').click();
		flushSync();
		expect(target.textContent).toContain('Roadmap');
		expect(target.textContent).toContain('Docs');
		unmount(app);
	});

	it('reports the clicked source to the parent', () => {
		const onsource = vi.fn();
		const { target, app } = mountSources(sources, onsource);
		button(target, 'Used 2 sources').click();
		flushSync();
		button(target, 'Roadmap').click();
		expect(onsource).toHaveBeenCalledWith(sources[0]);
		unmount(app);
	});

	it('uses the singular label for one source', () => {
		const { target, app } = mountSources([sources[0]]);
		expect(target.textContent).toContain('Used 1 source');
		unmount(app);
	});
});
