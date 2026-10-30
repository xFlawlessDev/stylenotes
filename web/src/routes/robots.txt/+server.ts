import { site } from '#lib/site.js';
import type { RequestHandler } from './$types';

// Endpoints do not inherit page options from a layout, so `prerender` has to
// be declared here for this file to be written at build time.
export const prerender = true;

/**
 * Prerendered into `/robots.txt` at build time.
 *
 * The sitemap URL is absolute because the file is fetched by crawlers from
 * the site root, where a relative path is ambiguous.
 */
export const GET: RequestHandler = () => {
	const body = [
		'User-agent: *',
		'Allow: /',
		'',
		`Sitemap: ${site.url}/sitemap.xml`,
		''
	].join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
