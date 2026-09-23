import { vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

// jsdom has no ResizeObserver, but Svelte's `bind:clientWidth`/`bind:offsetWidth`
// rely on it. A no-op stub is enough for components to mount.
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
