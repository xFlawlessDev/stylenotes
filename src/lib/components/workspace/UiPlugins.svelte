<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from '@lucide/svelte';
	import { Button, Switch } from '$lib/components/base';
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
			<Button
				variant="secondary"
				size="xs"
				shape="pill"
				onclick={() => void startCreate()}
			>
				<Plus size={13} /> New plugin
			</Button>
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
			<Button
				size="icon-xs"
				class="shrink-0 text-on-error-container"
				aria-label="Dismiss error"
				onclick={dismissUiPluginError}
			>
				<X size={14} />
			</Button>
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
						<Switch
							checked={plugin.enabled}
							label="Enable {plugin.name}"
							onchange={(checked) => void toggleUiPlugin(plugin.id, checked)}
						/>

						<Button
							bare
							class="min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
							onclick={() => (editingId = plugin.id)}
						>
							<span class="truncate text-body-md font-body text-on-surface">{plugin.name}</span>
							<span class="truncate text-label-sm font-label {plugin.enabled ? 'text-outline' : 'text-outline/60'}"
								>{describeUiPlugin(plugin)}</span
							>
						</Button>

						<div class="flex shrink-0 items-center gap-0.5">
							{#if confirmId === plugin.id}
								<span class="text-label-sm font-label text-error">Delete?</span>
								<Button
									variant="secondary"
									size="xs"
									class="text-error"
									onclick={() => void confirmDelete(plugin.id)}>Yes</Button
								>
								<Button
									variant="secondary"
									size="xs"
									class="text-on-surface-variant"
									onclick={() => (confirmId = null)}>No</Button
								>
							{:else}
								<Button
									size="icon-xs"
									shape="pill"
									disabled={index === 0}
									aria-label="Move {plugin.name} up"
									onclick={() => void moveUiPlugin(plugin.id, -1)}
								>
									<ChevronUp size={14} />
								</Button>
								<Button
									size="icon-xs"
									shape="pill"
									disabled={index === uiPlugins.length - 1}
									aria-label="Move {plugin.name} down"
									onclick={() => void moveUiPlugin(plugin.id, 1)}
								>
									<ChevronDown size={14} />
								</Button>
								<Button
									size="icon-xs"
									shape="pill"
									aria-label="Edit {plugin.name}"
									onclick={() => (editingId = plugin.id)}
								>
									<Pencil size={14} />
								</Button>
								<Button
									variant="danger-ghost"
									size="icon-xs"
									shape="pill"
									aria-label="Delete {plugin.name}"
									onclick={() => (confirmId = plugin.id)}
								>
									<Trash2 size={14} />
								</Button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if confirmClear}
			<div class="flex items-center gap-2">
				<span class="text-label-sm font-label text-error">Remove every plugin?</span>
				<Button
					variant="secondary"
					size="xs"
					class="text-error"
					onclick={() => void clearAll()}>Yes</Button
				>
				<Button
					variant="secondary"
					size="xs"
					class="text-on-surface-variant"
					onclick={() => (confirmClear = false)}>No</Button
				>
			</div>
		{:else}
			<Button
				variant="danger-ghost"
				size="xs"
				class="self-start"
				onclick={() => (confirmClear = true)}
			>
				Remove all plugins
			</Button>
		{/if}
	{/if}
</div>
