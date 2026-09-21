<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { hydrateSettings } from '$lib/stores/settings.svelte';
	import Tooltip from '$lib/components/ui/tooltip/tooltip-provider.svelte';

	const { children } = $props();

	onMount(() => {
		void hydrateSettings();
});
</script>

<Tooltip>
	{@render children()}
</Tooltip>