<script lang="ts">
	import { Minimize2, X } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { EditorView } from '$lib/stores/settings.svelte';
	import { settings, updateSettings } from '$lib/stores/settings.svelte';
	import { openNoteWindow } from '$lib/windows';
	import { Button } from '$lib/components/base';
	import NoteToolbar from '$lib/components/workspace/NoteToolbar.svelte';

	/**
	 * The editor's top bar: it shows either the full-preview / focus-mode exit
	 * strip or the note toolbar, depending on the current mode.
	 */
	let {
		note,
		view,
		fullPreview = false,
		archived = false,
		onview,
		ontogglepin,
		ontoggledock,
		ontogglearchive,
		onprint,
		onexport,
		oncopy,
		ondelete,
		onfullpreview
	}: {
		note: Note;
		view: EditorView;
		fullPreview?: boolean;
		archived?: boolean;
		onview: (view: EditorView) => void;
		ontogglepin: () => void;
		ontoggledock: () => void;
		ontogglearchive: () => void;
		onprint: () => void;
		onexport: () => void;
		oncopy: () => void;
		ondelete: () => void;
		onfullpreview: () => void;
	} = $props();
</script>

{#if fullPreview}
	<div class="flex h-11 shrink-0 items-center justify-between px-4">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">Full preview</span>
		<Button variant="secondary" size="xs" shape="pill" class="gap-1.5" onclick={onfullpreview}>
			<Minimize2 size={13} /> Exit
		</Button>
	</div>
{:else if settings.focusMode}
	<div class="flex h-11 shrink-0 items-center justify-between px-4">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">Focus mode</span>
		<Button
			variant="secondary"
			size="xs"
			shape="pill"
			class="gap-1.5"
			onclick={() => updateSettings({ focusMode: false })}
		>
			<X size={13} /> Exit
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
		/>
	</div>
{/if}
