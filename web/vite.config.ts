import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * The canonical origin. One value, used twice: `paths.origin` fixes the URLs
 * SvelteKit writes into prerendered HTML, and `__SITE_URL__` feeds `site.ts`
 * so the canonical link, Open Graph tags, and the sitemap all agree.
 *
 * Both are baked at build time on purpose. A canonical URL cannot come from a
 * runtime variable: the HTML that contains it is prerendered and uploaded to
 * the CDN, so it would still say whatever the build said.
 */
const origin = process.env.PUBLIC_SITE_URL ?? 'https://stylenotes.evofast.net';

export default defineConfig({
	define: {
		__SITE_URL__: JSON.stringify(origin)
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			preprocess: vitePreprocess(),
			paths: { origin },
			prerender: {
				// A broken internal link should fail CI, not ship a 404.
				handleHttpError: 'fail',
				handleMissingId: 'warn'
			}
		})
	],
	server: {
		port: 5173
	}
});
