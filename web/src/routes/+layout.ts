// Every page is prerendered to HTML at build time. Only the routes that must
// answer per request (`/download/*`) opt out with `prerender = false`.
export const prerender = true;
export const trailingSlash = 'never';
