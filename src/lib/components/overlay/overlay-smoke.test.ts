import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import Host from './overlay-test-host.svelte';

describe('overlay window', () => {
	it('renders the dock rail without throwing', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(Host, { target });
		flushSync();

		const buttons = document.querySelectorAll('button');
		expect(buttons.length).toBeGreaterThan(0);

		// Base buttons share one structural class set; the drag handle stays native.
		const baseButtons = document.querySelectorAll('[data-slot="base-button"]');
		expect(baseButtons.length).toBeGreaterThan(0);
		for (const button of baseButtons) {
			expect(button.className).toContain('inline-flex');
		}

		unmount(app);
		target.remove();
	});
});
