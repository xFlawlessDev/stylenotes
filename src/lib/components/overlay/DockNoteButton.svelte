<script lang="ts">
	import { FileText } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import type { Note } from '$lib/content/content';
	import { t } from '$lib/i18n/index.svelte';
	import { dockItemBar, type DockEdge } from '$lib/dock';

	let {
		note,
		edge,
		active,
		workspace = '',
		tone = '',
		onopen
	}: {
		note: Note;
		edge: DockEdge;
		active: boolean;
		/** Workspace label, shown only when the dock mixes workspaces. */
		workspace?: string;
		/** Workspace chip classes for the dot. */
		tone?: string;
		onopen: (note: Note) => void;
	} = $props();

	const bar = $derived(dockItemBar(edge, active));
	const label = $derived(
		t('over.openNote', { title: note.title || t('common.untitledNote') }) +
			(workspace ? ` (${workspace})` : '')
	);
</script>

<!-- The hover card beside the rail already previews the note; no tooltip. -->
<Button
	data-dock-id={note.id}
	data-dock-kind="note"
	variant="secondary"
	size="icon-lg"
	class="group relative shrink-0 {active ? 'scale-105 ring-1 ring-inset ring-tertiary/60' : 'hover:scale-105'}"
	aria-label={label}
	ondblclick={() => onopen(note)}
	onclick={(event) => {
		// Keyboard and assistive tech report detail 0; pointer clicks wait for
		// the second click so a stray click cannot open a window.
		if (event.detail === 0) onopen(note);
	}}
>
	<FileText size={18} class={note.pinned ? 'text-tertiary' : 'text-on-surface-variant'} />
	<span class="{bar} {note.pinned ? 'bg-tertiary' : 'bg-outline'}"></span>
	{#if workspace}
		<span
			class="absolute top-0.5 left-0.5 size-1.5 rounded-full border border-surface {tone}"
			aria-hidden="true"
		></span>
	{/if}
</Button>
