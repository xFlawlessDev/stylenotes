<script lang="ts">
	import { Check, Moon, Rows2, Rows3, Sun } from '@lucide/svelte';
	import { ChoiceTile, Field, Switch } from '$lib/components/base';
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
	<Field label="Theme" legend class="gap-2.5">
		<div class="grid grid-cols-2 gap-2">
			<ChoiceTile
				layout="row"
				icon={Moon}
				label="Dark"
				active={settings.mode === 'dark'}
				onclick={() => updateSettings({ mode: 'dark' })}
			/>
			<ChoiceTile
				layout="row"
				icon={Sun}
				label="Light"
				active={settings.mode === 'light'}
				onclick={() => updateSettings({ mode: 'light' })}
			/>
		</div>
	</Field>

	<Field label="Accent color" legend class="gap-2.5">
		<div class="grid grid-cols-4 gap-2">
			{#each accents as accent (accent.id)}
				<ChoiceTile
					label={accent.label}
					active={settings.accent === accent.id}
					onclick={() => updateSettings({ accent: accent.id })}
				>
					<span
						class="{accent.swatchClass} flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-outline-variant"
					>
						{#if settings.accent === accent.id}
							<Check size={13} class="text-on-swatch" />
						{/if}
					</span>
				</ChoiceTile>
			{/each}
		</div>
	</Field>

	<Field label="Density" legend class="gap-2.5">
		<div class="grid grid-cols-2 gap-2">
			{#each densities as item (item.id)}
				<ChoiceTile
					layout="row"
					icon={item.icon}
					label={item.label}
					active={settings.density === item.id}
					onclick={() => updateSettings({ density: item.id })}
				/>
			{/each}
		</div>
	</Field>

	<div
		class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3"
	>
		<span class="flex flex-col">
			<span class="text-body-md font-body text-on-surface">Reduce motion</span>
			<span class="text-label-sm font-label text-outline">Minimize animations across the app</span>
		</span>
		<Switch
			checked={settings.reduceMotion}
			label="Reduce motion"
			onchange={(checked) => updateSettings({ reduceMotion: checked })}
		/>
	</div>

	<UiPlugins />
</div>
