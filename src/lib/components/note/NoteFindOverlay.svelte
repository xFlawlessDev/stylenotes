<script lang="ts">
	import { untrack } from 'svelte';
	import type { EditorView } from '$lib/stores/settings.svelte';
	import { findMatches, stepMatch } from '$lib/content/find';
	import {
		clearPreviewHighlights,
		collectPreviewMatches,
		paintPreviewMatches,
		revealTextareaMatch,
		scrollPreviewRange
	} from '$lib/content/find-dom';
	import FindBar from '$lib/components/note/FindBar.svelte';
	import FindMirror from '$lib/components/note/FindMirror.svelte';

	/**
	 * Find-in-note controller for an editor surface.
	 *
	 * It is a sibling overlay, not part of the editor state: it owns the query,
	 * the match list and the active index, listens for Ctrl/Cmd+F on the window,
	 * paints the preview through `find-dom`, and draws the textarea mirror over
	 * the real textarea by measuring its box and computed text metrics. The
	 * editor only supplies `view`, the body text / rendered html, and the refs.
	 */
	let {
		view,
		text,
		html = '',
		textarea,
		preview,
		open = $bindable(false),
		onopen
	}: {
		view: EditorView;
		text: string;
		/** Rendered preview html; a dependency because it renders asynchronously. */
		html?: string;
		textarea: HTMLTextAreaElement | null;
		preview: HTMLDivElement | undefined;
		open?: boolean;
		/** Fired when find is opened, so the editor can dismiss its popovers. */
		onopen?: () => void;
	} = $props();

	type Box = { left: number; top: number; width: number; height: number };

	let query = $state('');
	let caseSensitive = $state(false);
	let index = $state(0);
	let previewRanges = $state<Range[]>([]);
	let box = $state<Box | null>(null);
	let textStyle = $state('');
	let scrollTop = $state(0);
	let remeasure = $state(0);
	/** The query/case the current `index` belongs to, to know when to reset. */
	let lastQuery = '';
	let lastCase = false;

	const matches = $derived(findMatches(text, query, { caseSensitive }));
	const usingPreview = $derived(view === 'preview');
	const count = $derived(usingPreview ? previewRanges.length : matches.length);

	function measure() {
		const el = textarea;
		if (!el) {
			box = null;
			return;
		}
		box = {
			left: el.offsetLeft,
			top: el.offsetTop,
			width: el.offsetWidth,
			height: el.offsetHeight
		};
		const style = getComputedStyle(el);
		textStyle = [
			`font-family:${style.fontFamily}`,
			`font-size:${style.fontSize}`,
			`font-weight:${style.fontWeight}`,
			`line-height:${style.lineHeight}`,
			`letter-spacing:${style.letterSpacing}`,
			`padding:${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
			`text-align:${style.textAlign}`,
			`tab-size:${style.tabSize}`,
			'white-space:pre-wrap',
			'overflow-wrap:break-word',
			'color:var(--color-on-surface-variant)'
		].join(';');
	}

	/**
	 * Recomputes matches when the query, case, view, body, or rendered html
	 * changes. The active index is reset only for a new query; a body edit keeps
	 * the reader where they were (clamped) instead of jumping to the first hit.
	 */
	$effect(() => {
		void text;
		void html;
		void view;
		const q = query;
		const cs = caseSensitive;
		if (!open) {
			clearPreviewHighlights();
			previewRanges = [];
			return;
		}
		const fresh = q !== lastQuery || cs !== lastCase;
		lastQuery = q;
		lastCase = cs;
		const current = untrack(() => index);

		// The preview is highlighted in both the preview surface and the split
		// pane (where the textarea mirror is also drawn).
		if (preview && view !== 'write') {
			const next = collectPreviewMatches(preview, q, cs);
			previewRanges = next;
			index = fresh ? 0 : Math.min(current, Math.max(0, next.length - 1));
			paintPreviewMatches(next, index);
		} else {
			clearPreviewHighlights();
			previewRanges = [];
		}

		if (view === 'preview') return;

		if (!fresh) {
			index = Math.min(current, Math.max(0, matches.length - 1));
			return;
		}
		index = 0;
		if (matches.length && textarea) revealTextareaMatch(textarea, matches[0]);
	});

	/** Re-measures the textarea geometry and text metrics. */
	$effect(() => {
		void remeasure;
		void view;
		void text;
		void textarea;
		if (open) measure();
	});

	/** (Re)attaches the scroll + resize listeners whenever the textarea changes. */
	$effect(() => {
		const el = textarea;
		if (!el) return;
		const onScroll = () => (scrollTop = el.scrollTop);
		el.addEventListener('scroll', onScroll, { passive: true });
		const observer = new ResizeObserver(() => {
			if (untrack(() => open)) remeasure += 1;
		});
		observer.observe(el);
		const onResize = () => {
			if (untrack(() => open)) remeasure += 1;
		};
		window.addEventListener('resize', onResize);
		return () => {
			el.removeEventListener('scroll', onScroll);
			observer.disconnect();
			window.removeEventListener('resize', onResize);
		};
	});

	function openFind() {
		open = true;
		onopen?.();
		if (!query && textarea) {
			const selected = text.slice(textarea.selectionStart, textarea.selectionEnd);
			if (selected && !selected.includes('\n')) query = selected;
		}
	}

	function close() {
		open = false;
		query = '';
		previewRanges = [];
		index = 0;
		lastQuery = '';
		lastCase = false;
		clearPreviewHighlights();
	}

	function step(direction: 1 | -1) {
		if (view === 'preview') {
			if (!previewRanges.length || !preview) return;
			index = stepMatch(index, previewRanges.length, direction);
			paintPreviewMatches(previewRanges, index);
			scrollPreviewRange(preview, previewRanges[index]);
			return;
		}
		if (!matches.length || !textarea) return;
		index = stepMatch(index, matches.length, direction);
		revealTextareaMatch(textarea, matches[index]);
	}

	function onKeydown(event: KeyboardEvent) {
		if (
			(event.ctrlKey || event.metaKey) &&
			!event.altKey &&
			!event.shiftKey &&
			event.key.toLowerCase() === 'f'
		) {
			event.preventDefault();
			openFind();
			return;
		}
		if (open && event.key === 'Escape' && event.target === textarea) {
			event.preventDefault();
			close();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && view !== 'preview' && box}
	<div
		class="pointer-events-none absolute z-20 overflow-hidden"
		style="left:{box.left}px; top:{box.top}px; width:{box.width}px; height:{box.height}px"
	>
		<FindMirror text={text} {matches} activeIndex={index} style={textStyle} {scrollTop} />
	</div>
{/if}

<FindBar {open} bind:query bind:caseSensitive {count} activeIndex={index} onstep={step} onclose={close} />
