<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import FileDrop from 'svelte-tauri-filedrop';
	import { getCurrentWebview } from '@tauri-apps/api/webview';
	import { isTauri } from '$lib/windows';
	import {
		importAttachments,
		importAttachmentBytes,
		storedAttachmentsMarkdown
	} from '$lib/content/attachment-actions';

	/**
	 * Drop/paste surface for note attachments.
	 *
	 * Since docs/design/artifacts.md, files are copied into the local artifact
	 * store (`attachment_import`) and the editor receives portable
	 * `stylenotes-attachment://…` markdown — never the original absolute path.
	 * Images pasted from the clipboard take the same route, via their bytes.
	 *
	 * The parent owns the markdown insertion; this component only turns dropped
	 * files and pasted blobs into markdown.
	 */
	let {
		onmarkdown,
		class: className = '',
		children,
	}: {
		onmarkdown: (markdown: string) => void;
		class?: string;
		children: Snippet<[boolean]>;
	} = $props();

	let over = $state(false);
	let domOver = $state(false);
	let zoneEl = $state<HTMLElement>();
	/** Serialises imports so two quick drops cannot interleave their insertion. */
	let busy = false;
	let pending: Promise<void> = Promise.resolve();

	// The library tracks hover with elementFromPoint using physical pixels,
	// which is wrong on scaled displays. Track hover here with devicePixelRatio
	// applied, and leave path filtering/handling to the library.
	onMount(() => {
		if (!isTauri) return;
		let cancelled = false;
		let unlisten: (() => void) | undefined;

		void getCurrentWebview()
			.onDragDropEvent((event) => {
				const payload = event.payload;
				if (payload.type === 'leave' || payload.type === 'drop') {
					over = false;
					return;
				}
				const scale = window.devicePixelRatio || 1;
				const el = document.elementFromPoint(payload.position.x / scale, payload.position.y / scale);
				over = !!zoneEl && !!el && (el === zoneEl || zoneEl.contains(el));
			})
			.then((fn) => {
				if (cancelled) fn();
				else unlisten = fn;
			});

		return () => {
			cancelled = true;
			unlisten?.();
		};
	});

	function enqueue(work: () => Promise<void>) {
		pending = pending.then(async () => {
			if (busy) return;
			busy = true;
			try {
				await work();
			} finally {
				busy = false;
			}
		});
	}

	async function attachPaths(paths: string[]) {
		if (!paths.length) return;
		const stored = await importAttachments(paths);
		if (stored.length) onmarkdown(storedAttachmentsMarkdown(stored));
	}

	function handleDomDrop(event: DragEvent) {
		event.preventDefault();
		domOver = false;
		const files = Array.from(event.dataTransfer?.files ?? []);
		const paths = files
			.map((file) => (file as File & { path?: string }).path ?? '')
			.filter(Boolean);
		if (paths.length) enqueue(() => attachPaths(paths));
	}

	/**
	 * Attaches image data pasted from the clipboard. Plain-text paste is left
	 * untouched so the textarea keeps its default behaviour: only a clipboard
	 * payload that carries a file is consumed.
	 */
	async function handlePaste(event: ClipboardEvent) {
		if (!isTauri) return;
		const items = Array.from(event.clipboardData?.items ?? []);
		const files = items
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);
		if (!files.length) return;
		event.preventDefault();
		enqueue(async () => {
			const markdowns: string[] = [];
			for (const file of files) {
				const bytes = new Uint8Array(await file.arrayBuffer());
				const stored = await importAttachmentBytes(bytes, file.name || 'pasted-image.png');
				if (stored) markdowns.push(storedAttachmentsMarkdown([stored]));
			}
			if (markdowns.length) onmarkdown(markdowns.join('\n'));
		});
	}
</script>

{#if isTauri}
	<FileDrop handleFiles={(paths) => enqueue(() => attachPaths(paths))} class={className}>
		<div bind:this={zoneEl} class="contents" onpaste={handlePaste}>
			{@render children(over)}
		</div>
	</FileDrop>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class={className}
		ondragover={(event) => {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
			domOver = true;
		}}
		ondragleave={() => (domOver = false)}
		ondrop={handleDomDrop}
	>
		{@render children(domOver)}
	</div>
{/if}
