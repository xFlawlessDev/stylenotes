<script lang="ts">
	import { Check, RotateCcw } from '@lucide/svelte';
	import { Button, ColorField, Field, Input, Select, Slider, Textarea } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { normalizeColor, type UiPluginColorKey } from '$lib/content/ui-plugin-css';
	import {
		previewUiPlugin,
		type UiPlugin,
		type UiPluginTokens,
	} from '$lib/stores/ui-plugins.svelte';

	let { plugin, ondone }: { plugin: UiPlugin; ondone: () => void } = $props();

	type ColorKey = UiPluginColorKey;
	type SizeKey = 'radius' | 'glassBlur';

	const colors: { key: ColorKey; vars: string[] }[] = [
		{ key: 'primary', vars: ['--primary'] },
		{ key: 'background', vars: ['--background'] },
		{ key: 'surface', vars: ['--color-surface-container'] },
		{ key: 'foreground', vars: ['--foreground'] },
	];

	const sizes: {
		key: SizeKey;
		vars: string;
		fallback: number;
		max: number;
	}[] = [
		{ key: 'radius', vars: '--radius', fallback: 10, max: 24 },
		{ key: 'glassBlur', vars: '--glass-blur', fallback: 32, max: 48 },
	];

	const fonts: { value: string }[] = [
		{ value: '' },
		{ value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
		{ value: "Georgia, 'Times New Roman', serif" },
		{ value: "ui-monospace, 'Cascadia Mono', 'Courier New', monospace" },
	];

	const colorKeys: Record<ColorKey, string> = {
		primary: 'settings.plugins.color.accent',
		background: 'settings.plugins.color.background',
		surface: 'settings.plugins.color.surface',
		foreground: 'settings.plugins.color.text',
	};
	const sizeKeys: Record<SizeKey, string> = {
		radius: 'settings.plugins.radius',
		glassBlur: 'settings.plugins.glassBlur',
	};
	const fontKeys = [
		'settings.plugins.typefaceDefault',
		'settings.plugins.typefaceSystem',
		'settings.plugins.typefaceSerif',
		'settings.plugins.typefaceMono',
	];
	const fontOptions = $derived(fonts.map((font, index) => ({ ...font, label: t(fontKeys[index]) })));

	/** Reads a theme variable as pixels so sliders can show the current default. */
	function readPx(name: string, fallback: number): number {
		if (typeof document === 'undefined') return fallback;
		const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		const value = Number.parseFloat(raw);
		if (!Number.isFinite(value)) return fallback;
		return Math.round(raw.endsWith('rem') ? value * 16 : value);
	}

	/** Stored token first, otherwise the live theme value (what the user sees now). */
	function colorValue(key: ColorKey, vars: string[]): string {
		const stored = plugin.tokens[key];
		if (stored) return stored;
		if (typeof document === 'undefined') return '#888888';
		const styles = getComputedStyle(document.documentElement);
		for (const name of vars) {
			const hex = normalizeColor(styles.getPropertyValue(name));
			if (hex) return hex;
		}
		return '#888888';
	}

	function sizeValue(key: SizeKey, vars: string, fallback: number): number {
		return plugin.tokens[key] ?? readPx(vars, fallback);
	}

	function setColor(key: ColorKey, value: string) {
		const hex = normalizeColor(value);
		if (!hex) return;
		const tokens: UiPluginTokens = { ...plugin.tokens };
		if (key === 'primary') tokens.primary = hex;
		else if (key === 'background') tokens.background = hex;
		else if (key === 'surface') tokens.surface = hex;
		else tokens.foreground = hex;
		previewUiPlugin(plugin.id, { tokens });
	}

	function setSize(key: SizeKey, value: number) {
		const tokens: UiPluginTokens = { ...plugin.tokens };
		if (key === 'radius') tokens.radius = value;
		else tokens.glassBlur = value;
		previewUiPlugin(plugin.id, { tokens });
	}

	function setFont(value: string) {
		const tokens: UiPluginTokens = { ...plugin.tokens };
		if (value) tokens.fontFamily = value;
		else delete tokens.fontFamily;
		previewUiPlugin(plugin.id, { tokens });
	}

	function clearToken(key: keyof UiPluginTokens) {
		const tokens: UiPluginTokens = { ...plugin.tokens };
		delete tokens[key];
		previewUiPlugin(plugin.id, { tokens });
	}
</script>

<div class="glass-well flex min-w-0 w-full flex-col gap-4 rounded-2xl p-3.5">
	<div class="flex min-w-0 items-center justify-between gap-2">
		<span class="min-w-0 flex-1 truncate text-label-md font-label text-on-surface"
			>{t('settings.plugins.editing', { name: plugin.name })}</span
		>
		<span class="shrink-0 text-label-sm font-label text-outline">{t('settings.plugins.appliesLive')}</span>
	</div>

	<Field label={t('settings.plugins.name')}>
		<Input
			size="lg"
			value={plugin.name}
			maxlength={80}
			placeholder={t('settings.plugins.namePlaceholder')}
			oninput={(event) => previewUiPlugin(plugin.id, { name: event.currentTarget.value })}
		/>
	</Field>

	<Field label={t('settings.plugins.colors')} legend class="gap-2">
		<div class="flex flex-col gap-1.5">
			{#each colors as color (color.key)}
				<ColorField
					label={t(colorKeys[color.key])}
					value={colorValue(color.key, color.vars)}
					hex={plugin.tokens[color.key] ?? ''}
					dirty={Boolean(plugin.tokens[color.key])}
					onchange={(value) => setColor(color.key, value)}
					onreset={() => clearToken(color.key)}
				/>
			{/each}
		</div>
	</Field>

	<Field label={t('settings.plugins.shape')} legend class="gap-2">
		<div class="flex flex-col gap-3">
			{#each sizes as size (size.key)}
				{@const current = sizeValue(size.key, size.vars, size.fallback)}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center gap-2">
						<span class="min-w-0 flex-1 truncate text-body-md font-body text-on-surface"
							>{t(sizeKeys[size.key])}</span
						>
						<span class="shrink-0 text-label-sm font-label text-outline">{current}px</span>
						<Button
							size="icon-sm"
							shape="pill"
							disabled={plugin.tokens[size.key] === undefined}
							aria-label={t('settings.plugins.resetSize', { name: t(sizeKeys[size.key]) })}
							onclick={() => clearToken(size.key)}
						>
							<RotateCcw size={13} />
						</Button>
					</div>
					<Slider
						label={t(sizeKeys[size.key])}
						min={0}
						max={size.max}
						value={current}
						oninput={(value) => setSize(size.key, value)}
					/>
				</div>
			{/each}
		</div>
	</Field>

	<Field label={t('settings.plugins.typeface')}>
		<Select
			label={t('settings.plugins.typeface')}
			size="lg"
			options={fontOptions}
			value={plugin.tokens.fontFamily ?? ''}
			onchange={setFont}
		/>
	</Field>

	<Field
		label={t('settings.plugins.customCss')}
		description={t('settings.plugins.customCssDescription')}
	>
		<Textarea
			class="h-32 resize-y font-code text-code-sm leading-relaxed"
			spellcheck="false"
			placeholder={t('settings.plugins.customCssPlaceholder')}
			value={plugin.css}
			oninput={(event) => previewUiPlugin(plugin.id, { css: event.currentTarget.value })}
		/>
	</Field>

	<Button variant="primary" size="lg" shape="tile" block onclick={ondone}>
		<Check size={15} /> {t('settings.plugins.done')}
	</Button>
</div>
