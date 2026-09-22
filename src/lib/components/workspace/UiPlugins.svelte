<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from '@lucide/svelte';
	import { describeUiPlugin } from '$lib/content/ui-plugin-css';
	import {
		clearUiPlugins,
		createUiPlugin,
		dismissUiPluginError,
		flushUiPluginsSave,
		moveUiPlugin,
		removeUiPlugin,
		toggleUiPlugin,
		uiPluginError,
		uiPlugins,
	} from '$lib/stores/ui-plugins.svelte';
	import UiPluginEditor from './UiPluginEditor.svelte';

	let editingId = $state<string | null>(null);
	let confirmId = $state<string | null>(null);
	let confirmClear = $state(false);

	const rowIcon =
		'flex size-6 items-center justify-center rounded-full text-outline transition-colors hover:text-on-surface disabled:opacity-30';
	const deleteIcon =
		'flex size-6 items-center justify-center rounded-full text-outline transition-colors hover:text-error';

	const editing = $derived(uiPlugins.find((plugin) => plugin.id === editingId) ?? null);
	const error = $derived(uiPluginError());

	async function startCreate() {
		const created = await createUiPlugin();
		if (created) editingId = created.id;
	}

	async function confirmDelete(id: string) {
		const removed = await removeUiPlugin(id);
		if (removed && editingId === id) editingId = null;
		confirmId = null;
	}

	async function clearAll() {
		const cleared = await clearUiPlugins();
		if (cleared) editingId = null;
		confirmClear = false;
	}

	async function doneEditing() {
		await flushUiPluginsSave();
		editingId = null;
	}

	onDestroy(() => {
		/* closing the panel while editing must not lose the pending write */
		void flushUiPluginsSave();
	});
</script>

<div class="flex min-w-0 flex-col gap-2.5">
	<div class="flex items-center justify-between gap-2">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">UI plugins</span>
		{#if !editing}
			<button
				class="glass-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm font-label text-on-surface transition-colors hover:text-primary"
				onclick={() => void startCreate()}
			>
				<Plus size={13} /> New plugin
			</button>
		{/if}
	</div>

	<p class="text-body-sm font-body leading-relaxed text-outline">
		Each plugin layers theme overrides and its own CSS on top of StyleNotes. Turn several on at once
		— plugins lower in the list win.
	</p>

	{#if error}
		<div
			class="flex items-center justify-between gap-2 rounded-2xl bg-error-container/30 px-3 py-2"
		>
			<span class="text-body-sm font-body text-on-error-container">{error}</span>
			<button
				class="shrink-0 text-on-error-container"
				aria-label="Dismiss error"
				onclick={dismissUiPluginError}
			>
				<X size={14} />
			</button>
		</div>
	{/if}

	{#if editing}
		<UiPluginEditor plugin={editing} ondone={() => void doneEditing()} />
	{:else if uiPlugins.length === 0}
		<div class="glass-well rounded-2xl p-3 text-body-sm font-body text-outline">
			No plugins yet. Create one to restyle colors, corners, and type — or drop in your own CSS.
		</div>
	{:else}
		<div class="flex flex-col gap-1.5">
			{#each uiPlugins as plugin, index (plugin.id)}
				<div
					class="rounded-2xl bg-surface-container-lowest/30 p-2.5 transition-colors hover:bg-surface-container/40"
				>
					<div class="flex items-center gap-2.5">
						<button
							class="relative h-5 w-9 shrink-0 rounded-full transition-colors {plugin.enabled
								? 'emphasis-primary'
								: 'bg-surface-container-highest'}"
							role="switch"
							aria-checked={plugin.enabled}
							aria-label="Enable {plugin.name}"
							onclick={() => void toggleUiPlugin(plugin.id, !plugin.enabled)}
						>
							<span
								class="absolute top-0.5 size-4 rounded-full transition-transform {plugin.enabled
									? 'right-0.5 bg-on-primary'
									: 'left-0.5 bg-outline'}"
							></span>
						</button>

						<button
							class="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
							onclick={() => (editingId = plugin.id)}
						>
							<span class="truncate text-body-md font-body text-on-surface">{plugin.name}</span>
							<span class="truncate text-label-sm font-label {plugin.enabled ? 'text-outline' : 'text-outline/60'}"
								>{describeUiPlugin(plugin)}</span
							>
						</button>

						<div class="flex shrink-0 items-center gap-0.5">
							{#if confirmId === plugin.id}
								<span class="text-label-sm font-label text-error">Delete?</span>
								<button
									class="glass-chip rounded-md px-2 py-1 text-label-sm font-label text-error"
									onclick={() => void confirmDelete(plugin.id)}>Yes</button
								>
								<button
									class="glass-chip rounded-md px-2 py-1 text-label-sm font-label text-on-surface-variant"
									onclick={() => (confirmId = null)}>No</button
								>
							{:else}
								<button
									class={rowIcon}
									disabled={index === 0}
									aria-label="Move {plugin.name} up"
									onclick={() => void moveUiPlugin(plugin.id, -1)}
								>
									<ChevronUp size={14} />
								</button>
								<button
									class={rowIcon}
									disabled={index === uiPlugins.length - 1}
									aria-label="Move {plugin.name} down"
									onclick={() => void moveUiPlugin(plugin.id, 1)}
								>
									<ChevronDown size={14} />
								</button>
								<button
									class={rowIcon}
									aria-label="Edit {plugin.name}"
									onclick={() => (editingId = plugin.id)}
								>
									<Pencil size={14} />
								</button>
								<button
									class={deleteIcon}
									aria-label="Delete {plugin.name}"
									onclick={() => (confirmId = plugin.id)}
								>
									<Trash2 size={14} />
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if confirmClear}
			<div class="flex items-center gap-2">
				<span class="text-label-sm font-label text-error">Remove every plugin?</span>
				<button
					class="glass-chip rounded-md px-2 py-1 text-label-sm font-label text-error"
					onclick={() => void clearAll()}>Yes</button
				>
				<button
					class="glass-chip rounded-md px-2 py-1 text-label-sm font-label text-on-surface-variant"
					onclick={() => (confirmClear = false)}>No</button
				>
			</div>
		{:else}
			<button
				class="self-start text-label-sm font-label text-outline transition-colors hover:text-error"
				onclick={() => (confirmClear = true)}
			>
				Remove all plugins
			</button>
		{/if}
	{/if}
</div>
