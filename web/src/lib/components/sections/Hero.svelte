<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import { platforms, site } from '#lib/site.js';
	import Button from '#lib/components/base/button.svelte';
	import GithubMark from '#lib/components/site/GithubMark.svelte';
</script>

<section class="border-b border-border/60 bg-surface-container-lowest/40">
	<div class="mx-auto w-full max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20 lg:pt-24">
		<div class="max-w-3xl">
			<h1 class="text-display-sm text-foreground sm:text-display-lg">
				A calm, private notebook for your ideas, lists, and drafts.
			</h1>

			<p class="mt-5 max-w-2xl text-body-lg text-on-surface-variant">
				Markdown notes, tasks, and a graph that connects them — a free desktop app that
				works entirely offline. No account, no internet required.
			</p>

			<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
				<a href="/download" class="sm:w-auto">
					<Button variant="primary" size="xl" block>
						<Download class="size-4" />
						Download for free
					</Button>
				</a>
				<a
					href={site.repo}
					class="tap-target inline-flex items-center justify-center gap-2 px-3 text-label-md text-on-surface-variant hover:text-primary sm:justify-start"
					target="_blank"
					rel="noreferrer"
				>
					<GithubMark class="size-4" />
					View source
				</a>
			</div>

			<p class="mt-6 text-label-md text-outline">
				{#each platforms as platform, index (platform.id)}
					{#if index > 0}<span aria-hidden="true"> · </span>{/if}
					{platform.label}
				{/each}
				<span aria-hidden="true"> · </span>{site.license}
			</p>
		</div>

		<!--
			The hero screenshot is the LCP element, so it is eager, high priority,
			and has explicit dimensions: without width/height the browser cannot
			reserve space and the page shifts as the image decodes (a CLS penalty).
		-->
		<figure class="mt-10 max-w-5xl sm:mt-14">
			<div class="overflow-hidden rounded-xl border border-border glass-solid">
				<img
					src="/screenshots/notes.webp"
					alt="The StyleNotes workspace: a folder rail, a note feed, and a rendered Markdown note"
					width="1600"
					height="1025"
					fetchpriority="high"
					decoding="async"
					class="block h-auto w-full"
				/>
			</div>
			<figcaption class="mt-3 text-label-md text-outline">
				The workspace: folders, notes, and a live Markdown preview.
			</figcaption>
		</figure>
	</div>
</section>
