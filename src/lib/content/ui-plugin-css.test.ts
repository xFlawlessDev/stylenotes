import { describe, it, expect } from 'vitest';
import {
	buildPluginCss,
	describeUiPlugin,
	normalizeColor,
	normalizePlugin,
	sanitizeColor,
	sanitizeCss,
	sanitizeFont,
	sanitizeSize,
	sanitizeTokens,
	tokensToCss,
	MAX_PLUGIN_CSS,
	type UiPlugin,
} from './ui-plugin-css';

const base: UiPlugin = {
	id: 'p1',
	name: 'Midnight',
	tokens: {},
	css: '',
	enabled: true,
	position: 0,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

function plugin(patch: Partial<UiPlugin> = {}): UiPlugin {
	return { ...base, ...patch, tokens: { ...patch.tokens } };
}

describe('sanitizeColor', () => {
	it('accepts hex colors of every supported length', () => {
		expect(sanitizeColor('#abc')).toBe('#abc');
		expect(sanitizeColor(' #AABBCC ')).toBe('#AABBCC');
		expect(sanitizeColor('#aabbccdd')).toBe('#aabbccdd');
	});

	it('rejects anything that is not a hex color', () => {
		expect(sanitizeColor('red')).toBeNull();
		expect(sanitizeColor('#ab')).toBeNull();
		expect(sanitizeColor('rgb(0,0,0)')).toBeNull();
		expect(sanitizeColor('expression(alert(1))')).toBeNull();
		expect(sanitizeColor(42)).toBeNull();
	});
});

describe('normalizeColor', () => {
	it('expands shorthand and keeps full hex', () => {
		expect(normalizeColor('#abc')).toBe('#aabbcc');
		expect(normalizeColor('#0A141E')).toBe('#0a141e');
	});

	it('parses rgb()/rgba() computed values', () => {
		expect(normalizeColor('rgb(255, 0, 16)')).toBe('#ff0010');
		expect(normalizeColor('rgba(10, 20, 30, 0.5)')).toBe('#0a141e');
		expect(normalizeColor('rgb(255 0 16)')).toBe('#ff0010');
	});

	it('returns null for colors a color input cannot show', () => {
		expect(normalizeColor('color-mix(in oklab, red, blue)')).toBeNull();
		expect(normalizeColor('')).toBeNull();
		expect(normalizeColor(undefined)).toBeNull();
	});
});

describe('sanitizeFont', () => {
	it('keeps readable font stacks', () => {
		expect(sanitizeFont("system-ui, -apple-system, 'Segoe UI', sans-serif")).toBe(
			"system-ui, -apple-system, 'Segoe UI', sans-serif"
		);
		expect(sanitizeFont('  Georgia ,  serif  ')).toBe('Georgia , serif');
	});

	it('rejects stacks that could carry CSS', () => {
		expect(sanitizeFont('Inter; color: red')).toBeNull();
		expect(sanitizeFont('url(https://evil)')).toBeNull();
		expect(sanitizeFont('a{}b')).toBeNull();
		expect(sanitizeFont('')).toBeNull();
	});
});

describe('sanitizeSize', () => {
	it('clamps and rounds into range', () => {
		expect(sanitizeSize(12.4, 0, 24)).toBe(12);
		expect(sanitizeSize(-5, 0, 24)).toBe(0);
		expect(sanitizeSize(999, 0, 24)).toBe(24);
		expect(sanitizeSize('18', 0, 24)).toBe(18);
	});

	it('returns undefined for unusable values', () => {
		expect(sanitizeSize('wide', 0, 24)).toBeUndefined();
		expect(sanitizeSize(undefined, 0, 24)).toBeUndefined();
	});
});

describe('sanitizeCss', () => {
	it('strips remote imports and style tags', () => {
		expect(sanitizeCss('@import url("https://evil/x.css");\nbody{}')).toBe('\nbody{}');
		expect(sanitizeCss('<style>body{}</style>')).toBe('body{}');
	});

	it('keeps plain CSS and truncates oversized payloads', () => {
		expect(sanitizeCss('.a { color: red; }')).toBe('.a { color: red; }');
		expect(sanitizeCss('x'.repeat(MAX_PLUGIN_CSS + 10)).length).toBe(MAX_PLUGIN_CSS);
		expect(sanitizeCss(42)).toBe('');
	});
});

describe('sanitizeTokens', () => {
	it('keeps only valid entries', () => {
		const tokens = sanitizeTokens({
			primary: '#a8c7e8',
			background: 'nope',
			radius: 14,
			glassBlur: 400,
			fontFamily: 'Georgia, serif',
			extra: 'ignored',
		});
		expect(tokens).toEqual({ primary: '#a8c7e8', radius: 14, glassBlur: 48, fontFamily: 'Georgia, serif' });
	});

	it('handles non-objects', () => {
		expect(sanitizeTokens(null)).toEqual({});
		expect(sanitizeTokens('primary')).toEqual({});
	});
});

describe('tokensToCss', () => {
	it('renders nothing without usable tokens', () => {
		expect(tokensToCss({})).toBe('');
		expect(tokensToCss({ background: 'evil' })).toBe('');
	});

	it('emits important declarations that beat the mode and accent palettes', () => {
		const css = tokensToCss({ primary: '#123456', radius: 12 });
		expect(css).toContain(':root {');
		expect(css).toContain('--primary: #123456 !important;');
		expect(css).toContain('--color-primary: #123456 !important;');
		expect(css).toContain('--radius: 12px !important;');
		expect(css).not.toContain('--glass-blur');
	});

	it('maps every color token onto its theme variables', () => {
		const css = tokensToCss({
			background: '#000001',
			surface: '#000002',
			foreground: '#000003',
			glassBlur: 8,
			fontFamily: 'Georgia, serif',
		});
		expect(css).toContain('--background: #000001 !important;');
		expect(css).toContain('--color-surface-container: #000002 !important;');
		expect(css).toContain('--color-on-surface: #000003 !important;');
		expect(css).toContain('--glass-blur: 8px !important;');
	});

	it('targets the font utilities directly, which Tailwind compiles to a literal stack', () => {
		const css = tokensToCss({ fontFamily: 'Georgia, serif' });
		expect(css).toContain('.font-body,');
		expect(css).toContain('.font-headline,');
		expect(css).toContain('font-family: Georgia, serif !important;');
		expect(css).not.toContain(':root');
	});
});

describe('buildPluginCss', () => {
	it('stacks enabled plugins in position order and skips disabled ones', () => {
		const css = buildPluginCss([
			plugin({ id: 'b', name: 'Second', position: 1, tokens: { primary: '#222222' } }),
			plugin({ id: 'a', name: 'First', position: 0, tokens: { primary: '#111111' } }),
			plugin({ id: 'c', name: 'Off', position: 2, enabled: false, tokens: { primary: '#333333' } }),
		]);
		expect(css.indexOf('First')).toBeLessThan(css.indexOf('Second'));
		expect(css).not.toContain('#333333');
		expect(css).toContain('/* First */');
	});

	it('keeps raw CSS and drops plugins with nothing to say', () => {
		const css = buildPluginCss([
			plugin({ id: 'a', css: '.note-card { border-style: dashed; }' }),
			plugin({ id: 'b', name: 'Empty' }),
		]);
		expect(css).toContain('.note-card { border-style: dashed; }');
		expect(css).not.toContain('Empty');
	});

	it('cannot break out of its comment banner', () => {
		expect(buildPluginCss([plugin({ name: 'evil */ body{}', css: '.a{}' })])).toContain(
			'evil *\\/ body{}'
		);
	});
});

describe('describeUiPlugin', () => {
	it('summarizes what a plugin changes', () => {
		expect(describeUiPlugin(plugin())).toBe('No overrides yet');
		expect(
			describeUiPlugin(plugin({ tokens: { primary: '#a8c7e8', radius: 10 }, css: '.a{}' }))
		).toBe('colors · corners · custom CSS');
		expect(describeUiPlugin(plugin({ tokens: { glassBlur: 4, fontFamily: 'Georgia, serif' } }))).toBe(
			'glass blur · typeface'
		);
	});
});

describe('normalizePlugin', () => {
	it('coerces a stored or broadcast row into a safe plugin', () => {
		const result = normalizePlugin({ id: 'p9', name: '  Cozy  ', tokens: { radius: 999 }, css: 7 });
		expect(result).toMatchObject({ id: 'p9', name: 'Cozy', enabled: true, position: 0 });
		expect(result?.tokens).toEqual({ radius: 24 });
		expect(result?.css).toBe('');
	});

	it('fills in defaults and rejects unusable payloads', () => {
		expect(normalizePlugin({ id: 'p1' })).toMatchObject({ name: 'Untitled plugin', css: '' });
		expect(normalizePlugin({ name: 'no id' })).toBeNull();
		expect(normalizePlugin(null)).toBeNull();
		expect(normalizePlugin('row')).toBeNull();
	});
});
