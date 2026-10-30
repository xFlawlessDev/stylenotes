<script lang="ts">
	import { site } from '#lib/site.js';
	import GithubMark from './GithubMark.svelte';

	const year = new Date().getFullYear();
</script>

<footer class="border-t border-border/60">
	<div class="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
		<div class="flex flex-col gap-8 sm:flex-row sm:justify-between">
			<div class="max-w-sm">
				<div class="flex items-center gap-2.5">
					<img src="/favicon.png" alt="" width="32" height="32" class="size-7 rounded-md" />
					<span class="text-headline-sm">{site.name}</span>
				</div>
				<p class="mt-3 text-body-sm text-on-surface-variant">
					A calm, private notebook for your ideas, lists, and drafts. Local-first, open
					source, and yours.
				</p>
			</div>

			<nav class="flex gap-12 text-body-sm" aria-label="Footer">
				<div class="flex flex-col">
					<a
						href="/#features"
						class="tap-target flex items-center text-on-surface-variant hover:text-on-surface"
						>Features</a
					>
					<a
						href="/download"
						class="tap-target flex items-center text-on-surface-variant hover:text-on-surface"
						>Download</a
					>
					<a
						href="/#faq"
						class="tap-target flex items-center text-on-surface-variant hover:text-on-surface"
						>FAQ</a
					>
				</div>
				<div class="flex flex-col">
					<a
						href={site.repo}
						class="tap-target flex items-center text-on-surface-variant hover:text-on-surface"
						>Source</a
					>
					<a
						href={site.releases}
						class="tap-target flex items-center text-on-surface-variant hover:text-on-surface"
						>Releases</a
					>
					<a
						href="{site.repo}/blob/main/LICENSE"
						class="tap-target flex items-center text-on-surface-variant hover:text-on-surface"
						>License</a
					>
				</div>
			</nav>
		</div>

		<div
			class="mt-8 flex flex-col gap-2 border-t border-border/60 pt-6 text-label-sm text-outline sm:flex-row sm:items-center sm:justify-between"
		>
			<p>© {year} {site.name}. Free software under the {site.license}.</p>
			<a
				href={site.repo}
				class="inline-flex items-center gap-1.5 hover:text-on-surface-variant"
				target="_blank"
				rel="noreferrer"
			>
				<GithubMark class="size-3.5" />
				{site.author}
			</a>
		</div>
	</div>
</footer>
