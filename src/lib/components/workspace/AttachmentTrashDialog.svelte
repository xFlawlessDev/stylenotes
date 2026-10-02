<script lang="ts">
	import { onMount } from 'svelte';
	import { FileText, Film, Image as ImageIcon, Music, RotateCcw, Trash2 } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, EmptyState, SearchInput, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		formatBytes,
		filterTrashRows,
		kindForTarget,
		type AttachmentKindFilter
	} from '$lib/content/attachment-manager';
	import {
		attachmentStore,
		emptyTrash,
		primeAttachments,
		purgeTrashed,
		refreshAttachments,
		restoreTrashed
	} from '$lib/stores/attachments.svelte';
	import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';

	/**
	 * Trash (docs/design/artifacts.md #A11–#A15).
	 *
	 * Deleted blobs live here until the retention window lapses or the user
	 * empties the trash. Kept as its own dialog so a growing list gets its own
	 * filter and search instead of crowding the manager panel.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	let query = $state('');
	let kind = $state<AttachmentKindFilter>('all');
	let noting = $state<string | null>(null);
	let confirmPurge = $state<string | null>(null);
	let confirmEmpty = $state(false);

	onMount(() => void primeAttachments());

	// Refresh whenever the dialog opens, so it never shows a stale list.
	$effect(() => {
		if (open) void refreshAttachments();
	});

	const trashed = $derived(attachmentStore.trash);
	const trashedBytes = $derived(trashed.reduce((sum, item) => sum + (item.size || 0), 0));
	const rows = $derived(filterTrashRows(trashed, { kind, query }));

	const kindOptions = $derived(
		(['all', 'image', 'video', 'audio', 'pdf', 'file'] as AttachmentKindFilter[]).map((value) => ({
			value,
			label: value === 'all' ? t('settings.attachment.filterAll') : t(`settings.attachment.kind.${value}`)
		}))
	);

	function iconFor(ext: string) {
		const kind = kindForTarget(ext ? `x.${ext}` : 'x');
		if (kind === 'image') return ImageIcon;
		if (kind === 'video') return Film;
		if (kind === 'audio') return Music;
		return FileText;
	}

	function dateLabel(value: number): string {
		try {
			return new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(new Date(value));
		} catch {
			return '';
		}
	}

	async function restore(id: string) {
		noting = id;
		await restoreTrashed(id);
		noting = null;
	}

	async function purge(id: string) {
		confirmPurge = null;
		noting = id;
		await purgeTrashed(id);
		noting = null;
	}

	async function clearTrash() {
		confirmEmpty = false;
		noting = '*';
		await emptyTrash();
		noting = null;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog flex max-h-[80vh] flex-col sm:max-w-lg">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-error"
			>
				<Trash2 size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface">
				{t('settings.attachment.trashDialogTitle')}
			</Dialog.Title>
			<Dialog.Description>
				{t('settings.attachment.trashSubtitle', { days: 30 })}
			</Dialog.Description>
		</Dialog.Header>

		{#if trashed.length > 0}
			<div class="flex items-center gap-2">
				<SearchInput
					bind:value={query}
					class="min-w-0 flex-1"
					placeholder={t('settings.attachment.searchTrashPlaceholder')}
					ariaLabel={t('settings.attachment.searchTrashPlaceholder')}
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
			<span class="text-label-sm font-label text-outline">
				{t('settings.attachment.trashSummary', {
					count: rows.length,
					size: formatBytes(trashedBytes)
				})}
			</span>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if trashed.length === 0}
				<EmptyState icon={Trash2} title={t('settings.attachment.trashEmpty')} />
			{:else if rows.length === 0}
				<EmptyState icon={FileText} title={t('settings.attachment.noMatch')} />
			{:else}
				<div class="flex flex-col gap-1">
					{#each rows as item (`${item.id}-${item.deletedAt}`)}
						{@const Icon = iconFor(item.ext)}
						<div class="flex items-center gap-3 rounded-xl p-2.5">
							<div
								class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant"
							>
								<Icon size={15} />
							</div>
							<div class="flex min-w-0 flex-1 flex-col">
								<span class="truncate font-code text-label-sm text-on-surface">
									{item.id.slice(0, 12)}{item.ext ? `.${item.ext}` : ''}
								</span>
								<span class="text-label-sm font-label text-outline">
									{dateLabel(item.deletedAt)} · {formatBytes(item.size)}
								</span>
							</div>
							<Button
								variant="secondary"
								size="xs"
								disabled={noting !== null}
								onclick={() => void restore(item.id)}
							>
								<RotateCcw size={13} />
								{t('settings.attachment.restore')}
							</Button>
							<Button
								variant="danger"
								size="xs"
								disabled={noting !== null}
								onclick={() => (confirmPurge = item.id)}
							>
								<Trash2 size={13} />
								{t('settings.attachment.deleteForever')}
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<p class="text-label-sm font-label leading-relaxed text-outline">
			{t('settings.attachment.note', { days: 30 })}
		</p>

		<Dialog.Footer
			class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-between"
		>
			<Button
				variant="danger"
				size="md"
				disabled={trashed.length === 0 || noting !== null}
				onclick={() => (confirmEmpty = true)}
			>
				<Trash2 size={14} />
				{t('settings.attachment.emptyTrash')}
			</Button>
			<Button variant="outline" size="md" onclick={() => (open = false)}>
				{t('common.close')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	open={confirmPurge !== null}
	title={t('settings.attachment.confirmPurgeTitle')}
	description={t('settings.attachment.confirmPurgeBody')}
	confirmLabel={t('settings.attachment.deleteForever')}
	onconfirm={() => confirmPurge && void purge(confirmPurge)}
	oncancel={() => (confirmPurge = null)}
/>

<ConfirmDialog
	open={confirmEmpty}
	title={t('settings.attachment.confirmEmptyTitle')}
	description={t('settings.attachment.confirmEmptyBody')}
	confirmLabel={t('settings.attachment.emptyTrash')}
	onconfirm={() => void clearTrash()}
	oncancel={() => (confirmEmpty = false)}
/>
