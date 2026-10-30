import { defineConfig } from 'vitest/config';

/**
 * Tests cover the pure modules only (`src/lib/*.ts`), so they need no browser,
 * no Svelte compiler, and no SvelteKit plugin — which keeps them fast and
 * keeps this config from fighting the framework plugin.
 *
 * `__SITE_URL__` is defined here because `vite.config.ts` normally injects it;
 * without it, importing `site.ts` in a test throws a ReferenceError.
 */
export default defineConfig({
	define: {
		__SITE_URL__: JSON.stringify('https://stylenotes.evofast.net')
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
