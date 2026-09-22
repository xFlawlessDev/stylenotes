<script lang="ts">
	import { Check, RotateCcw } from '@lucide/svelte';
	import { normalizeColor, type UiPluginColorKey } from '$lib/content/ui-plugin-css';
	import {
		previewUiPlugin,
		type UiPlugin,
		type UiPluginTokens,
	} from '$lib/stores/ui-plugins.svelte';

	let { plugin, ondone }: { plugin: UiPlugin; ondone: () => void } = $props();

	type ColorKey = UiPluginColorKey;
	type SizeKey = 'radius' | 'glassBlur';

	const colors: { key: ColorKey; label: string; vars: string[] }[] = [
		{ key: 'primary', label: 'Accent', vars: ['--primary'] },
		{ key: 'background', label: 'Background', vars: ['--background'] },
		{ key: 'surface', label: 'Surface', vars: ['--color-surface-container'] },
		{ key: 'foreground', label: 'Text', vars: ['--foreground'] },
	];

	const sizes: {
		key: SizeKey;
		label: string;
		vars: string;
		fallback: number;
		max: number;
	}[] = [
		{ key: 'radius', label: 'Corner radius', vars: '--radius', fallback: 10, max: 24 },
		{ key: 'glassBlur', label: 'Glass blur', vars: '--glass-blur', fallback: 32, max: 48 },
	];

	const fonts: { value: string; label: string }[] = [
		{ value: '', label: 'Theme default (Inter)' },
		{ value: "system-ui, -apple-system, 'Segoe UI', sans-serif", label: 'System UI' },
		{ value: "Georgia, 'Times New Roman', serif", label: 'Serif' },
		{ value: "ui-monospace, 'Cascadia Mono', 'Courier New', monospace", label: 'Monospace' },
	];

	const field =
		'glass-well w-full min-w-0 border-0 px-3 py-2 text-body-md font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50';
	const legend = 'text-label-sm font-label tracking-wider text-outline uppercase';
	const iconButton =
		'flex size-7 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:text-on-surface disabled:opacity-30';

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
			>Editing “{plugin.name}”</span
		>
		<span class="shrink-0 text-label-sm font-label text-outline">Applies live</span>
	</div>

	<label class="flex flex-col gap-1.5">
		<span class={legend}>Name</span>
		<input
			class={field}
			value={plugin.name}
			maxlength="80"
			placeholder="Untitled plugin"
			oninput={(event) => previewUiPlugin(plugin.id, { name: event.currentTarget.value })}
		/>
	</label>

	<div class="flex flex-col gap-2">
		<span class={legend}>Colors</span>
		<div class="flex flex-col gap-1.5">
			{#each colors as color (color.key)}
				<div class="flex items-center gap-2">
					<input
						type="color"
						class="size-8 shrink-0 cursor-pointer rounded-lg border border-outline-variant bg-transparent"
						aria-label="{color.label} color"
						value={colorValue(color.key, color.vars)}
						oninput={(event) => setColor(color.key, event.currentTarget.value)}
					/>
					<span class="w-20 shrink-0 truncate text-body-md font-body text-on-surface"
						>{color.label}</span
					>
					<input
						class="w-0 min-w-0 flex-1 glass-well border-0 px-2 py-1.5 text-code-sm font-code text-on-surface-variant placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50"
						value={plugin.tokens[color.key] ?? ''}
						placeholder="theme default"
						aria-label="{color.label} hex"
						onchange={(event) => setColor(color.key, event.currentTarget.value)}
					/>
					<button
						class={iconButton}
						disabled={!plugin.tokens[color.key]}
						aria-label="Reset {color.label}"
						onclick={() => clearToken(color.key)}
					>
						<RotateCcw size={13} />
					</button>
				</div>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-2">
		<span class={legend}>Shape &amp; glass</span>
		<div class="flex flex-col gap-3">
			{#each sizes as size (size.key)}
				{@const current = sizeValue(size.key, size.vars, size.fallback)}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center gap-2">
						<span class="min-w-0 flex-1 truncate text-body-md font-body text-on-surface"
							>{size.label}</span
						>
						<span class="shrink-0 text-label-sm font-label text-outline">{current}px</span>
						<button
							class={iconButton}
							disabled={plugin.tokens[size.key] === undefined}
							aria-label="Reset {size.label}"
							onclick={() => clearToken(size.key)}
						>
							<RotateCcw size={13} />
						</button>
					</div>
					<input
						type="range"
						class="w-full min-w-0 accent-[var(--color-primary)]"
						min="0"
						max={size.max}
						value={current}
						aria-label={size.label}
						oninput={(event) => setSize(size.key, Number(event.currentTarget.value))}
					/>
				</div>
			{/each}
		</div>
	</div>

	<label class="flex flex-col gap-1.5">
		<span class={legend}>Typeface</span>
		<select class={field} value={plugin.tokens.fontFamily ?? ''} onchange={(event) => setFont(event.currentTarget.value)}>
			{#each fonts as font (font.value)}
				<option value={font.value}>{font.label}</option>
			{/each}
		</select>
	</label>

	<label class="flex flex-col gap-1.5">
		<span class={legend}>Custom CSS</span>
		<textarea
			class="{field} h-32 resize-y font-code text-code-sm leading-relaxed"
			spellcheck="false"
			placeholder="/* your CSS */"
			value={plugin.css}
			oninput={(event) => previewUiPlugin(plugin.id, { css: event.currentTarget.value })}
		></textarea>
		<span class="text-label-sm font-label leading-relaxed text-outline">
			Applied as-is, after the tokens above. Remote @import is stripped.
		</span>
	</label>

	<button
		class="emphasis-primary flex items-center justify-center gap-2 rounded-2xl py-2.5 text-label-md font-label text-on-primary"
		onclick={ondone}
	>
		<Check size={15} /> Done
	</button>
</div>
