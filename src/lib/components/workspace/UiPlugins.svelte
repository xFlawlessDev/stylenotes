<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from '@lucide/svelte';
	import { Button, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
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
		<span class="text-label-sm font-label tracking-wider text-outline uppercase"
			>{t('settings.plugins.title')}</span
		>
		{#if !editing}
			<Button
				variant="secondary"
				size="xs"
				shape="pill"
				onclick={() => void startCreate()}
			>
				<Plus size={13} /> {t('settings.plugins.newPlugin')}
			</Button>
		{/if}
	</div>

	<p class="text-body-sm font-body leading-relaxed text-outline">
		{t('settings.plugins.description')}
	</p>

	{#if error}
		<div
			class="flex items-center justify-between gap-2 rounded-2xl bg-error-container/30 px-3 py-2"
		>
			<span class="text-body-sm font-body text-on-error-container">{error}</span>
			<Button
				size="icon-xs"
				class="shrink-0 text-on-error-container"
				aria-label={t('settings.plugins.dismissError')}
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
			{t('settings.plugins.empty')}
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
							label={t('settings.plugins.enablePlugin', { name: plugin.name })}
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
								<span class="text-label-sm font-label text-error">{t('settings.plugins.deleteQuestion')}</span>
								<Button
									variant="secondary"
									size="xs"
									class="text-error"
									onclick={() => void confirmDelete(plugin.id)}>{t('settings.plugins.yes')}</Button
								>
								<Button
									variant="secondary"
									size="xs"
									class="text-on-surface-variant"
									onclick={() => (confirmId = null)}>{t('settings.plugins.no')}</Button
								>
							{:else}
								<Button
									size="icon-xs"
									shape="pill"
									disabled={index === 0}
									aria-label={t('settings.plugins.moveUp', { name: plugin.name })}
									onclick={() => void moveUiPlugin(plugin.id, -1)}
								>
									<ChevronUp size={14} />
								</Button>
								<Button
									size="icon-xs"
									shape="pill"
									disabled={index === uiPlugins.length - 1}
									aria-label={t('settings.plugins.moveDown', { name: plugin.name })}
									onclick={() => void moveUiPlugin(plugin.id, 1)}
								>
									<ChevronDown size={14} />
								</Button>
								<Button
									size="icon-xs"
									shape="pill"
									aria-label={t('settings.plugins.edit', { name: plugin.name })}
									onclick={() => (editingId = plugin.id)}
								>
									<Pencil size={14} />
								</Button>
								<Button
									variant="danger-ghost"
									size="icon-xs"
									shape="pill"
									aria-label={t('settings.plugins.delete', { name: plugin.name })}
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
				<span class="text-label-sm font-label text-error">{t('settings.plugins.removeAllQuestion')}</span>
				<Button
					variant="secondary"
					size="xs"
					class="text-error"
					onclick={() => void clearAll()}>{t('settings.plugins.yes')}</Button
				>
				<Button
					variant="secondary"
					size="xs"
					class="text-on-surface-variant"
					onclick={() => (confirmClear = false)}>{t('settings.plugins.no')}</Button
				>
			</div>
		{:else}
			<Button
				variant="danger-ghost"
				size="xs"
				class="self-start"
				onclick={() => (confirmClear = true)}
			>
				{t('settings.plugins.removeAll')}
			</Button>
		{/if}
	{/if}
</div>
