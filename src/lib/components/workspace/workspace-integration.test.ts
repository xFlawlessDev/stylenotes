import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import Harness from '$lib/components/workspace/workspace-harness.svelte';

/**
 * End-to-end-ish mount of the workspace window. This guards the controller
 * refactor specifically: the derived values (`folders`, `visible`) must stay
 * live after the async hydration fills `state.items`, otherwise the feed shows
 * "Nothing here yet" even though notes loaded.
 */
async function mountWorkspace() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(Harness, { target });
	flushSync();
	// Hydration runs after mount; let its microtasks settle.
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushSync();
	return { target, app };
}

describe('Workspace', () => {
	it('renders seeded notes and live folder counts after hydration', async () => {
		const { target, app } = await mountWorkspace();
		const text = target.textContent ?? '';
		expect(text).toContain('All Notes');
		// The All folder counts the hydrated note(s); a stale derived reads 0.
		expect(text).toMatch(/All Notes\s+[1-9]/);
		expect(text).not.toContain('Nothing here yet');
		unmount(app);
	});
});
