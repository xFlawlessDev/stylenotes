<script lang="ts">
	import { FilterX, PictureInPicture2 } from '@lucide/svelte';
	import { Button, Field, Select } from '$lib/components/base';
	import { DOCK_EDGES, dockEdgeLabels, type DockEdge } from '$lib/dock';
	import { QUICK_NOTE_LABEL, QUICK_TASK_LABEL } from '$lib/stores/shortcuts';
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

	const positionOptions = DOCK_EDGES.map((position) => ({
		value: position,
		label: dockEdgeLabels[position]
	}));

	const customized = $derived(
		settings.overlayStatus !== 'all' ||
			settings.overlayPriority !== 'all' ||
			settings.overlaySort !== 'smart' ||
			settings.overlayPosition !== 'right'
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
				>Choose where the dock sits and which tasks it shows</span
			>
		</div>
	</div>

	<div class="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest/30 p-3">
		<Field label="Position">
			<Select
				label="Dock position"
				options={positionOptions}
				value={settings.overlayPosition}
				onchange={(next) => updateSettings({ overlayPosition: next as DockEdge })}
			/>
		</Field>

		<Field label="Status">
			<Select
				label="Dock status filter"
				options={statusOptions}
				value={settings.overlayStatus}
				onchange={(next) => updateSettings({ overlayStatus: next as TaskStatus | 'all' })}
			/>
		</Field>

		<Field label="Priority">
			<Select
				label="Dock priority filter"
				options={priorityOptions}
				value={settings.overlayPriority}
				onchange={(next) => updateSettings({ overlayPriority: next as TaskPriorityFilter })}
			/>
		</Field>

		<Field label="Sort by">
			<Select
				label="Dock sort order"
				options={sortOptions}
				value={settings.overlaySort}
				onchange={(next) => updateSettings({ overlaySort: next as OverlaySort })}
			/>
		</Field>

		<div class="flex flex-col gap-1.5">
			<span class="text-body-md font-body text-on-surface">Quick capture</span>
			<p class="text-label-sm font-label leading-relaxed text-outline">
				Press <kbd class="rounded bg-surface-container-highest px-1 py-px font-code text-code-sm text-on-surface"
					>{QUICK_NOTE_LABEL}</kbd
				>
				for a docked note or <kbd
					class="rounded bg-surface-container-highest px-1 py-px font-code text-code-sm text-on-surface"
					>{QUICK_TASK_LABEL}</kbd
				> for a docked task.
			</p>
		</div>

		{#if customized}
			<Button variant="ghost" size="md" block class="justify-center text-outline" onclick={resetFilters}>
				<FilterX size={14} /> Reset dock settings
			</Button>
		{/if}
	</div>

	<p class="text-label-sm font-label leading-relaxed text-outline">
		Position pins the overlay dock to a screen edge. Filters and sorting apply to the dock only;
		tasks still stay in your task list either way.
	</p>
</div>
