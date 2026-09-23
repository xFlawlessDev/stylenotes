<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { hydrateSettings } from '$lib/stores/settings.svelte';
	import { prewarmNoteRenderer } from '$lib/content/note-actions';
	import { prewarmMermaid } from '$lib/content/mermaid-preview';
	import {
		applyUiPluginsSnapshot,
		hydrateUiPlugins,
		UI_PLUGINS_CHANGED,
		type UiPlugin,
	} from '$lib/stores/ui-plugins.svelte';
	import { isTauri } from '$lib/windows';
	import Tooltip from '$lib/components/ui/tooltip/tooltip-provider.svelte';

	const { children } = $props();

	onMount(() => {
		void hydrateSettings();
		void hydrateUiPlugins();

		let idleId: number | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const warmRenderers = () => {
			void Promise.all([prewarmNoteRenderer(), prewarmMermaid()]).catch(() => undefined);
		};
		const idleWindow = window as Window & {
			requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
			cancelIdleCallback?: (handle: number) => void;
		};
		if (idleWindow.requestIdleCallback) {
			idleId = idleWindow.requestIdleCallback(warmRenderers, { timeout: 2500 });
		} else {
			timeoutId = setTimeout(warmRenderers, 500);
		}

		let disposed = false;
		let unlisten: (() => void) | null = null;

		if (isTauri) {
			/* every window renders its own plugin stylesheet, so keep them in sync */
			void listen<UiPlugin[]>(UI_PLUGINS_CHANGED, (event) =>
				applyUiPluginsSnapshot(event.payload)
			).then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			});
		}

		return () => {
			disposed = true;
			unlisten?.();
			if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
			if (timeoutId !== undefined) clearTimeout(timeoutId);
		};
	});
</script>

<Tooltip>
	{@render children()}
</Tooltip>
