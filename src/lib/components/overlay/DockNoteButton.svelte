<script lang="ts">
	import { FileText } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import type { Note } from '$lib/content/content';
	import { dockItemBar, type DockEdge } from '$lib/dock';

	let {
		note,
		edge,
		active,
		onopen
	}: {
		note: Note;
		edge: DockEdge;
		active: boolean;
		onopen: (note: Note) => void;
	} = $props();

	const bar = $derived(dockItemBar(edge, active));
</script>

<!-- No tooltip here: the hover card next to the rail already shows the note. -->
<Button
	data-dock-id={note.id}
	data-dock-kind="note"
	variant="secondary"
	size="icon-lg"
	class="group relative shrink-0 {active
		? 'scale-105 ring-1 ring-inset ring-tertiary/60'
		: 'hover:scale-105'}"
	aria-label="{note.title} — double-click to open note window"
	ondblclick={() => onopen(note)}
	onclick={(event) => {
		// Keyboard and assistive tech report detail 0; pointer clicks wait for
		// the second click so a stray click cannot open a window.
		if (event.detail === 0) onopen(note);
	}}
>
	<FileText size={18} class={note.pinned ? 'text-tertiary' : 'text-on-surface-variant'} />
	<span class="{bar} {note.pinned ? 'bg-tertiary' : 'bg-outline'}"></span>
</Button>
