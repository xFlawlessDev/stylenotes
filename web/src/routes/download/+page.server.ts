import { platforms } from '#lib/site.js';
import { fetchLatestRelease, platformFromUserAgent } from '#lib/release.js';
import type { PageServerLoad } from './$types';

// Rendered per request so the version, asset sizes and suggested platform are
// current. It is still real HTML with real links, so it stays crawlable; only
// the installer links go through `/download/<platform>`.
export const prerender = false;

export const load: PageServerLoad = async ({ request, platform }) => {
	const release = await fetchLatestRelease(fetch, platform?.env?.GITHUB_TOKEN);
	const userAgent = request.headers.get('user-agent') ?? '';

	// A hint only — the page never redirects on its own, because a shared link
	// should land on the page that lists every platform.
	const suggested = /Mozilla|Chrome|Safari|Firefox|Edg\//i.test(userAgent)
		? platformFromUserAgent(userAgent)
		: null;

	return {
		release,
		suggested,
		platforms: platforms.map((entry) => ({
			id: entry.id,
			label: entry.label,
			detail: entry.detail
		}))
	};
};
