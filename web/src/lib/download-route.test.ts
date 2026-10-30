import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../routes/download/[platform]/+server.js';

/**
 * End-to-end check of the download handler, without a server.
 *
 * This exists because the route returned a 500 in production twice, for two
 * different reasons:
 *
 * 1. SvelteKit 3 throws on a redirect to an origin that is not allowlisted,
 *    and the throw surfaces as a 500 rather than a redirect.
 * 2. The signature-file suffix matched the installer suffix, so the handler
 *    redirected to a `.sig` file.
 *
 * The handler is called directly and the thrown `Redirect` is inspected.
 */

const release = {
	tag_name: 'v0.1.1',
	name: 'StyleNotes v0.1.1',
	published_at: '2026-10-06T00:00:00Z',
	html_url: 'https://github.com/xFlawlessDev/stylenotes/releases/tag/v0.1.1',
	assets: [
		{
			name: 'StyleNotes_0.1.1_x64_en-US.msi.sig',
			browser_download_url: 'https://github.com/x/sig.msi.sig',
			size: 440
		},
		{
			name: 'StyleNotes_0.1.1_x64_en-US.msi',
			browser_download_url: 'https://github.com/x/StyleNotes_0.1.1_x64_en-US.msi',
			size: 17276928
		}
	]
};

type Outcome = { status: number; location: string };

async function call(platform: string): Promise<Outcome | Response> {
	try {
		return await GET({
			params: { platform },
			platform: { env: {} },
			setHeaders: () => {}
		} as never);
	} catch (thrown) {
		return thrown as Outcome;
	}
}

describe('/download/[platform]', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(release), { status: 200 }))
		);
	});

	it('redirects to the installer, not to its signature', async () => {
		const result = (await call('windows')) as Outcome;
		expect(result.status).toBe(302);
		expect(result.location).toContain('StyleNotes_0.1.1_x64_en-US.msi');
		expect(result.location.endsWith('.sig')).toBe(false);
	});

	it('does not throw on an external destination (the 500 bug)', async () => {
		const result = await call('windows');
		expect(result).not.toBeInstanceOf(Response);
		expect((result as Outcome).status).toBe(302);
	});

	it('404s an unknown platform', async () => {
		const result = (await call('android')) as { status: number };
		expect(result.status).toBe(404);
	});

	it('falls back to the releases page when GitHub is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
		const result = (await call('windows')) as Outcome;
		expect(result.status).toBe(302);
		expect(result.location).toBe('https://github.com/xFlawlessDev/stylenotes/releases/latest');
	});
});
