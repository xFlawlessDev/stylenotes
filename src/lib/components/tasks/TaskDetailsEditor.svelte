<script lang="ts">
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import type { Task } from '$lib/stores/tasks';
	import { SegmentedControl, Textarea } from '$lib/components/base';

	let {
		detail = $bindable(''),
		task = null,
		notes = [],
		tasks = [],
		folders = [],
		preview = false,
		compact = false,
		idPrefix = 'task',
		onwikilink,
	}: {
		detail?: string;
		task?: Task | null;
		notes?: Note[];
		tasks?: Task[];
		folders?: CustomFolder[];
		/** Renders a Write/Preview switch; the preview resolves wiki links. */
		preview?: boolean;
		compact?: boolean;
		idPrefix?: string;
		onwikilink?: (click: WikiClick) => void;
	} = $props();

	let mode = $state<'write' | 'preview'>('write');
	let html = $state('');
	let previewEl = $state<HTMLDivElement>();

	$effect(() => {
		let cancelled = false;
		if (!preview || mode !== 'preview' || !task || !detail.trim()) {
			html = '';
			return;
		}

		void renderNoteHtml(detail, { source: task, notes, tasks, folders })
			.then(renderNotePreviewHtml)
			.then((rendered) => {
				if (!cancelled) html = rendered;
			})
			.catch(() => {
				if (!cancelled) html = '';
			});

		return () => {
			cancelled = true;
		};
	});

	function handlePreviewClick(event: MouseEvent) {
		if (!previewEl) return;
		const wikiClick = wikiClickFromTarget(event.target, previewEl);
		if (!wikiClick) return;
		event.preventDefault();
		onwikilink?.(wikiClick);
	}
</script>

{#if preview}
	<div class="mb-1.5 flex justify-end">
		<SegmentedControl
			size="xs"
			ariaLabel="Task details view"
			items={[
				{ id: 'write', label: 'Write' },
				{ id: 'preview', label: 'Preview' },
			]}
			value={mode}
			onchange={(id) => (mode = id as 'write' | 'preview')}
		/>
	</div>
{/if}

{#if preview && mode === 'preview'}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		bind:this={previewEl}
		class="scrollbar-none max-h-64 overflow-y-auto rounded-xl bg-surface-container-low/50 px-3 py-2 [&_input[type='checkbox']]:pointer-events-none"
		onclick={handlePreviewClick}
	>
		{#if html}
			<div class="markdown-body">{@html html}</div>
		{:else}
			<p class="text-body-sm font-body text-outline">Nothing to preview yet.</p>
		{/if}
	</div>
{:else}
	<Textarea
		id="{idPrefix}-notes"
		bind:value={detail}
		rows={compact ? 2 : 3}
		size="sm"
		class={compact ? 'py-1.5' : 'py-2'}
		placeholder="Context, links, next steps. Type [[ to link a note or task."
	/>
{/if}
