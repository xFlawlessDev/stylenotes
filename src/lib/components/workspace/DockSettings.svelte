<script lang="ts">
	import { FilterX, PictureInPicture2 } from '@lucide/svelte';
	import { Button, Field, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { DOCK_EDGES, type DockEdge } from '$lib/dock';
	import { QUICK_NOTE_LABEL, QUICK_TASK_LABEL } from '$lib/stores/shortcuts';
	import { settings, updateSettings } from '$lib/stores/settings.svelte';
	import {
		OVERLAY_SORTS,
		TASK_PRIORITIES,
		TASK_STATUSES,
		type OverlaySort,
		type TaskPriorityFilter,
		type TaskStatus
	} from '$lib/stores/tasks';

	const statusOptions = $derived([
		{ value: 'all', label: t('settings.dock.allStatuses') },
		...TASK_STATUSES.map((status) => ({ value: status, label: t('tasks.statusLabel.' + status) }))
	]);

	const priorityOptions = $derived([
		{ value: 'all', label: t('settings.dock.allPriorities') },
		...TASK_PRIORITIES.map((priority) => ({
			value: priority,
			label: t('tasks.priorityLabel.' + priority)
		}))
	]);

	const sortOptions = $derived(
		OVERLAY_SORTS.map((sort) => ({ value: sort, label: t('settings.dock.sort.' + sort) }))
	);

	const positionOptions = $derived(
		DOCK_EDGES.map((position) => ({ value: position, label: t('settings.dock.edge.' + position) }))
	);

	const customized = $derived(
		settings.overlayStatus !== 'all' ||
			settings.overlayPriority !== 'all' ||
			settings.overlaySort !== 'smart' ||
			settings.overlayPosition !== 'right'
	);

	// Keep the shortcut keys as <kbd> chips: placeholder the pattern then split.
	const quickCaptureSegments = $derived(
		t('settings.dock.quickCaptureHint', { note: '\u0000', task: '\u0001' }).split(/\u0000|\u0001/)
	);

	function resetFilters() {
		updateSettings({
			overlayStatus: 'all',
			overlayPriority: 'all',
			overlaySort: 'smart',
			overlayPosition: 'right'
		});
	}
</script>

<div class="flex flex-col gap-2.5">
	<span class="text-label-sm font-label tracking-wider text-outline uppercase"
		>{t('settings.dock.title')}</span
	>

	<div class="glass-well flex items-center gap-3 rounded-2xl p-3">
		<div
			class="flex size-9 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container"
		>
			<PictureInPicture2 size={17} />
		</div>
		<div class="flex flex-col">
			<span class="text-headline-sm font-headline text-on-surface">{t('settings.dock.dockedTasks')}</span>
			<span class="text-label-sm font-label text-outline"
				>{t('settings.dock.dockedTasksHint')}</span
			>
		</div>
	</div>

	<div class="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/30 p-3">
		<Field label={t('settings.dock.position')}>
			<Select
				label={t('settings.dock.positionLabel')}
				options={positionOptions}
				value={settings.overlayPosition}
				onchange={(next) => updateSettings({ overlayPosition: next as DockEdge })}
			/>
		</Field>

		<Field label={t('settings.dock.status')}>
			<Select
				label={t('settings.dock.statusLabel')}
				options={statusOptions}
				value={settings.overlayStatus}
				onchange={(next) => updateSettings({ overlayStatus: next as TaskStatus | 'all' })}
			/>
		</Field>

		<Field label={t('settings.dock.priority')}>
			<Select
				label={t('settings.dock.priorityLabel')}
				options={priorityOptions}
				value={settings.overlayPriority}
				onchange={(next) => updateSettings({ overlayPriority: next as TaskPriorityFilter })}
			/>
		</Field>

		<Field label={t('settings.dock.sortBy')}>
			<Select
				label={t('settings.dock.sortLabel')}
				options={sortOptions}
				value={settings.overlaySort}
				onchange={(next) => updateSettings({ overlaySort: next as OverlaySort })}
			/>
		</Field>

		<div class="flex flex-col gap-1.5">
			<span class="text-body-md font-body text-on-surface">{t('settings.dock.quickCapture')}</span>
			<p class="text-label-sm font-label leading-relaxed text-outline">
				{quickCaptureSegments[0]}<kbd class="rounded bg-surface-container-highest px-1 py-px font-code text-code-sm text-on-surface"
					>{QUICK_NOTE_LABEL}</kbd
				>
				{quickCaptureSegments[1]}<kbd
					class="rounded bg-surface-container-highest px-1 py-px font-code text-code-sm text-on-surface"
					>{QUICK_TASK_LABEL}</kbd
				>{quickCaptureSegments[2]}
			</p>
		</div>

		{#if customized}
			<Button variant="ghost" size="md" block class="justify-center text-outline" onclick={resetFilters}>
				<FilterX size={14} /> {t('settings.dock.reset')}
			</Button>
		{/if}
	</div>

	<p class="text-label-sm font-label leading-relaxed text-outline">
		{t('settings.dock.footnote')}
	</p>
</div>
