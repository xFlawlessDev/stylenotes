<script lang="ts">
	import { Field, Select, type SelectOption } from '$lib/components/base';
	import { LOCALES, t } from '$lib/i18n/index.svelte';
	import { isLocale } from '$lib/i18n/catalog';
	import { settings, updateSettings, type Language } from '$lib/stores/settings.svelte';

	// Each language is named in its own script, so a speaker recognises it
	// without reading the current UI language.
	const options: SelectOption[] = LOCALES.map((locale) => ({
		value: locale.id,
		label: locale.label,
	}));

	function choose(next: string) {
		if (!isLocale(next)) return;
		updateSettings({ language: next satisfies Language });
	}
</script>

<Field label={t('settings.appearance.language')} class="gap-2.5">
	<Select
		label={t('settings.appearance.language')}
		options={options}
		value={settings.language}
		size="lg"
		onchange={choose}
	/>
	<span class="text-label-sm font-label text-outline">{t('settings.appearance.languageHint')}</span>
</Field>
