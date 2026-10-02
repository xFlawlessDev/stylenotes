<script lang="ts">
	import { Minimize2, X } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { EditorView } from '$lib/stores/settings.svelte';
	import { settings, updateSettings } from '$lib/stores/settings.svelte';
	import { openNoteWindow } from '$lib/windows';
	import { Button, Skeleton } from '$lib/components/base';
	import NoteToolbar from '$lib/components/workspace/NoteToolbar.svelte';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * The editor's top bar: it shows either the full-preview / focus-mode exit
	 * strip or the note toolbar, depending on the current mode. While the
	 * editor's content is still rendering, `loading` swaps the toolbar for a
	 * shape-matched skeleton so the bar does not pop in ahead of the body.
	 */
	let {
		note,
		view,
		fullPreview = false,
		archived = false,
		loading = false,
		onview,
		ontogglepin,
		ontoggledock,
		ontogglearchive,
		onprint,
		onexport,
		oncopy,
		ondelete,
		onfullpreview,
		onhistory
	}: {
		note: Note;
		view: EditorView;
		fullPreview?: boolean;
		archived?: boolean;
		loading?: boolean;
		onview: (view: EditorView) => void;
		ontogglepin: () => void;
		ontoggledock: () => void;
		ontogglearchive: () => void;
		onprint: () => void;
		onexport: () => void;
		oncopy: () => void;
		ondelete: () => void;
		onfullpreview: () => void;
		onhistory?: () => void;
	} = $props();
</script>

{#if loading}
	<div
		class="flex h-10 shrink-0 items-center justify-end gap-1 px-4"
		role="status"
		aria-busy="true"
		aria-label={t('common.loading')}
	>
		<div class="glass-well mr-1 hidden items-center gap-1 rounded-lg p-0.5 sm:flex">
			<Skeleton class="size-7" />
			<Skeleton class="size-7" />
			<Skeleton class="size-7" />
		</div>
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
		<Skeleton class="hidden size-8 sm:block" />
		<Skeleton class="hidden size-8 sm:block" />
	</div>
{:else if fullPreview}
	<div class="flex h-11 shrink-0 items-center justify-between px-4">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">{t('notes.editor.fullPreview')}</span>
		<Button variant="secondary" size="xs" shape="pill" class="gap-1.5" onclick={onfullpreview}>
			<Minimize2 size={13} /> {t('notes.editor.exit')}
		</Button>
	</div>
{:else if settings.focusMode}
	<div class="flex h-11 shrink-0 items-center justify-between px-4">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">{t('notes.editor.focusMode')}</span>
		<Button
			variant="secondary"
			size="xs"
			shape="pill"
			class="gap-1.5"
			onclick={() => updateSettings({ focusMode: false })}
		>
			<X size={13} /> {t('notes.editor.exit')}
		</Button>
	</div>
{:else}
	<div class="flex h-10 shrink-0 items-center justify-end px-4">
		<NoteToolbar
			{view}
			pinned={note.pinned}
			docked={note.overlay}
			{archived}
			onview={onview}
			{ontogglepin}
			{ontoggledock}
			{ontogglearchive}
			onopenwindow={() => void openNoteWindow(note.id)}
			onprint={onprint}
			onexport={onexport}
			oncopy={oncopy}
			ondelete={ondelete}
			onfullpreview={onfullpreview}
			{onhistory}
		/>
	</div>
{/if}
