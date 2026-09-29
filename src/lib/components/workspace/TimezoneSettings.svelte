<script lang="ts">
	import { Field, Select, type SelectOption } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { localeTag } from '$lib/i18n/catalog';
	import { settings, updateSettings } from '$lib/stores/settings.svelte';
	import { timezoneOptions, effectiveTimezone, formatOffset, AUTO_TIMEZONE } from '$lib/content/timezone';

	// Recomputed on every render; a settings change re-renders this panel, so the
	// offsets stay current without a ticking clock.
	const now = new Date();
	const options: SelectOption[] = timezoneOptions(now, localeTag(settings.language), {
		automatic: t('settings.appearance.timezoneAutomatic'),
	});
	const automaticOffset = formatOffset(effectiveTimezone(AUTO_TIMEZONE), now);
</script>

<Field label={t('settings.appearance.timezone')} class="gap-2.5">
	<Select
		label={t('settings.appearance.timezone')}
		options={options}
		value={settings.timezone}
		size="lg"
		onchange={(next) => updateSettings({ timezone: next })}
	/>
	<span class="text-label-sm font-label text-outline">
		{settings.timezone
			? t('settings.appearance.timezoneHint')
			: t('settings.appearance.timezoneAutomaticHint', { offset: automaticOffset })}
	</span>
</Field>
