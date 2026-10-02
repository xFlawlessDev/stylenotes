<script lang="ts">
	import { Check, Copy, FileText, Film, Image as ImageIcon, Music, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { formatBytes, type AttachmentCatalogRow } from '$lib/content/attachment-manager';

	/**
	 * One stored blob in the attachment manager: label, type, size, and the two
	 * actions — copy its markdown for use in a note, or move it to Trash.
	 *
	 * Kept separate from `AttachmentSettings` so the list row stays dumb while the
	 * panel owns filters and the store calls.
	 */
	let {
		row,
		orphan = false,
		busy = false,
		copied = false,
		onuse,
		ontrash
	}: {
		row: AttachmentCatalogRow;
		/** No note references this blob; flag it so the user can see why it is here. */
		orphan?: boolean;
		busy?: boolean;
		copied?: boolean;
		onuse: (row: AttachmentCatalogRow) => void;
		ontrash: (row: AttachmentCatalogRow) => void;
	} = $props();

	const Icon = $derived(
		row.kind === 'image'
			? ImageIcon
			: row.kind === 'video'
				? Film
				: row.kind === 'audio'
					? Music
					: FileText
	);
</script>

<div
	class="flex items-center gap-3 rounded-xl p-2.5 {orphan
		? 'ring-1 ring-inset ring-tertiary/40'
		: ''}"
>
	<div
		class="flex size-8 shrink-0 items-center justify-center rounded-xl {orphan
			? 'bg-tertiary-container text-on-tertiary-container'
			: 'bg-surface-container text-on-surface-variant'}"
	>
		<Icon size={15} />
	</div>
	<div class="flex min-w-0 flex-1 flex-col">
		<span class="truncate text-body-sm font-body text-on-surface" title={row.label}>{row.label}</span>
		<span class="text-label-sm font-label {orphan ? 'text-tertiary' : 'text-outline'}">
			{t(`settings.attachment.kind.${row.kind}`)} · {formatBytes(row.size)}
			{#if orphan}
				· {t('settings.attachment.orphanTag')}
			{/if}
		</span>
	</div>
	<Button
		variant="secondary"
		size="xs"
		disabled={busy}
		title={t('settings.attachment.useHint')}
		onclick={() => onuse(row)}
	>
		{#if copied}
			<Check size={13} />
			{t('settings.attachment.used')}
		{:else}
			<Copy size={13} />
			{t('settings.attachment.use')}
		{/if}
	</Button>
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={t('settings.attachment.trash')}
		disabled={busy}
		onclick={() => ontrash(row)}
	>
		<Trash2 size={15} />
	</Button>
</div>
