<script lang="ts">
	import { page } from '$app/state';
	import { site } from '#lib/site.js';
	import Button from '#lib/components/base/button.svelte';
	import Seo from '#lib/components/site/Seo.svelte';
</script>

<Seo
	title={`Page not found — ${site.name}`}
	description="That page does not exist. Head back to the StyleNotes home page to read about the app or download it."
	path={page.url.pathname}
/>

<section class="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
	<p class="text-label-md text-outline">Error {page.status}</p>
	<h1 class="mt-2 text-headline-xl text-foreground">That page does not exist</h1>
	<p class="mt-3 max-w-md text-body-lg text-on-surface-variant">
		The link may be old, or the page may have moved. Everything else is one click away.
	</p>
	<div class="mt-7">
		<a href="/">
			<Button variant="primary" size="lg">Back to the home page</Button>
		</a>
	</div>
</section>
