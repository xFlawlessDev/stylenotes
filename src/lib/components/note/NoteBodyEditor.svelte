<script lang="ts">
	import { tick } from 'svelte';
	import type { EditorCommand } from '$lib/content/markdown-editor';
	import { continueList, indentLines } from '$lib/content/markdown-lines';
	import { transform } from '$lib/content/markdown-commands';
	import { shortcutCommand } from '$lib/content/markdown-shortcuts';
	import { clickedCheckboxIndex, enableTaskCheckboxes } from '$lib/content/markdown-preview';
	import { insertAttachment, joinAttachmentMarkdown } from '$lib/content/attachments';
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { toggleChecklistItem } from '$lib/stores/notes';
	import { settings, type EditorView } from '$lib/stores/settings.svelte';
	import { Textarea } from '$lib/components/base';
	import EditorFormatBar from '$lib/components/workspace/EditorFormatBar.svelte';
	import FileDropZone from '$lib/components/workspace/FileDropZone.svelte';
	import MarkdownGuideDialog from '$lib/components/dialogs/MarkdownGuideDialog.svelte';

	let {
		body,
		view,
		autofocus = false,
		onchange
	}: {
		body: string;
		view: EditorView;
		autofocus?: boolean;
		onchange: (body: string) => void;
	} = $props();

	let draft = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let previewEl = $state<HTMLDivElement>();
	let guideOpen = $state(false);
	let focusedOnce = false;

	$effect(() => {
		draft = body;
	});

	$effect(() => {
		if (!autofocus || focusedOnce) return;
		focusedOnce = true;
		focusEnd();
	});

	const html = $derived.by(() => {
		if (!body) return '';
		try {
			return enableTaskCheckboxes(renderNoteHtml(body));
		} catch {
			return '';
		}
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

	function togglePreviewCheckbox(event: MouseEvent) {
		if (!previewEl) return;
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
					Drop files to attach
				</div>
			</div>
		{/if}

		{#if view !== 'preview'}
			<EditorFormatBar oncommand={runCommand} onguide={() => (guideOpen = true)} />
		{/if}

		<div class="grid min-h-0 flex-1 overflow-hidden">
			{#if view === 'write'}
				<Textarea
					bind:ref={textareaEl}
					value={draft}
					oninput={(event) => commitBody((event.currentTarget as HTMLTextAreaElement).value)}
					onkeydown={onEditorKeydown}
					spellcheck={settings.spellcheck}
					variant="bare"
					size="md"
					placeholder="Start writing. Use the toolbar or shortcuts to format..."
					class="scrollbar-none h-full w-full px-4 py-3 leading-relaxed text-on-surface-variant"
				></Textarea>
			{:else if view === 'split'}
				<div class="grid min-h-0 grid-cols-2 divide-x divide-hairline">
					<Textarea
						bind:ref={textareaEl}
						value={draft}
						oninput={(event) => commitBody((event.currentTarget as HTMLTextAreaElement).value)}
						onkeydown={onEditorKeydown}
						spellcheck={settings.spellcheck}
						variant="bare"
						size="sm"
						placeholder="Write here..."
						class="scrollbar-none h-full w-full px-3 py-3 leading-relaxed text-on-surface-variant"
					></Textarea>
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						bind:this={previewEl}
						class="scrollbar-none h-full overflow-y-auto px-3 py-3"
						onclick={togglePreviewCheckbox}
					>
						{#if html}
							<div class="markdown-body">{@html html}</div>
						{:else}
							<p class="text-body-sm font-body text-outline">Preview appears here.</p>
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
						<div class="markdown-body">{@html html}</div>
					{:else}
						<p class="text-body-md font-body text-outline">
							This note is empty. Switch to Write to start composing.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}
</FileDropZone>

<MarkdownGuideDialog bind:open={guideOpen} />
