<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { EditorCommand } from '$lib/content/markdown-editor';
	import { continueList, indentLines } from '$lib/content/markdown-lines';
	import { transform } from '$lib/content/markdown-commands';
	import { shortcutCommand } from '$lib/content/markdown-shortcuts';
	import { clickedCheckboxIndex, enableTaskCheckboxes } from '$lib/content/markdown-preview';
	import { insertAttachment, joinAttachmentMarkdown } from '$lib/content/attachments';
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import type { Task } from '$lib/stores/tasks';
	import { handlePreviewAction } from '$lib/content/preview-actions';
	import { handleExternalLink } from '$lib/content/external-links';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import { hydrateMermaid } from '$lib/content/mermaid-viewer';
	import { toggleChecklistItem } from '$lib/stores/notes';
	import { settings, type EditorView } from '$lib/stores/settings.svelte';
	import { Textarea } from '$lib/components/base';
	import EditorFormatBar from '$lib/components/workspace/EditorFormatBar.svelte';
	import FileDropZone from '$lib/components/workspace/FileDropZone.svelte';
	import MarkdownGuideDialog from '$lib/components/dialogs/MarkdownGuideDialog.svelte';
	import WikiLinkPopover from '$lib/components/note/WikiLinkPopover.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import {
		applyWikilink,
		moveSuggestion,
		wikiSuggestionsFor,
		type WikiSuggestion,
		type WikiSuggestionSet
	} from '$lib/content/wiki-autocomplete';

	let {
		body,
		view,
		autofocus = false,
		note,
		notes = [],
		tasks = [],
		folders = [],
		onwikilink,
		onchange
	}: {
		body: string;
		view: EditorView;
		autofocus?: boolean;
		note: Note;
		notes?: Note[];
		tasks?: Task[];
		folders?: CustomFolder[];
		onwikilink?: (click: WikiClick) => void;
		onchange: (body: string) => void;
	} = $props();

	let draft = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let previewEl = $state<HTMLDivElement>();
	let guideOpen = $state(false);
	let focusedOnce = false;
	let suggestions = $state<WikiSuggestionSet | null>(null);
	let activeIndex = $state(0);

	/** Workspace-scoped pools, so the popover offers what a link can reach. */
	const wikiContext = $derived({
		source: note,
		notes: notes.filter((item) => (item.workspaceId ?? 'workspace-default') === (note.workspaceId ?? 'workspace-default')),
		tasks: tasks.filter((item) => (item.workspaceId ?? 'workspace-default') === (note.workspaceId ?? 'workspace-default')),
		folders
	});

	const open = $derived(!!suggestions?.items.length);

	/** Recomputes the query from the live caret. */
	function refreshSuggestions() {
		const el = textareaEl;
		if (!el || (view !== 'write' && view !== 'split')) {
			suggestions = null;
			return;
		}
		const next = wikiSuggestionsFor(draft, el.selectionStart, wikiContext);
		suggestions = next?.items.length ? next : null;
		activeIndex = next?.items.length ? next.index : 0;
	}

	/**
	 * Keeps the popover in step when the pools change under it, without stealing
	 * the keyboard selection: `refreshSuggestions` would reset `activeIndex` to
	 * the head on every run, so the caret-derived list is rebuilt only when the
	 * query text actually moved.
	 */
	$effect(() => {
		const pools = wikiContext;
		const current = untrack(() => (suggestions ? suggestions.query.text : null));
		if (current === null) return;
		const el = textareaEl;
		if (!el) return;
		const caret = untrack(() => el.selectionStart);
		const next = wikiSuggestionsFor(draft, caret, pools);
		untrack(() => {
			suggestions = next?.items.length ? next : null;
		});
	});

	function choose(item: WikiSuggestion) {
		const el = textareaEl;
		const current = suggestions;
		if (!el || !current) return;
		const next = applyWikilink(draft, current.query, item.entity, current.query);
		suggestions = null;
		applyEdit({ value: next.value, start: next.caret, end: next.caret });
	}

	$effect(() => {
		draft = body;
	});

	$effect(() => {
		if (!autofocus || focusedOnce) return;
		focusedOnce = true;
		focusEnd();
	});

	let html = $state('');

	$effect(() => {
		let cancelled = false;
		if (!body) {
			html = '';
			return;
		}

		void renderNoteHtml(body, { source: note, notes, tasks, folders }).then(renderNotePreviewHtml)
			.then((rendered) => {
				if (!cancelled) html = enableTaskCheckboxes(rendered);
			})
			.catch(() => {
				if (!cancelled) html = '';
			});

		return () => {
			cancelled = true;
		};
	});

	function focusEnd() {
		void tick().then(() => {
			textareaEl?.focus();
			const end = textareaEl?.value.length ?? 0;
			textareaEl?.setSelectionRange(end, end);
		});
	}

	function commitBody(value: string) {
		draft = value;
		onchange(value);
	}

	function editorState() {
		const el = textareaEl;
		if (!el) return null;
		return { value: draft, start: el.selectionStart, end: el.selectionEnd };
	}

	function applyEdit(next: { value: string; start: number; end: number }) {
		commitBody(next.value);
		requestAnimationFrame(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(next.start, next.end);
		});
	}

	function runCommand(command: EditorCommand) {
		const current = editorState();
		if (!current) return;
		const next = transform(current, command);
		if (next) applyEdit(next);
	}

	function onEditorKeydown(event: KeyboardEvent) {
		if (suggestions?.items.length && handlePopoverKey(event)) return;

		if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
			const current = editorState();
			if (!current) return;
			const next = continueList(current);
			if (!next) return;
			event.preventDefault();
			event.stopPropagation();
			applyEdit(next);
			return;
		}

		if (event.key === 'Tab') {
			const current = editorState();
			if (!current) return;
			const next = indentLines(current, event.shiftKey);
			if (!next) return;
			event.preventDefault();
			event.stopPropagation();
			applyEdit(next);
			return;
		}

		const command = shortcutCommand(event);
		if (!command) return;
		event.preventDefault();
		event.stopPropagation();
		runCommand(command);
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

	/** Popover keys win over the editor's own Enter/Tab/Escape handling. */
	function handlePopoverKey(event: KeyboardEvent): boolean {
		const items = suggestions?.items ?? [];
		if (!items.length) return false;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = moveSuggestion(activeIndex, items.length, event.key === 'ArrowDown' ? 1 : -1);
			return true;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			choose(items[activeIndex] ?? items[0]);
			return true;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			suggestions = null;
			return true;
		}
		return false;
	}

	function syncSplitScroll(source: HTMLElement, target: HTMLElement) {
		const sourceRange = source.scrollHeight - source.clientHeight;
		const targetRange = target.scrollHeight - target.clientHeight;
		target.scrollTop = sourceRange > 0 ? (source.scrollTop / sourceRange) * targetRange : 0;
	}

	function onEditorScroll() {
		if (view === 'split' && textareaEl && previewEl) syncSplitScroll(textareaEl, previewEl);
	}

	function onPreviewScroll() {
		if (view === 'split' && textareaEl && previewEl) syncSplitScroll(previewEl, textareaEl);
	}

	async function togglePreviewCheckbox(event: MouseEvent) {
		if (!previewEl) return;
		if (await handlePreviewAction(event, previewEl)) return;
		if (handleExternalLink(event, previewEl)) return;
		const wikiClick = wikiClickFromTarget(event.target, previewEl);
		if (wikiClick) {
			event.preventDefault();
			onwikilink?.(wikiClick);
			return;
		}
		const index = clickedCheckboxIndex(previewEl, event.target);
		if (index < 0) return;
		event.preventDefault();
		commitBody(toggleChecklistItem(draft, index));
	}

	function attachFiles(paths: string[]) {
		if (!paths.length) return;
		const markdown = joinAttachmentMarkdown(paths);
		const editing = view === 'write' || view === 'split';
		const current =
			editing && textareaEl
				? { value: draft, start: textareaEl.selectionStart, end: textareaEl.selectionEnd }
				: { value: draft, start: draft.length, end: draft.length };
		const next = insertAttachment(current.value, current.start, current.end, markdown);
		commitBody(next.value);
		void tick().then(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(next.start, next.end);
		});
	}
