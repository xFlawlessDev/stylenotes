import { platforms, site, type PlatformId } from '#lib/site.js';

export type ReleaseAsset = { name: string; url: string; size: number };

export type LatestRelease = {
	tag: string;
	name: string;
	publishedAt: string;
	htmlUrl: string;
	assets: ReleaseAsset[];
};

/**
 * Pick the best installer for a platform from a release's asset list.
 *
 * Release assets are named by `tauri-action`, so the suffix is the only
 * reliable discriminator — and the order matters: `.msi` should win over a
 * `.exe` if both exist, and a `.dmg` must not be handed to Windows.
 *
 * Signature files (`.sig`) are rejected outright. They share the installer's
 * suffix, so without this an asset scan can return the 440-byte signature
 * instead of the 17 MB installer.
 */
export function pickAsset(
	assets: readonly ReleaseAsset[],
	platform: PlatformId
): ReleaseAsset | undefined {
	const suffixes = platforms.find((p) => p.id === platform)?.suffixes ?? [];

	for (const suffix of suffixes) {
		// Both sides are lowercased: `.AppImage` would otherwise never match,
		// because the comparison lowercases the asset name but not the suffix.
		const needle = suffix.toLowerCase();
		const match = assets.find(
			(asset) =>
				!asset.name.toLowerCase().endsWith('.sig') && asset.name.toLowerCase().endsWith(needle)
		);
		if (match) return match;
	}

	return undefined;
}

/** Best-effort platform guess from a User-Agent string. */
export function platformFromUserAgent(userAgent: string): PlatformId {
	const ua = userAgent.toLowerCase();

	// Order matters: iOS/Android UAs also contain "mac os x" and "linux".
	if (ua.includes('windows')) return 'windows';
	if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
	return 'linux';
}

/**
 * Fetch the latest published release from the GitHub API.
 *
 * `GITHUB_TOKEN` is optional but recommended: the unauthenticated limit is 60
 * requests per hour per IP, and Workers share egress IPs, so an unauthenticated
 * deployment will hit that ceiling quickly.
 *
 * The response is cached at the edge for 10 minutes. Cloudflare runs many
 * requests from the same egress IPs, so without this the site exhausts the
 * anonymous quota on its own — which looks like "no release found" and sends
 * every download to the releases page instead of an installer.
 */
const API_URL = 'https://api.github.com/repos/xFlawlessDev/stylenotes/releases/latest';
const CACHE_SECONDS = 600;

export async function fetchLatestRelease(
	fetchImpl: typeof fetch,
	token?: string
): Promise<LatestRelease | null> {
	// `caches.default` is Cloudflare's shared cache. It is not part of the DOM
	// `CacheStorage` type, so it is typed locally; in dev, in tests, and on any
	// other host the property is simply absent and the fetch still happens.
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;

	const request = new Request(API_URL, {
		headers: {
			accept: 'application/vnd.github+json',
			'user-agent': `${site.name}-website`
		}
	});

	if (cache) {
		const hit = await cache.match(request);
		if (hit) return (await hit.json()) as LatestRelease;
	}

	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		'user-agent': `${site.name}-website`
	};
	if (token) headers.authorization = `Bearer ${token}`;

	const response = await fetchImpl(API_URL, { headers });

	if (!response.ok) return null;

	const data = (await response.json()) as {
		tag_name?: string;
		name?: string;
		published_at?: string;
		html_url?: string;
		assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
	};

	const release: LatestRelease = {
		tag: data.tag_name ?? '',
		name: data.name ?? data.tag_name ?? '',
		publishedAt: data.published_at ?? '',
		htmlUrl: data.html_url ?? site.releases,
		assets: (data.assets ?? [])
			.filter((asset) => asset.name && asset.browser_download_url)
			.map((asset) => ({
				name: asset.name as string,
				url: asset.browser_download_url as string,
				size: asset.size ?? 0
			}))
	};

	if (cache) {
		const stored = new Response(JSON.stringify(release), {
			headers: {
				'content-type': 'application/json',
				'cache-control': `public, max-age=${CACHE_SECONDS}`
			}
		});
		// `put` returns a promise; in a Worker `waitUntil` keeps it alive past
		// the response. Await it anyway: a redirect that resolves before the
		// write lands would leave the cache cold on every request.
		await cache.put(request, stored);
	}

	return release;
}
