import { isTauri } from '$lib/windows';

/**
 * External links in rendered Markdown should leave the app, not navigate the
 * webview: `target="_blank"` and `window.open` are not reliable inside a Tauri
 * window (the webview would load the page over the app). Opener hands the URL
 * to the OS default browser instead.
 */

const EXTERNAL_URI = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function isExternalHref(href: string): boolean {
	if (!href) return false;
	if (href.startsWith('#')) return false;
	if (!EXTERNAL_URI.test(href)) return false;
	// `asset:` points at a local attachment; those are shown in-app.
	return !href.toLowerCase().startsWith('asset:');
}

/** The external URL behind a click, or null for wiki links, anchors, and in-app targets. */
export function externalHrefFromTarget(target: EventTarget | null, root: HTMLElement): string | null {
	if (!(target instanceof Element)) return null;
	const anchor = target.closest<HTMLAnchorElement>('a[href]');
	if (!anchor || !root.contains(anchor)) return null;
	if (anchor.closest('a[data-wiki-target], a[data-wiki-target-text], a[data-wiki-candidates]')) {
		return null;
	}
	if (anchor.hasAttribute('download')) return null;
	const href = anchor.getAttribute('href') ?? '';
	if (!isExternalHref(href)) return null;
	// `mailto:`/`tel:` etc. keep their scheme; relative links resolve first.
	try {
		return new URL(href, window.location.href).href;
	} catch {
		return href;
	}
}

/** Opens a URL with the OS default application. Returns false when it cannot be handed off. */
export async function openExternalUrl(url: string): Promise<boolean> {
	if (!isTauri) {
		window.open(url, '_blank', 'noopener,noreferrer');
		return true;
	}
	try {
		const { openUrl } = await import('@tauri-apps/plugin-opener');
		await openUrl(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Handles a click on an external link inside rendered Markdown. Returns true
 * when the click was consumed, so the caller can stop before its own logic.
 */
export function handleExternalLink(event: MouseEvent, root: HTMLElement): boolean {
	if (event.defaultPrevented || event.button !== 0) return false;
	if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
	const href = externalHrefFromTarget(event.target, root);
	if (!href) return false;
	event.preventDefault();
	event.stopPropagation();
	void openExternalUrl(href);
	return true;
}
