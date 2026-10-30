import { describe, expect, it } from 'vitest';
import { redirect } from '@sveltejs/kit';

/**
 * Pins the redirect contract that `/download/[platform]` depends on.
 *
 * SvelteKit 3 throws when a redirect targets an origin that is not
 * allowlisted, and that throw reaches the browser as a 500 — which is exactly
 * what happened in production before the allowlist was added.
 *
 * The thrown value is SvelteKit's own `Redirect` object, not an `Error`, so
 * these tests call the function directly instead of using `toThrow()`.
 */
function attempt(location: string, external?: { external: string[] }) {
	try {
		redirect(302, location, external);
		return null;
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}
}

const allowGithub = { external: ['https://github.com'] };

describe('redirect to a release asset', () => {
	const asset =
		'https://github.com/xFlawlessDev/stylenotes/releases/download/v0.1.1/StyleNotes_0.1.1_x64_en-US.msi';

	it('returns a 302 when github.com is allowlisted', () => {
		const result = attempt(asset, allowGithub);
		expect(result?.status).toBe(302);
		expect(result?.location).toBe(asset);
	});

	it('refuses an external redirect with no allowlist', () => {
		expect(attempt(asset)).not.toBeNull();
	});

	it('refuses a lookalike host', () => {
		expect(attempt('https://github.com.evil.test/x', allowGithub)).not.toBeNull();
	});

	it('refuses the same host over http', () => {
		expect(attempt('http://github.com/x', allowGithub)).not.toBeNull();
	});
});
