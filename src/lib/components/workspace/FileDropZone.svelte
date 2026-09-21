<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import FileDrop from 'svelte-tauri-filedrop';
	import { getCurrentWebview } from '@tauri-apps/api/webview';
	import { isTauri } from '$lib/windows';

	let {
		onfiles,
		class: className = '',
		children,
	}: {
		onfiles: (paths: string[]) => void;
		class?: string;
		children: Snippet<[boolean]>;
	} = $props();

	let over = $state(false);
	let domOver = $state(false);
	let zoneEl = $state<HTMLElement>();

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

	function handleDomDrop(event: DragEvent) {
		event.preventDefault();
		domOver = false;
		const files = Array.from(event.dataTransfer?.files ?? []);
		const paths = files
			.map((file) => (file as File & { path?: string }).path ?? file.name)
			.filter(Boolean);
		if (paths.length) onfiles(paths);
	}
</script>

{#if isTauri}
	<FileDrop handleFiles={onfiles} class={className}>
		<div bind:this={zoneEl} class="contents">
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