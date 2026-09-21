<script lang="ts">
	import { FilterX, PictureInPicture2 } from '@lucide/svelte';
	import SelectField from '$lib/components/fields/SelectField.svelte';
	import { settings, updateSettings } from '$lib/stores/settings.svelte';
	import {
		OVERLAY_SORTS,
		overlaySortLabels,
		priorityMeta,
		statusMeta,
		TASK_PRIORITIES,
		TASK_STATUSES,
		type OverlaySort,
		type TaskPriorityFilter,
		type TaskStatus
	} from '$lib/stores/tasks';

	const statusOptions = [
		{ value: 'all', label: 'All statuses' },
		...TASK_STATUSES.map((status) => ({ value: status, label: statusMeta[status].label }))
	];

	const priorityOptions = [
		{ value: 'all', label: 'All priorities' },
		...TASK_PRIORITIES.map((priority) => ({
			value: priority,
			label: priorityMeta[priority].label
		}))
	];

	const sortOptions = OVERLAY_SORTS.map((sort) => ({ value: sort, label: overlaySortLabels[sort] }));

	const customized = $derived(
		settings.overlayStatus !== 'all' ||
			settings.overlayPriority !== 'all' ||
			settings.overlaySort !== 'smart'
	);

	function resetFilters() {
		updateSettings({ overlayStatus: 'all', overlayPriority: 'all', overlaySort: 'smart' });
	}
</script>

<div class="flex flex-col gap-2.5">
	<span class="text-label-sm font-label tracking-wider text-outline uppercase">Overlay dock</span>

	<div class="glass-well flex items-center gap-3 rounded-2xl p-3">
		<div
			class="flex size-9 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container"
		>
			<PictureInPicture2 size={17} />
		</div>
		<div class="flex flex-col">
			<span class="text-headline-sm font-headline text-on-surface">Docked tasks</span>
			<span class="text-label-sm font-label text-outline"
				>Choose which tasks the overlay shows and how they are ordered</span
			>
		</div>
	</div>

	<div class="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/30 p-3">
		<div class="flex flex-col gap-1.5">
			<span class="text-body-md font-body text-on-surface">Status</span>
			<SelectField
				label="Dock status filter"
				options={statusOptions}
				value={settings.overlayStatus}
				onchange={(next) => updateSettings({ overlayStatus: next as TaskStatus | 'all' })}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-body-md font-body text-on-surface">Priority</span>
			<SelectField
				label="Dock priority filter"
				options={priorityOptions}
				value={settings.overlayPriority}
				onchange={(next) => updateSettings({ overlayPriority: next as TaskPriorityFilter })}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-body-md font-body text-on-surface">Sort by</span>
			<SelectField
				label="Dock sort order"
				options={sortOptions}
				value={settings.overlaySort}
				onchange={(next) => updateSettings({ overlaySort: next as OverlaySort })}
			/>
		</div>

		{#if customized}
			<button
				type="button"
				class="flex items-center justify-center gap-1.5 rounded-xl py-2 text-label-md font-label text-outline transition-colors hover:bg-surface-container/50 hover:text-on-surface"
				onclick={resetFilters}
			>
				<FilterX size={14} /> Reset dock settings
			</button>
		{/if}
	</div>

	<p class="text-label-sm font-label leading-relaxed text-outline">
		Filters and sorting apply to the overlay dock only. Tasks still stay in your task list either
		way.
	</p>
</div>
