// This route is dynamic (it reads the latest release), so it must not inherit
// the layout's `prerender = true`. Kept in its own file because page options
// cannot live in `+page.svelte` with SvelteKit 3's static analysis.
export const prerender = false;
