<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import {
		flushSettings,
		flushSettingsOnHide,
		hydrateSettings
	} from '$lib/stores/settings.svelte';
	import { registerQuitFlush } from '$lib/stores/quit-flush';
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
		// Persist pending settings when this window loses focus (hides) and when
		// the app quits: every window renders the layout, so every window keeps
		// the single settings row current. Without this a toggle made just before
		// a quick Quit would still be sitting in the debounce and be lost.
		const stopHideFlush = flushSettingsOnHide();
		void registerQuitFlush(() => flushSettings());

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
			stopHideFlush();
			if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
			if (timeoutId !== undefined) clearTimeout(timeoutId);
		};
	});
</script>

<Tooltip>
	{@render children()}
</Tooltip>
