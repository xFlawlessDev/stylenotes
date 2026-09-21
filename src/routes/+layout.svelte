<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';

	const { children } = $props();

	onMount(() => {
		document.documentElement.classList.add('dark');
	});
</script>

{@render children()}