<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { onMount } from 'svelte';
	import Button from '#lib/components/base/button.svelte';

	/**
	 * The theme key and its shape match the desktop app (`app.html` reads
	 * `{ mode }`), so a person who uses both sees the same preference.
	 */
	const STORAGE_KEY = 'stylenotes.theme.v1';

	let mode = $state<'dark' | 'light'>('dark');

	onMount(() => {
		mode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
	});

	function toggle() {
		mode = mode === 'dark' ? 'light' : 'dark';
		const root = document.documentElement;
		root.classList.toggle('light', mode === 'light');
		root.classList.toggle('dark', mode === 'dark');

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
		} catch {
			/* a blocked storage API must not break the toggle */
		}
	}
</script>

<Button
	variant="ghost"
	size="icon-lg"
	shape="pill"
	onclick={toggle}
	aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title={mode === 'dark' ? 'Light theme' : 'Dark theme'}
>
	{#if mode === 'dark'}
		<Sun class="size-4" />
	{:else}
		<Moon class="size-4" />
	{/if}
</Button>
