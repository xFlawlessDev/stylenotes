<script lang="ts">
	import { onMount } from 'svelte';
	import { FileText, Trash2 } from '@lucide/svelte';
	import { Button, EmptyState, SearchInput, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		catalogRows,
		filterCatalogRows,
		formatBytes,
		totalBytes,
		type AttachmentCatalogRow,
		type AttachmentKindFilter
	} from '$lib/content/attachment-manager';
	import { attachmentMarkdown } from '$lib/content/attachments';
	import {
		attachmentStore,
		primeAttachments,
		refreshAttachments,
		removeAttachment,
		trashOrphans
	} from '$lib/stores/attachments.svelte';
	import AttachmentFileRow from '$lib/components/workspace/AttachmentFileRow.svelte';
	import AttachmentTrashDialog from '$lib/components/workspace/AttachmentTrashDialog.svelte';

	/**
	 * Attachment manager (docs/design/artifacts.md).
	 *
	 * The store is content-addressed, so this is where the user sees what is
	 * actually on disk: total size, orphaned blobs no note points at, and a door
	 * to the recoverable Trash. Nothing is deleted outright — a blob only leaves
	 * the store when the user empties the trash. As the store grows, the list is
	 * narrowed by kind and by search instead of scrolling.
	 */
	let noting = $state<string | null>(null);
	let query = $state('');
	let kind = $state<AttachmentKindFilter>('all');
	let trashOpen = $state(false);
	/** Id whose markdown was just copied, so its button can confirm. */
	let copiedId = $state<string | null>(null);

	onMount(() => void primeAttachments());

	const rows = $derived(catalogRows(attachmentStore.catalog));
	const referencesById = $derived(new Map(rows.map((row) => [row.id, row.reference])));
	const orphanSet = $derived(new Set(attachmentStore.orphans));
	const orphanCount = $derived(attachmentStore.orphans.length);
	const total = $derived(totalBytes(attachmentStore.catalog));
	const filtered = $derived(filterCatalogRows(rows, { kind, query, orphans: orphanSet }));
	const trashCount = $derived(attachmentStore.trash.length);
	const filtering = $derived(Boolean(query.trim()) || kind !== 'all');

	const kindOptions = $derived(
		(['all', 'image', 'video', 'audio', 'pdf', 'file', 'orphan'] as AttachmentKindFilter[]).map(
			(value) => ({
				value,
				label:
					value === 'all'
						? t('settings.attachment.filterAll')
						: value === 'orphan'
							? t('settings.attachment.filterOrphans', { count: orphanCount })
							: t(`settings.attachment.kind.${value}`)
			})
		)
	);

	async function use(row: AttachmentCatalogRow) {
		try {
			await navigator.clipboard.writeText(attachmentMarkdown(row.reference, row.label));
			copiedId = row.id;
			setTimeout(() => {
				if (copiedId === row.id) copiedId = null;
			}, 1500);
		} catch {
			/* clipboard denied: nothing copied, so do not claim success */
		}
	}

	async function trashOne(row: AttachmentCatalogRow) {
		noting = row.id;
		await removeAttachment(row.id, row.reference);
		noting = null;
	}

	async function trashAllOrphans() {
		noting = '*';
		await trashOrphans(referencesById);
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

	{#if rows.length > 0}
		<div class="flex items-center gap-2">
			<SearchInput
				bind:value={query}
				class="min-w-0 flex-1"
				placeholder={t('settings.attachment.searchPlaceholder')}
				ariaLabel={t('settings.attachment.searchPlaceholder')}
			/>
			<Select
				bind:value={kind}
				options={kindOptions}
				label={t('settings.attachment.filterLabel')}
				variant="chip"
				size="sm"
				class="shrink-0"
			/>
		</div>
	{/if}

	{#if rows.length === 0}
		{#if !attachmentStore.loading}
			<span class="text-label-sm font-label text-outline">{t('settings.attachment.empty')}</span>
		{/if}
	{:else if filtered.length === 0}
		<EmptyState icon={FileText} title={t('settings.attachment.noMatch')} />
	{:else}
		<div class="flex max-h-72 flex-col gap-1 overflow-y-auto">
			{#each filtered as row (row.id)}
				<AttachmentFileRow
					{row}
					orphan={orphanSet.has(row.id)}
					busy={noting !== null}
					copied={copiedId === row.id}
					onuse={(target) => void use(target)}
					ontrash={(target) => void trashOne(target)}
				/>
			{/each}
		</div>
	{/if}

	{#if filtering && filtered.length > 0}
		<span class="text-label-sm font-label text-outline">
			{t('settings.attachment.showing', { shown: filtered.length, total: rows.length })}
		</span>
	{/if}

	<div class="mt-1 flex items-center justify-between gap-3">
		<div class="flex flex-col">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">
				{t('settings.attachment.trashTitle')}
			</span>
			<span class="text-label-sm font-label text-outline">
				{trashCount > 0 ? t('settings.attachment.trashCount', { count: trashCount }) : t('settings.attachment.trashEmpty')}
			</span>
		</div>
		<Button variant="secondary" size="sm" onclick={() => (trashOpen = true)}>
			<Trash2 size={14} />
			{t('settings.attachment.openTrash')}
		</Button>
	</div>
</div>

<AttachmentTrashDialog bind:open={trashOpen} />