</script>

<FileDropZone class="relative z-10 flex min-h-0 flex-1 flex-col" onfiles={attachFiles}>
	{#snippet children(droppable)}
		{#if droppable}
			<div
				class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface-container/40 backdrop-blur-[2px]"
			>
				<div class="glass-solid rounded-full px-4 py-2 text-label-md font-label text-on-surface">
					{t('notes.editor.dropFiles')}
				</div>
			</div>
		{/if}

		{#if view !== 'preview'}
			<EditorFormatBar oncommand={runCommand} onguide={() => (guideOpen = true)} />
		{/if}

		<div class="relative grid min-h-0 flex-1 overflow-hidden">
			{#if view === 'write'}
				<Textarea
					bind:ref={textareaEl}
					value={draft}
					oninput={(event) => {
						commitBody((event.currentTarget as HTMLTextAreaElement).value);
						refreshSuggestions();
					}}
					onkeydown={onEditorKeydown}
					onkeyup={refreshFromKeyup}
					onclick={refreshSuggestions}
					onblur={() => (suggestions = null)}
					spellcheck={settings.spellcheck}
					variant="bare"
					size="md"
					placeholder={t('notes.editor.writePlaceholder')}
					class="scrollbar-none h-full w-full px-4 py-3 leading-relaxed text-on-surface-variant"
				></Textarea>
			{:else if view === 'split'}
				<div class="grid min-h-0 grid-cols-2 divide-x divide-hairline">
					<Textarea
						bind:ref={textareaEl}
						value={draft}
						oninput={(event) => {
							commitBody((event.currentTarget as HTMLTextAreaElement).value);
							refreshSuggestions();
						}}
						onkeydown={onEditorKeydown}
						onkeyup={refreshFromKeyup}
						onclick={refreshSuggestions}
						onblur={() => (suggestions = null)}
						spellcheck={settings.spellcheck}
						variant="bare"
						size="sm"
						placeholder={t('notes.editor.splitPlaceholder')}
						class="scrollbar-none h-full w-full overflow-y-auto px-3 py-3 leading-relaxed text-on-surface-variant"
						onscroll={onEditorScroll}
					></Textarea>
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						bind:this={previewEl}
						class="scrollbar-none h-full overflow-y-auto px-3 py-3"
						onscroll={onPreviewScroll}
						onclick={togglePreviewCheckbox}
					>
						{#if html}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="markdown-body" use:hydrateMermaid>{@html html}</div>
						{:else}
							<p class="text-body-sm font-body text-outline">{t('notes.editor.previewHere')}</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					bind:this={previewEl}
					class="scrollbar-none h-full overflow-y-auto px-4 py-3"
					onclick={togglePreviewCheckbox}
				>
					{#if html}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="markdown-body" use:hydrateMermaid>{@html html}</div>
					{:else}
						<p class="text-body-md font-body text-outline">
							{t('notes.editor.emptyPreview')}
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
	{/snippet}
</FileDropZone>

<MarkdownGuideDialog bind:open={guideOpen} />
