import { sitemapRoutes, site } from '#lib/site.js';
import type { RequestHandler } from './$types';

// Endpoints do not inherit page options from a layout, so `prerender` has to
// be declared here for this file to be written at build time.
export const prerender = true;

/**
 * Prerendered into `/sitemap.xml` at build time from `sitemapRoutes`, so
 * adding a page to the site means adding one entry to `site.ts` rather than
 * hand-editing XML.
 */
export const GET: RequestHandler = () => {
	const urls = sitemapRoutes
		.map((route) => {
			const loc = route.path === '/' ? site.url : `${site.url}${route.path}`;
			return [
				'  <url>',
				`    <loc>${loc}</loc>`,
				`    <changefreq>${route.changefreq}</changefreq>`,
				`    <priority>${route.priority.toFixed(1)}</priority>`,
				'  </url>'
			].join('\n');
		})
		.join('\n');

	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		urls,
		'</urlset>',
		''
	].join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
