<script lang="ts">
	import { FolderOpen, Download, TriangleAlert, FileText, FolderCog, RefreshCw } from '@lucide/svelte';
	import { Button, Field, SegmentedControl, type SegmentItem } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { isTauri } from '$lib/windows';
	import {
		chooseVaultFolder,
		exportVault,
		hydrateVault,
		reconcileVault,
		setVaultMode,
		startVaultSync,
		stopVaultSync,
		vaultStore,
		type VaultSyncResult
	} from '$lib/stores/vault.svelte';

	/**
	 * Vault folder settings (docs/design/vault-mirror.md).
	 *
	 * F0/F1: the folder is a mirror of the app, plus a read-back that imports
	 * files added to the folder. Notes stay in StyleNotes, and a conflict is
	 * reported, never silently resolved.
	 */
	let busy = $state(false);
	let error = $state<string | null>(null);
	let sync = $state<VaultSyncResult | null>(null);

	$effect(() => {
		void hydrateVault();
	});

	const modeItems = $derived<SegmentItem[]>([
		{ id: 'off', label: t('settings.vault.off') },
		{ id: 'mirror', label: t('settings.vault.mirror') },
		{ id: 'vault', label: t('settings.vault.vault') }
	]);

	const typeItems = $derived<SegmentItem[]>([
		{ id: 'app', label: t('settings.vault.folderTypeApp') },
		{ id: 'folder', label: t('settings.vault.folderTypeFolder') }
	]);

	async function pick() {
		if (busy) return;
		busy = true;
		error = null;
		const ok = await chooseVaultFolder();
		if (!ok && vaultStore.error) error = vaultStore.error;
		busy = false;
	}

	async function runExport() {
		if (busy) return;
		busy = true;
		error = null;
		const stats = await exportVault();
		if (!stats) error = vaultStore.error ?? 'exportFailed';
		busy = false;
	}

	async function runSync() {
		if (busy) return;
		busy = true;
		error = null;
		sync = null;
		const result = await reconcileVault();
		if (!result) error = vaultStore.error ?? 'syncFailed';
		else sync = result;
		busy = false;
	}

	async function changeMode(mode: string) {
		if (busy) return;
		busy = true;
		const ok = await setVaultMode(mode as 'off' | 'mirror' | 'vault');
		if (!ok) error = 'saveFailed';
		// The automatic cycle only runs in `vault` mode; (re)start or stop it now.
		if (mode === 'vault') startVaultSync();
		else stopVaultSync();
		busy = false;
	}

	async function changeType(type: string) {
		if (busy) return;
		busy = true;
		const ok = await setVaultMode(vaultStore.mode, type as 'app' | 'folder');
		if (!ok) error = 'saveFailed';
		busy = false;
	}
</script>

<div class="flex min-w-0 flex-col gap-6">
	<Field label={t('settings.vault.title')} class="gap-2.5">
		<span class="text-label-sm font-label text-outline">{t('settings.vault.lede')}</span>
	</Field>

	<div class="flex flex-col gap-2">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">
			{t('settings.vault.title')}
		</span>
		<SegmentedControl
			value={vaultStore.mode}
			items={modeItems}
			size="sm"
			ariaLabel={t('settings.vault.title')}
			disabled={busy}
			onchange={changeMode}
		/>
		<span class="text-label-sm font-label text-outline">
			{#if vaultStore.mode === 'off'}
				{t('settings.vault.offHint')}
			{:else if vaultStore.mode === 'vault'}
				{t('settings.vault.vaultHint')}
			{:else}
				{t('settings.vault.mirrorHint')}
			{/if}
		</span>
	</div>

	{#if vaultStore.mode !== 'off'}
		<Field label={t('settings.vault.folderType')} class="gap-2.5">
			<SegmentedControl
				value={vaultStore.type}
				items={typeItems}
				size="sm"
				disabled={busy}
				onchange={changeType}
			/>
			<span class="text-label-sm font-label text-outline">
				{t('settings.vault.folderTypeHint')}
			</span>
		</Field>

		<Field label={t('settings.vault.path')} class="gap-2.5">
			<div
				class="flex items-center gap-2 rounded-xl bg-surface-container-lowest/40 px-3 py-2 ring-1 ring-inset ring-outline-variant/40"
			>
				<FolderCog size={15} class="shrink-0 text-outline" />
				{#if vaultStore.path}
					<span class="min-w-0 flex-1 truncate text-body-md font-body text-on-surface">
						{vaultStore.path}
					</span>
				{:else}
					<span class="min-w-0 flex-1 text-body-md font-body text-outline">
						{t('settings.vault.noFolder')}
					</span>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="secondary" size="md" disabled={busy || !isTauri} onclick={pick}>
					<FolderOpen size={14} />
					{vaultStore.path ? t('settings.vault.change') : t('settings.vault.choose')}
				</Button>
				{#if vaultStore.path}
					{#if vaultStore.type !== 'folder'}
						<Button variant="primary" size="md" disabled={busy} onclick={runExport}>
							<Download size={14} />
							{busy ? t('settings.vault.exporting') : t('settings.vault.exportNow')}
						</Button>
					{/if}
					<Button variant="secondary" size="md" disabled={busy} onclick={runSync}>
						<RefreshCw size={14} />
						{busy ? t('settings.vault.syncing') : t('settings.vault.syncNow')}
					</Button>
				{/if}
			</div>

			{#if vaultStore.error === 'index'}
				<span class="text-label-sm font-label text-error">
					{t('settings.vault.exportFailed')}
				</span>
			{/if}
			{#if error}
				<span class="text-label-sm font-label text-error">
					{t(
						error === 'exportFailed'
							? 'settings.vault.exportFailed'
							: 'settings.vault.saveFailed'
					)}
				</span>
			{/if}

			{#if vaultStore.lastExport}
				<span class="text-label-sm font-label text-outline">
					{t('settings.vault.recent')} ·
					{t('settings.vault.exportDone', {
						written: vaultStore.lastExport.written,
						files: vaultStore.lastExport.files,
						attachments: vaultStore.lastExport.attachments
					})}
				</span>
			{/if}

			{#if sync}
				<div class="flex flex-col gap-0.5">
					<span class="text-label-sm font-label text-on-surface-variant">
						{t('settings.vault.syncDone', {
							created: sync.created,
							updated: sync.updated,
							imported: sync.imported
						})}
					</span>
					{#if sync.skipped.length}
						<span class="text-label-sm font-label text-tertiary">
							{t('settings.vault.syncSkipped', { count: sync.skipped.length })}
						</span>
					{/if}
					{#if sync.orphans.length}
						<span class="text-label-sm font-label text-outline">
							{t('settings.vault.syncOrphans', { count: sync.orphans.length })}
						</span>
					{/if}
				</div>
			{/if}
		</Field>

		<div
			class="flex items-start gap-2 rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
		>
			<FileText size={15} class="mt-0.5 shrink-0 text-outline" />
			<div class="flex min-w-0 flex-col gap-1">
				<span class="text-body-md font-body text-on-surface">
					{t('settings.vault.excluded')}
				</span>
				<span class="text-label-sm font-label text-outline">
					{t('settings.vault.excludedList')}
				</span>
			</div>
		</div>

		<div
			class="flex items-start gap-2 rounded-2xl bg-tertiary/5 p-3 ring-1 ring-inset ring-tertiary/20"
		>
			<TriangleAlert size={15} class="mt-0.5 shrink-0 text-tertiary" />
			<span class="text-label-sm font-label text-on-surface-variant">
				{t('settings.vault.syncNote')}
			</span>
		</div>
	{/if}
</div>
