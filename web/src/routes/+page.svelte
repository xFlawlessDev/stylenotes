<script lang="ts">
	import { faq } from '#lib/content/features.js';
	import { faqSchema, softwareApplicationSchema } from '#lib/seo.js';
	import { site } from '#lib/site.js';
	import Seo from '#lib/components/site/Seo.svelte';
	import Hero from '#lib/components/sections/Hero.svelte';
	import Features from '#lib/components/sections/Features.svelte';
	import Gallery from '#lib/components/sections/Gallery.svelte';
	import Mcp from '#lib/components/sections/Mcp.svelte';
	import Privacy from '#lib/components/sections/Privacy.svelte';
	import Faq from '#lib/components/sections/Faq.svelte';
	import CallToAction from '#lib/components/sections/CallToAction.svelte';

	const schema = [softwareApplicationSchema(), faqSchema(faq)];
</script>

<Seo
	title={site.title}
	description={site.description}
	path="/"
	schema={schema}
/>

<Hero />
<Features />
<Gallery />
<Mcp />
<Privacy />
<Faq />
<CallToAction />
