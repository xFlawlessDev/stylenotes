<script lang="ts">
	import { absoluteUrl, jsonLdTags } from '#lib/seo.js';
	import { site } from '#lib/site.js';

	type Props = {
		/** Unique, ≤ 60 characters, and descriptive on its own. */
		title: string;
		/** ~155 characters. Used verbatim for the meta and Open Graph tags. */
		description: string;
		/** Root-relative canonical path, e.g. `/download`. */
		path: string;
		/** Root-relative social image. Replace with a 1200×630 card. */
		image?: string;
		type?: 'website' | 'article';
		schema?: readonly unknown[];
	};

	let {
		title,
		description,
		path,
		image = '/screenshots/notes.webp',
		type = 'website',
		schema = []
	}: Props = $props();

	const canonical = $derived(absoluteUrl(path));
	const imageUrl = $derived(absoluteUrl(image));
	const tags = $derived(schema.length > 0 ? jsonLdTags(schema) : '');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

	<meta property="og:site_name" content={site.name} />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={imageUrl} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={imageUrl} />

	{@html tags}
</svelte:head>
