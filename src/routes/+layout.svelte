<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { hydrateSettings } from '$lib/stores/settings.svelte';
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

		if (!isTauri) return;
		let disposed = false;
		let unlisten: (() => void) | null = null;

		/* every window renders its own plugin stylesheet, so keep them in sync */
		void listen<UiPlugin[]>(UI_PLUGINS_CHANGED, (event) =>
			applyUiPluginsSnapshot(event.payload)
		).then((fn) => {
			if (disposed) fn();
			else unlisten = fn;
		});

		return () => {
			disposed = true;
			unlisten?.();
		};
	});
</script>

<Tooltip>
	{@render children()}
</Tooltip>
