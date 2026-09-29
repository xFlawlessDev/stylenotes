<script lang="ts">
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { t } from '$lib/i18n/index.svelte';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import { handleExternalLink } from '$lib/content/external-links';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import type { Task } from '$lib/stores/tasks';
	import type { TaskView } from '$lib/stores/settings.svelte';
	import { SegmentedControl, Textarea } from '$lib/components/base';
	import WikiLinkPopover from '$lib/components/note/WikiLinkPopover.svelte';
	import {
		applyWikilink,
		moveSuggestion,
		wikiSuggestionsFor,
		type WikiSuggestion,
		type WikiSuggestionSet
	} from '$lib/content/wiki-autocomplete';

	let {
		detail = $bindable(''),
		task = null,
		notes = [],
		tasks = [],
		folders = [],
		preview = false,
		view = $bindable('write' as TaskView),
		fill = false,
		compact = false,
		idPrefix = 'task',
		onwikilink
	}: {
		detail?: string;
		task?: Task | null;
		notes?: Note[];
		tasks?: Task[];
		folders?: CustomFolder[];
		/** Renders a Write/Split/Preview switch; the preview resolves wiki links. */
		preview?: boolean;
		/** Internal view when `preview` is set; the header switcher owns it otherwise. */
		view?: TaskView;
		/** Fills the parent height with an internal scroll area (window layout). */
		fill?: boolean;
		compact?: boolean;
		idPrefix?: string;
		onwikilink?: (click: WikiClick) => void;
	} = $props();

	/** Local view used when the parent does not own one (dialog). */
	let localView = $state<TaskView>('write');
	let html = $state('');
	let previewEl = $state<HTMLDivElement>();
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let suggestions = $state<WikiSuggestionSet | null>(null);
	let activeIndex = $state(0);

	/** The effective view: the bound one when filled, the local one in a dialog. */
	const mode = $derived<TaskView>(fill ? view : localView);
	const writes = $derived(mode !== 'preview');
	const showSplit = $derived(mode === 'split');
	const showWrite = $derived(mode === 'write' || mode === 'split');
	/** How the Write surface scrolls: the textarea itself, or the wrapping well. */
	const textareaClass = $derived(
		fill
			? 'scrollbar-none h-full w-full px-3 py-2.5 leading-relaxed text-on-surface-variant'
			: compact
				? 'py-1.5'
				: 'py-2'
	);
	const previewClass = $derived(
		fill
			? 'scrollbar-none h-full overflow-y-auto px-3 py-2.5'
			: 'scrollbar-none max-h-64 overflow-y-auto rounded-xl bg-surface-container-low/50 px-3 py-2'
	);

	/** Workspace-scoped pools; a task never links to itself. */
	const wikiContext = $derived({
		source: task ?? { id: '', title: '', folder: '' },
		notes: notes.filter(scopeToTask),
		tasks: tasks.filter(scopeToTask),
		folders
	});

	const open = $derived(!!suggestions?.items.length);

	function scopeToTask(item: { workspaceId?: string }): boolean {
		const id = task?.workspaceId ?? 'workspace-default';
		return (item.workspaceId ?? 'workspace-default') === id;
	}

	/** Recomputes the query from the live caret. */
	function refreshSuggestions() {
		const el = textareaEl;
		if (!el || !writes) {
			suggestions = null;
			return;
		}
		const next = wikiSuggestionsFor(detail, el.selectionStart, wikiContext);
		suggestions = next?.items.length ? next : null;
		activeIndex = next?.items.length ? next.index : 0;
	}

	function choose(item: WikiSuggestion) {
		const current = suggestions;
		if (!current || !textareaEl) return;
		const next = applyWikilink(detail, current.query, item.entity, current.query);
		suggestions = null;
		detail = next.value;
		requestAnimationFrame(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(next.caret, next.caret);
		});
	}

	/**
	 * Recomputes the query from the live caret. Keyups the popover consumed are
	 * skipped: after `Enter` the caret sits past the inserted link, and
	 * refreshing there would immediately reopen the list.
	 */
	function refreshFromKeyup(event: KeyboardEvent) {
		if (event.key.startsWith('Arrow') || event.key === 'Escape') return;
		if (event.key === 'Enter' || event.key === 'Tab') return;
		refreshSuggestions();
	}

	/** Popover keys win over the textarea's own Enter/Tab/Escape handling. */
	function handleKeydown(event: KeyboardEvent) {
		const items = suggestions?.items ?? [];
		if (!items.length) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = moveSuggestion(activeIndex, items.length, event.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			choose(items[activeIndex] ?? items[0]);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			suggestions = null;
		}
	}

	$effect(() => {
		let cancelled = false;
		if (mode !== 'preview' || !task || !detail.trim()) {
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
		if (handleExternalLink(event, previewEl)) return;
		const wikiClick = wikiClickFromTarget(event.target, previewEl);
		if (!wikiClick) return;
		event.preventDefault();
		onwikilink?.(wikiClick);
	}
</script>

{#if preview && !fill}
	<div class="mb-1.5 flex justify-end">
		<SegmentedControl
			size="xs"
			ariaLabel="Task details view"
			items={[
				{ id: 'write', label: 'Write' },
				{ id: 'split', label: 'Split' },
				{ id: 'preview', label: 'Preview' },
			]}
			value={localView}
			onchange={(id) => (localView = id as TaskView)}
		/>
	</div>
{/if}

{#if fill}
	<div class="grid min-h-0 flex-1 overflow-hidden">
		{#if showSplit}
			<div class="grid min-h-0 grid-cols-2 divide-x divide-hairline">
				<Textarea
					id="{idPrefix}-notes"
					bind:ref={textareaEl}
					bind:value={detail}
					oninput={refreshSuggestions}
					onkeydown={handleKeydown}
					onkeyup={refreshFromKeyup}
					onclick={refreshSuggestions}
					onblur={() => (suggestions = null)}
					variant="bare"
					size="sm"
					class={textareaClass}
					placeholder={t('tasks.form.detailsPlaceholder')}
				/>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div bind:this={previewEl} class={previewClass} onclick={handlePreviewClick}>
					{#if html}
						<div class="markdown-body">{@html html}</div>
					{:else}
						<p class="text-body-sm font-body text-outline">{t('tasks.form.nothingToPreview')}</p>
					{/if}
				</div>
			</div>
		{:else if showWrite}
			<Textarea
				id="{idPrefix}-notes"
				bind:ref={textareaEl}
				bind:value={detail}
				oninput={refreshSuggestions}
				onkeydown={handleKeydown}
				onkeyup={refreshFromKeyup}
				onclick={refreshSuggestions}
				onblur={() => (suggestions = null)}
				variant="bare"
				size="sm"
				class={textareaClass}
				placeholder={t('tasks.form.detailsPlaceholder')}
			/>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div bind:this={previewEl} class={previewClass} onclick={handlePreviewClick}>
				{#if html}
					<div class="markdown-body">{@html html}</div>
				{:else}
					<p class="text-body-sm font-body text-outline">
						{t('tasks.form.detailsEmpty')}
					</p>
				{/if}
			</div>
		{/if}

		<WikiLinkPopover
			{open}
			target={textareaEl}
			items={suggestions?.items ?? []}
			index={activeIndex}
			onselect={choose}
			onhover={(position) => (activeIndex = position)}
		/>
	</div>
{:else if mode === 'preview'}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div bind:this={previewEl} class={previewClass} onclick={handlePreviewClick}>
		{#if html}
			<div class="markdown-body">{@html html}</div>
		{:else}
			<p class="text-body-sm font-body text-outline">{t('tasks.form.nothingToPreview')}</p>
		{/if}
	</div>
{:else}
	<div class="relative">
		<Textarea
			id="{idPrefix}-notes"
			bind:ref={textareaEl}
			bind:value={detail}
			oninput={refreshSuggestions}
			onkeydown={handleKeydown}
			onkeyup={refreshFromKeyup}
			onclick={refreshSuggestions}
			onblur={() => (suggestions = null)}
			rows={compact ? 2 : 3}
			size="sm"
			class={compact ? 'py-1.5' : 'py-2'}
			placeholder={t('tasks.form.detailsPlaceholder')}
		/>
		<WikiLinkPopover
			{open}
			target={textareaEl}
			items={suggestions?.items ?? []}
			index={activeIndex}
			onselect={choose}
			onhover={(position) => (activeIndex = position)}
		/>
	</div>
{/if}
