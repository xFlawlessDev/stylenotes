<script lang="ts">
	import { Check, Moon, Rows2, Rows3, Sun } from '@lucide/svelte';
	import {
		accents,
		settings,
		updateSettings,
		type Density,
	} from '$lib/stores/settings.svelte';
	import UiPlugins from './UiPlugins.svelte';

	const densities: { id: Density; label: string; icon: typeof Rows3 }[] = [
		{ id: 'comfortable', label: 'Comfortable', icon: Rows3 },
		{ id: 'compact', label: 'Compact', icon: Rows2 },
	];
</script>

<div class="flex min-w-0 flex-col gap-6">
	<div class="flex flex-col gap-2.5">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">Theme</span>
		<div class="grid grid-cols-2 gap-2">
			<button
				class="flex items-center justify-center gap-2 rounded-2xl py-2.5 text-label-md font-label transition-all {settings.mode ===
				'dark'
					? 'emphasis-container text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring'
					: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
				onclick={() => updateSettings({ mode: 'dark' })}
			>
				<Moon size={15} /> Dark
			</button>
			<button
				class="flex items-center justify-center gap-2 rounded-2xl py-2.5 text-label-md font-label transition-all {settings.mode ===
				'light'
					? 'emphasis-container text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring'
					: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
				onclick={() => updateSettings({ mode: 'light' })}
			>
				<Sun size={15} /> Light
			</button>
		</div>
	</div>

	<div class="flex flex-col gap-2.5">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">Accent color</span>
		<div class="grid grid-cols-4 gap-2">
			{#each accents as accent (accent.id)}
				<button
					class="flex flex-col items-center gap-1.5 rounded-2xl py-2.5 transition-all {settings.accent ===
					accent.id
						? 'emphasis-container ring-1 ring-inset ring-emphasis-container-ring'
						: 'bg-surface-container-lowest/30 hover:bg-surface-container/50'}"
					onclick={() => updateSettings({ accent: accent.id })}
				>
					<span
						class="{accent.swatchClass} flex size-6 items-center justify-center rounded-full ring-1 ring-inset ring-outline-variant"
					>
						{#if settings.accent === accent.id}
							<Check size={13} class="text-on-swatch" />
						{/if}
					</span>
					<span class="text-label-sm font-label text-on-surface-variant">{accent.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-2.5">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">Density</span>
		<div class="grid grid-cols-2 gap-2">
			{#each densities as item (item.id)}
				{@const Icon = item.icon}
				<button
					class="flex items-center justify-center gap-2 rounded-2xl py-2.5 text-label-md font-label transition-all {settings.density ===
					item.id
						? 'emphasis-container text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring'
						: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
					onclick={() => updateSettings({ density: item.id })}
				>
					<Icon size={15} /> {item.label}
				</button>
			{/each}
		</div>
	</div>

	<label
		class="flex cursor-pointer items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3"
	>
		<span class="flex flex-col">
			<span class="text-body-md font-body text-on-surface">Reduce motion</span>
			<span class="text-label-sm font-label text-outline">Minimize animations across the app</span>
		</span>
		<button
			class="relative h-5 w-9 shrink-0 rounded-full transition-colors {settings.reduceMotion
				? 'emphasis-primary'
				: 'bg-surface-container-highest'}"
			role="switch"
			aria-checked={settings.reduceMotion}
			aria-label="Reduce motion"
			onclick={() => updateSettings({ reduceMotion: !settings.reduceMotion })}
		>
			<span
				class="absolute top-0.5 size-4 rounded-full transition-transform {settings.reduceMotion
					? 'right-0.5 bg-on-primary'
					: 'left-0.5 bg-outline'}"
			></span>
		</button>
	</label>

	<UiPlugins />
</div>
