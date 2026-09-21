<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { hydrateSettings } from '$lib/stores/settings.svelte';

	const { children } = $props();

	onMount(() => hydrateSettings());
</script>

{@render children()}