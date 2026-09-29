<script lang="ts">
	import { Check, Moon, Rows2, Rows3, Sun } from '@lucide/svelte';
	import { ChoiceTile, Field, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		accents,
		settings,
		updateSettings,
		type Density,
	} from '$lib/stores/settings.svelte';
	import LanguageSettings from './LanguageSettings.svelte';
	import TimezoneSettings from './TimezoneSettings.svelte';
	import UiPlugins from './UiPlugins.svelte';

	const densities: { id: Density; key: string; icon: typeof Rows3 }[] = [
		{ id: 'comfortable', key: 'settings.appearance.comfortable', icon: Rows3 },
		{ id: 'compact', key: 'settings.appearance.compact', icon: Rows2 },
	];
</script>

<div class="flex min-w-0 flex-col gap-6">
	<LanguageSettings />
	<TimezoneSettings />

	<Field label={t('settings.appearance.theme')} legend class="gap-2.5">
		<div class="grid grid-cols-2 gap-2">
			<ChoiceTile
				layout="row"
				icon={Moon}
				label={t('settings.appearance.dark')}
				active={settings.mode === 'dark'}
				onclick={() => updateSettings({ mode: 'dark' })}
			/>
			<ChoiceTile
				layout="row"
				icon={Sun}
				label={t('settings.appearance.light')}
				active={settings.mode === 'light'}
				onclick={() => updateSettings({ mode: 'light' })}
			/>
		</div>
	</Field>

	<Field label={t('settings.appearance.accentColor')} legend class="gap-2.5">
		<div class="grid grid-cols-4 gap-2">
			{#each accents as accent (accent.id)}
				<ChoiceTile
					label={t(`settings.appearance.accent.${accent.id}`)}
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

	<Field label={t('settings.appearance.density')} legend class="gap-2.5">
		<div class="grid grid-cols-2 gap-2">
			{#each densities as item (item.id)}
				<ChoiceTile
					layout="row"
					icon={item.icon}
					label={t(item.key)}
					active={settings.density === item.id}
					onclick={() => updateSettings({ density: item.id })}
				/>
			{/each}
		</div>
	</Field>

	<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
		<span class="flex flex-col">
			<span class="text-body-md font-body text-on-surface">{t('settings.appearance.reduceMotion')}</span>
			<span class="text-label-sm font-label text-outline"
				>{t('settings.appearance.reduceMotionHint')}</span
			>
		</span>
		<Switch
			checked={settings.reduceMotion}
			label={t('settings.appearance.reduceMotion')}
			onchange={(checked) => updateSettings({ reduceMotion: checked })}
		/>
	</div>

	<UiPlugins />
</div>
