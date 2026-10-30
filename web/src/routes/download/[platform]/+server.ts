import { error, redirect } from '@sveltejs/kit';
import { platforms, site, type PlatformId } from '#lib/site.js';
import { fetchLatestRelease, pickAsset } from '#lib/release.js';
import type { RequestHandler } from './$types';

// This route must answer per request, so it is the one place that opts out of
// the layout's `prerender = true`.
export const prerender = false;

const isPlatform = (value: string): value is PlatformId =>
	platforms.some((platform) => platform.id === value);

/**
 * SvelteKit 3 refuses a redirect to another origin unless it is explicitly
 * allowed, and it throws rather than returning a `Location` header — which is
 * why an unlisted destination surfaces as a 500, not a redirect. Both
 * destinations here are on github.com (release assets resolve through
 * `browser_download_url`), so that one origin is allowlisted. Not `true`:
 * that would permit any origin a release payload could ever name.
 */
const external = { external: ['https://github.com'] };

/**
 * `/download/[platform]` redirects to the matching installer of the latest
 * GitHub release.
 *
 * A redirect rather than a link straight to the release page, because: the URL
 * here never goes stale after a release, the download still counts in GitHub's
 * release metrics, and the visitor gets a file instead of a page to hunt on.
 */
export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
	const id = params.platform;

	if (!isPlatform(id)) {
		error(404, `Unknown platform "${id}".`);
	}

	const release = await fetchLatestRelease(fetch, platform?.env?.GITHUB_TOKEN);

	// A GitHub outage should not strand the visitor: send them to the release
	// page, which lists every installer, rather than to a dead end.
	if (!release) {
		redirect(302, site.latestRelease, external);
	}

	const asset = pickAsset(release.assets, id);

	if (!asset) {
		redirect(302, release.htmlUrl, external);
	}

	// The redirect itself must never be cached: it has to point at the newest
	// release, not the one that was current when a CDN first saw this URL.
	setHeaders({ 'cache-control': 'no-store' });

	redirect(302, asset.url, external);
};
