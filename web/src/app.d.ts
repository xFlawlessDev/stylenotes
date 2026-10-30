// See https://svelte.dev/docs/kit/types#app
declare global {
	/** Injected by `vite.config.ts` from `PUBLIC_SITE_URL`. */
	const __SITE_URL__: string;

	namespace App {
		interface Error {
			message: string;
		}
		interface Platform {
			env: {
				/** Optional: raises the GitHub API rate limit for release lookups. */
				GITHUB_TOKEN?: string;
			};
			ctx: {
				waitUntil(promise: Promise<unknown>): void;
			};
			caches: CacheStorage;
			cf?: unknown;
		}
	}
}

export {};
