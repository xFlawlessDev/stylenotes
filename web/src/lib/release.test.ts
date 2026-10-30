import { describe, expect, it } from 'vitest';
import {
	fetchLatestRelease,
	pickAsset,
	platformFromUserAgent,
	type ReleaseAsset
} from './release.js';

const asset = (name: string): ReleaseAsset => ({
	name,
	url: `https://example.test/${name}`,
	size: 1
});

describe('pickAsset', () => {
	const assets = [
		asset('StyleNotes_0.1.1_x64_en-US.msi'),
		asset('StyleNotes_0.1.1_x64-setup.exe'),
		asset('StyleNotes_0.1.1_aarch64.dmg'),
		asset('StyleNotes_0.1.1_amd64.AppImage'),
		asset('StyleNotes_0.1.1_amd64.deb'),
		asset('latest.json'),
		asset('StyleNotes_0.1.1_x64.app.tar.gz')
	];

	it('picks the msi for Windows, not the setup exe', () => {
		expect(pickAsset(assets, 'windows')?.name).toBe('StyleNotes_0.1.1_x64_en-US.msi');
	});

	it('falls back to the exe when no msi was published', () => {
		const noMsi = assets.filter((a) => !a.name.endsWith('.msi'));
		expect(pickAsset(noMsi, 'windows')?.name).toBe('StyleNotes_0.1.1_x64-setup.exe');
	});

	it('picks the dmg for macOS', () => {
		expect(pickAsset(assets, 'macos')?.name).toBe('StyleNotes_0.1.1_aarch64.dmg');
	});

	it('picks the AppImage for Linux, never the .deb', () => {
		expect(pickAsset(assets, 'linux')?.name).toBe('StyleNotes_0.1.1_amd64.AppImage');
	});

	it('never hands an updater archive to a platform', () => {
		// `.tar.gz` is the updater payload, not something a person installs.
		const onlyUpdater = [asset('StyleNotes_x64.app.tar.gz')];
		expect(pickAsset(onlyUpdater, 'linux')).toBeUndefined();
	});

	it('never hands a signature file to a platform', () => {
		// `.sig` files share the installer's suffix. Shipping the 440-byte
		// signature instead of the 17 MB installer was a real production bug.
		const withSigs = [
			asset('StyleNotes_0.1.1_x64_en-US.msi.sig'),
			asset('StyleNotes_0.1.1_aarch64.dmg.sig'),
			asset('StyleNotes_0.1.1_amd64.AppImage.sig')
		];
		expect(pickAsset(withSigs, 'windows')).toBeUndefined();
		expect(pickAsset(withSigs, 'macos')).toBeUndefined();
		expect(pickAsset(withSigs, 'linux')).toBeUndefined();
	});

	it('picks the installer, not its signature, when both are present', () => {
		const both = [
			asset('StyleNotes_0.1.1_x64_en-US.msi.sig'),
			asset('StyleNotes_0.1.1_x64_en-US.msi')
		];
		expect(pickAsset(both, 'windows')?.name).toBe('StyleNotes_0.1.1_x64_en-US.msi');
	});

	it('returns undefined when the release has no matching asset', () => {
		expect(pickAsset([asset('latest.json')], 'macos')).toBeUndefined();
	});

	it('matches case-insensitively', () => {
		expect(pickAsset([asset('STYLENOTES_X64.MSI')], 'windows')?.name).toBe('STYLENOTES_X64.MSI');
	});
});

describe('platformFromUserAgent', () => {
	it('detects Windows', () => {
		expect(
			platformFromUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
			)
		).toBe('windows');
	});

	it('detects macOS without mistaking it for Linux', () => {
		expect(
			platformFromUserAgent(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
			)
		).toBe('macos');
	});

	it('defaults to Linux for an X11 desktop browser', () => {
		expect(
			platformFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120')
		).toBe('linux');
	});

	it('does not read an Android tablet as macOS', () => {
		// Android UAs contain "Linux", not "Mac OS X", but iOS ones do contain
		// "Mac OS X" — this pins the ordering that keeps them apart.
		expect(
			platformFromUserAgent(
				'Mozilla/5.0 (Linux; Android 13; Pixel Tablet) AppleWebKit/537.36 Chrome/120'
			)
		).toBe('linux');
	});
});

describe('fetchLatestRelease', () => {
	const payload = {
		tag_name: 'v0.1.1',
		name: 'StyleNotes v0.1.1',
		published_at: '2026-01-01T00:00:00Z',
		html_url: 'https://github.com/xFlawlessDev/stylenotes/releases/tag/v0.1.1',
		assets: [
			{ name: 'StyleNotes_0.1.1_x64_en-US.msi', browser_download_url: 'https://x/a.msi', size: 10 },
			{ name: 'no-url-asset' }
		]
	};

	it('maps the GitHub payload and drops assets without a download URL', async () => {
		const fakeFetch = (async () =>
			new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;

		const release = await fetchLatestRelease(fakeFetch);

		expect(release?.tag).toBe('v0.1.1');
		expect(release?.assets).toHaveLength(1);
		expect(release?.assets[0].url).toBe('https://x/a.msi');
	});

	it('returns null on a rate-limited or failed request', async () => {
		const fakeFetch = (async () =>
			new Response('rate limited', { status: 403 })) as unknown as typeof fetch;

		expect(await fetchLatestRelease(fakeFetch)).toBeNull();
	});

	it('sends the token as a bearer credential when one is given', async () => {
		let seen: Record<string, string> = {};
		const fakeFetch = (async (_url: string, init: RequestInit) => {
			seen = init.headers as Record<string, string>;
			return new Response(JSON.stringify(payload), { status: 200 });
		}) as unknown as typeof fetch;

		await fetchLatestRelease(fakeFetch, 'secret-token');

		expect(seen.authorization).toBe('Bearer secret-token');
	});
});
