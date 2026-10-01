<script lang="ts">
	import { onMount } from 'svelte';
	import {
		FileText,
		Film,
		Image as ImageIcon,
		Music,
		RotateCcw,
		Trash2,
		X,
	} from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { formatBytes, catalogRows, totalBytes, kindForTarget } from '$lib/content/attachment-manager';
	import {
		attachmentStore,
		emptyTrash,
		primeAttachments,
		purgeTrashed,
		refreshAttachments,
		removeAttachment,
		restoreTrashed,
		trashOrphans
	} from '$lib/stores/attachments.svelte';

	/**
	 * Attachment manager (docs/design/artifacts.md).
	 *
	 * The store is content-addressed, so this is where the user sees what is
	 * actually on disk: total size, orphaned blobs no note points at, and the
	 * recoverable Trash. Nothing is deleted outright — a blob only leaves the
	 * store when the user empties the trash.
	 */
	let noting = $state<string | null>(null);

	onMount(() => void primeAttachments());

	const rows = $derived(catalogRows(attachmentStore.catalog));
	const referencesById = $derived(new Map(rows.map((row) => [row.id, row.reference])));
	const orphanCount = $derived(attachmentStore.orphans.length);
	const total = $derived(totalBytes(attachmentStore.catalog));
	const trashed = $derived(attachmentStore.trash);
	const trashedBytes = $derived(trashed.reduce((sum, item) => sum + (item.size || 0), 0));

	function iconFor(ext: string) {
		const kind = kindForTarget(ext ? `x.${ext}` : 'x');
		if (kind === 'image') return ImageIcon;
		if (kind === 'video') return Film;
		if (kind === 'audio') return Music;
		return FileText;
	}

	function labelFor(ext: string): string {
		const kind = kindForTarget(ext ? `x.${ext}` : 'x');
		return t(`settings.attachment.kind.${kind}`);
	}

	function dateLabel(value: number): string {
		try {
			return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
		} catch {
			return '';
		}
	}

	async function trashOne(id: string) {
		const reference = referencesById.get(id);
		if (!reference) return;
		noting = id;
		await removeAttachment(id, reference);
		noting = null;
	}

	async function trashAllOrphans() {
		noting = '*';
		await trashOrphans(referencesById);
		noting = null;
	}

	async function restore(id: string) {
		noting = id;
		await restoreTrashed(id);
		noting = null;
	}

	async function purge(id: string) {
		noting = id;
		await purgeTrashed(id);
		noting = null;
	}

	async function clearTrash() {
		noting = '*';
		await emptyTrash();
		noting = null;
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-3">
		<div class="flex flex-col gap-0.5">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">
				{t('settings.attachment.title')}
			</span>
			<span class="text-label-sm font-label text-outline">
				{t('settings.attachment.summary', {
					count: attachmentStore.catalog.length,
					size: formatBytes(total)
				})}
			</span>
		</div>
		<Button variant="ghost" size="sm" onclick={() => void refreshAttachments()}>
			{t('settings.attachment.refresh')}
		</Button>
	</div>

	{#if attachmentStore.error}
		<span class="text-label-sm font-label text-error">{t('settings.attachment.loadFailed')}</span>
	{/if}

	{#if orphanCount > 0}
		<div class="glass-well flex items-center justify-between gap-3 rounded-2xl p-3">
			<div class="flex flex-col">
				<span class="text-body-md font-body text-on-surface">
					{t('settings.attachment.orphans', { count: orphanCount })}
				</span>
				<span class="text-label-sm font-label text-outline">
					{t('settings.attachment.orphansHint')}
				</span>
			</div>
			<Button
				variant="secondary"
				size="sm"
				disabled={noting !== null}
				onclick={() => void trashAllOrphans()}
			>
				{t('settings.attachment.trashOrphans')}
			</Button>
		</div>
	{/if}

	{#if rows.length === 0 && !attachmentStore.loading}
		<span class="text-label-sm font-label text-outline">{t('settings.attachment.empty')}</span>
	{:else}
		<div class="flex max-h-72 flex-col gap-1 overflow-y-auto">
			{#each rows as row (row.id)}
				{@const Icon = iconFor(row.ext)}
				{#if attachmentStore.orphans.includes(row.id)}
					<div
						class="flex items-center gap-3 rounded-xl p-2.5 ring-1 ring-inset ring-tertiary/40"
					>
						<div
							class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-tertiary-container text-on-tertiary-container"
						>
							<Icon size={15} />
						</div>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-body-sm font-body text-on-surface">{row.label}</span>
							<span class="text-label-sm font-label text-tertiary">
								{labelFor(row.ext)} · {formatBytes(row.size)} · {t('settings.attachment.orphanTag')}
							</span>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t('settings.attachment.trash')}
							disabled={noting !== null}
							onclick={() => void trashOne(row.id)}
						>
							<Trash2 size={15} />
						</Button>
					</div>
				{:else}
					<div class="flex items-center gap-3 rounded-xl p-2.5">
						<div
							class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant"
						>
							<Icon size={15} />
						</div>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-body-sm font-body text-on-surface">{row.label}</span>
							<span class="text-label-sm font-label text-outline">
								{labelFor(row.ext)} · {formatBytes(row.size)}
							</span>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t('settings.attachment.trash')}
							disabled={noting !== null}
							onclick={() => void trashOne(row.id)}
						>
							<Trash2 size={15} />
						</Button>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="mt-1 flex flex-col gap-2">
		<div class="flex items-center justify-between gap-3">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">
				{t('settings.attachment.trashTitle', { size: formatBytes(trashedBytes) })}
			</span>
			{#if trashed.length > 0}
				<Button variant="ghost" size="sm" disabled={noting !== null} onclick={() => void clearTrash()}>
					{t('settings.attachment.emptyTrash')}
				</Button>
			{/if}
		</div>

		{#if trashed.length === 0}
			<span class="text-label-sm font-label text-outline">{t('settings.attachment.trashEmpty')}</span>
		{:else}
			<div class="flex max-h-56 flex-col gap-1 overflow-y-auto">
				{#each trashed as item (item.id)}
					<div class="flex items-center gap-3 rounded-xl p-2.5">
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-code text-label-sm text-on-surface">
								{item.id.slice(0, 12)}{item.ext ? `.${item.ext}` : ''}
							</span>
							<span class="text-label-sm font-label text-outline">
								{dateLabel(item.deletedAt)} · {formatBytes(item.size)}
							</span>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t('settings.attachment.restore')}
							disabled={noting !== null}
							onclick={() => void restore(item.id)}
						>
							<RotateCcw size={15} />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={t('settings.attachment.purge')}
							disabled={noting !== null}
							onclick={() => void purge(item.id)}
						>
							<X size={15} />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
		<p class="text-label-sm font-label leading-relaxed text-outline">
			{t('settings.attachment.note', { days: 30 })}
		</p>
	</div>
</div>
