<script lang="ts">
	import { Field, Input, Select, Switch, Textarea, type SelectOption } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { JOURNAL_FORMATS, formatJournalDay, journalFolder, journalTitle } from '$lib/content/journal';
	import { localToday, settings, updateSettings } from '$lib/stores/settings.svelte';

	/**
	 * Journal settings (docs/design/journal.md). Opt-in: it writes notes, so the
	 * master switch is off by default and the rest only shows when it is on.
	 *
	 * The preview uses the user's real timezone and today, so what they see is
	 * exactly the title they will get — no sample data to misread.
	 */
	const today = localToday();

	const formatOptions: SelectOption[] = JOURNAL_FORMATS.map((value) => ({
		value,
		label: formatJournalDay(today, value),
	}));
</script>

<div class="flex min-w-0 flex-col gap-6">
	<Field label={t('settings.journal.title')} class="gap-2.5">
		<div class="flex items-start justify-between gap-4">
			<div class="flex min-w-0 flex-col gap-0.5">
				<span class="text-body-md font-body text-on-surface">
					{t('settings.journal.enable')}
				</span>
				<span class="text-label-sm font-label text-outline">
					{t('settings.journal.enableHint')}
				</span>
			</div>
			<Switch
				checked={settings.journalEnabled}
				label={t('settings.journal.enable')}
				onchange={(value) => updateSettings({ journalEnabled: value })}
			/>
		</div>
	</Field>

	{#if settings.journalEnabled}
		<Field label={t('settings.journal.format')} class="gap-2.5">
			<Select
				label={t('settings.journal.format')}
				options={formatOptions}
				value={settings.journalFormat}
				size="lg"
				onchange={(next) => updateSettings({ journalFormat: next })}
			/>
			<span class="text-label-sm font-label text-outline">
				{t('settings.journal.formatHint')}
			</span>
		</Field>

		<Field label={t('settings.journal.folder')} class="gap-2.5">
			<Input
				bind:value={settings.journalFolder}
				placeholder="journal"
				aria-label={t('settings.journal.folder')}
				oninput={() => updateSettings({ journalFolder: settings.journalFolder })}
			/>
			<span class="text-label-sm font-label text-outline">
				{t('settings.journal.folderHint', { folder: journalFolder(settings.journalFolder) })}
			</span>
		</Field>

		<Field label={t('settings.journal.template')} class="gap-2.5">
			<Textarea
				bind:value={settings.journalTemplate}
				rows={4}
				aria-label={t('settings.journal.template')}
				placeholder={'# {date}\n\n## Fokus\n- '}
				oninput={() => updateSettings({ journalTemplate: settings.journalTemplate })}
			/>
			<span class="text-label-sm font-label text-outline">
				{t('settings.journal.templateHint')}
			</span>
		</Field>

		<div class="rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40">
			<span class="text-label-sm font-label text-outline">{t('settings.journal.preview')}</span>
			<p class="mt-1 text-body-md font-body text-on-surface">
				{journalTitle(today, settings.journalFormat)}
			</p>
		</div>
	{/if}
</div>
