/**
 * Pure model + CSS generation for UI plugins: a plugin carries a handful of
 * theme tokens and an optional raw CSS block. Several plugins can be enabled
 * at once; they are stacked in `position` order so the last one wins.
 */

export type UiPluginColorKey = 'primary' | 'background' | 'surface' | 'foreground';

export type UiPluginTokens = {
	primary?: string;
	background?: string;
	surface?: string;
	foreground?: string;
	radius?: number;
	glassBlur?: number;
	fontFamily?: string;
};

export type UiPlugin = {
	id: string;
	name: string;
	tokens: UiPluginTokens;
	css: string;
	enabled: boolean;
	position: number;
	createdAt: string;
	updatedAt: string;
};

export type UiPluginPatch = Partial<Pick<UiPlugin, 'name' | 'tokens' | 'css' | 'enabled' | 'position'>>;

export const MAX_PLUGIN_CSS = 20_000;
export const MAX_PLUGIN_NAME = 60;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT_SAFE = /^[A-Za-z0-9 '\-_",.]+$/;

/** Accepts `#rgb`, `#rgba`, `#rrggbb`, and `#rrggbbaa`, otherwise `null`. */
export function sanitizeColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return HEX.test(trimmed) ? trimmed : null;
}

/** Turns any readable CSS color into `#rrggbb` so it fits `<input type="color">`. */
export function normalizeColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const v = value.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(v)) return v;
	if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
	const rgb = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
	if (!rgb) return null;
	const channel = (n: string) =>
		Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');
	return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}

/** A font stack with no CSS metacharacters, so it can only ever name fonts. */
export function sanitizeFont(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const v = value.trim().replace(/\s+/g, ' ');
	if (!v || v.length > 120 || !FONT_SAFE.test(v)) return null;
	return v;
}

export function sanitizeSize(value: unknown, min: number, max: number): number | undefined {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return undefined;
	return Math.min(max, Math.max(min, Math.round(n)));
}

/** Drops remote imports and style tags; user CSS is injected via `textContent`. */
export function sanitizeCss(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value
		.replace(/@import[^;{]*;?/gi, '')
		.replace(/<\/?style[^>]*>/gi, '')
		.slice(0, MAX_PLUGIN_CSS);
}

export function sanitizeTokens(input: unknown): UiPluginTokens {
	const out: UiPluginTokens = {};
	if (!input || typeof input !== 'object') return out;
	const raw = input as Record<string, unknown>;

	const colors: [UiPluginColorKey, unknown][] = [
		['primary', raw.primary],
		['background', raw.background],
		['surface', raw.surface],
		['foreground', raw.foreground],
	];
	for (const [key, value] of colors) {
		const hex = sanitizeColor(value);
		if (hex) out[key] = hex;
	}
	if ('radius' in raw) {
		const n = sanitizeSize(raw.radius, 0, 24);
		if (n !== undefined) out.radius = n;
	}
	if ('glassBlur' in raw) {
		const n = sanitizeSize(raw.glassBlur, 0, 48);
		if (n !== undefined) out.glassBlur = n;
	}
	const font = sanitizeFont(raw.fontFamily);
	if (font) out.fontFamily = font;
	return out;
}

/** Coerces untrusted payload into a plugin, or `null` when it is unusable. */
export function normalizePlugin(value: unknown): UiPlugin | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (typeof raw.id !== 'string' || !raw.id) return null;
	const now = new Date().toISOString();
	const name = typeof raw.name === 'string' ? raw.name.trim() : '';
	return {
		id: raw.id,
		name: name.slice(0, MAX_PLUGIN_NAME) || 'Untitled plugin',
		tokens: sanitizeTokens(raw.tokens),
		css: sanitizeCss(raw.css),
		enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
		position: Number.isFinite(Number(raw.position)) ? Number(raw.position) : 0,
		createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
	};
}

/**
 * Emits the token block as `:root { … !important }` so a plugin wins over the
 * mode (`html.light`) and accent (`html[data-accent]`) palettes regardless of
 * source order; `!important` also makes later plugins override earlier ones.
 *
 * Typeface needs its own selectors: Tailwind v4 `@theme inline` compiles the
 * font utilities to a literal stack, so overriding `--font-*` alone does
 * nothing. Targeting the utilities directly keeps the token effective.
 */
export function tokensToCss(tokens: UiPluginTokens): string {
	const t = sanitizeTokens(tokens);
	const blocks: string[] = [];
	const decls: string[] = [];
	const add = (name: string, value: string) => decls.push(`\t${name}: ${value} !important;`);

	if (t.primary) {
		add('--primary', t.primary);
		add('--color-primary', t.primary);
	}
	if (t.background) {
		add('--background', t.background);
		add('--color-surface', t.background);
	}
	if (t.surface) {
		add('--card', t.surface);
		add('--popover', t.surface);
		add('--color-surface-container', t.surface);
	}
	if (t.foreground) {
		add('--foreground', t.foreground);
		add('--card-foreground', t.foreground);
		add('--color-on-surface', t.foreground);
	}
	if (t.radius !== undefined) add('--radius', `${t.radius}px`);
	if (t.glassBlur !== undefined) add('--glass-blur', `${t.glassBlur}px`);
	if (decls.length) blocks.push(`:root {\n${decls.join('\n')}\n}`);

	if (t.fontFamily) {
		blocks.push(
			[
				'html,',
				'.font-sans,',
				'.font-headline,',
				'.font-body,',
				'.font-label {',
				`\tfont-family: ${t.fontFamily} !important;`,
				'}',
			].join('\n')
		);
	}
	return blocks.join('\n\n');
}

function safeComment(name: string): string {
	return name.replace(/\*\//g, '*\\/').replace(/[\r\n]+/g, ' ').trim() || 'Plugin';
}

/** Stylesheet for every enabled plugin, ordered by `position`. */
export function buildPluginCss(list: readonly UiPlugin[]): string {
	const active = list
		.filter((plugin) => plugin?.enabled)
		.slice()
		.sort((a, b) => a.position - b.position);
	const blocks: string[] = [];
	for (const plugin of active) {
		const tokens = tokensToCss(plugin.tokens);
		const css = sanitizeCss(plugin.css).trim();
		if (!tokens && !css) continue;
		blocks.push(`/* ${safeComment(plugin.name)} */\n${[tokens, css].filter(Boolean).join('\n')}`);
	}
	return blocks.join('\n\n');
}

/** One-line summary shown next to a plugin in the list. */
export function describeUiPlugin(plugin: UiPlugin): string {
	const parts: string[] = [];
	const t = sanitizeTokens(plugin.tokens);
	if (t.primary || t.background || t.surface || t.foreground) parts.push('colors');
	if (t.radius !== undefined) parts.push('corners');
	if (t.glassBlur !== undefined) parts.push('glass blur');
	if (t.fontFamily) parts.push('typeface');
	if (sanitizeCss(plugin.css).trim()) parts.push('custom CSS');
	return parts.length ? parts.join(' · ') : 'No overrides yet';
}
