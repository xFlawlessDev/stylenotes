<script lang="ts">
	import '../app.css';
	import Footer from '#lib/components/site/Footer.svelte';
	import Header from '#lib/components/site/Header.svelte';

	let { children } = $props();
</script>

<a
	href="#main"
	class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface-container-high focus:px-3 focus:py-2 focus:text-body-sm"
>
	Skip to content
</a>

<div class="flex min-h-dvh flex-col">
	<Header />
	<main id="main" class="flex-1">
		{@render children()}
	</main>
	<Footer />
</div>
