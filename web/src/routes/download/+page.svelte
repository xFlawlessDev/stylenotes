<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Download from '@lucide/svelte/icons/download';
	import { site } from '#lib/site.js';
	import Button from '#lib/components/base/button.svelte';
	import Seo from '#lib/components/site/Seo.svelte';

	let { data } = $props();

	const release = $derived(data.release);

	/** Bytes as a short, human string — "4.2 MB" answers "is this a big download?". */
	function fileSize(bytes: number): string {
		if (!bytes) return '';
		const mb = bytes / 1_048_576;
		return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
	}

	/** The installer that matches a platform, for its version/size line. */
	function assetFor(id: string) {
		return release?.assets.find((asset) => {
			const name = asset.name.toLowerCase();
			if (id === 'windows') return name.endsWith('.msi') || name.endsWith('.exe');
			if (id === 'macos') return name.endsWith('.dmg');
			return name.endsWith('.appimage');
		});
	}

	const published = $derived(
		release?.publishedAt
			? new Date(release.publishedAt).toLocaleDateString('en', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: ''
	);

	const included = [
		'The full desktop app, with no feature gating',
		'Offline by default — no account, no sign-in',
		'Signed update metadata for in-app updates',
		'Plain-Markdown export whenever you want it'
	];
</script>

<Seo
	title="Download StyleNotes for Windows, macOS and Linux"
	description="Download the free StyleNotes desktop app. Windows x64, macOS on Apple silicon, and Linux — offline by default, no account required, AGPL-3.0 open source."
	path="/download"
/>

<section class="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
	<div class="max-w-2xl">
		<h1 class="text-headline-lg text-foreground sm:text-headline-xl">Download StyleNotes</h1>
		<p class="mt-3 text-body-lg text-on-surface-variant">
			Free and open source. Each link always points at the newest release.
		</p>
		{#if release}
			<p class="mt-2 text-label-md text-outline">
				Latest: {release.name || release.tag}
				{#if published}<span aria-hidden="true"> · </span>{published}{/if}
			</p>
		{/if}
	</div>

	<ul class="mt-8 grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-3">
		{#each data.platforms as entry (entry.id)}
			{@const asset = assetFor(entry.id)}
			{@const isSuggested = data.suggested === entry.id}
			<li class="flex flex-col bg-background p-5">
				{#if isSuggested}
					<p class="mb-1.5 text-label-sm text-primary">Detected on this device</p>
				{/if}
				<h2 class="text-headline-sm text-foreground">{entry.label}</h2>
				<p class="mt-1 text-label-md text-on-surface-variant">{entry.detail}</p>
				<p class="mt-1 text-label-sm text-outline">
					{#if asset}{fileSize(asset.size)}{:else}&nbsp;{/if}
				</p>
				<div class="mt-4">
					<a href="/download/{entry.id}" class="block">
						<Button variant={isSuggested ? 'primary' : 'outline'} size="lg" block>
							<Download class="size-4" />
							Download
						</Button>
					</a>
				</div>
			</li>
		{/each}
	</ul>

	<div class="mt-10 grid gap-8 sm:grid-cols-2 sm:gap-12">
		<div>
			<h2 class="text-headline-sm text-foreground">What you get</h2>
			<ul class="mt-3 grid gap-2 text-body-sm text-on-surface-variant">
				{#each included as item (item)}
					<li class="flex gap-2">
						<Check class="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
						{item}
					</li>
				{/each}
			</ul>
		</div>

		<div>
			<h2 class="text-headline-sm text-foreground">Before you install</h2>
			<p class="mt-3 text-body-sm leading-relaxed text-on-surface-variant">
				Builds are currently unsigned, so macOS shows a Gatekeeper warning and Windows a
				SmartScreen prompt on first launch. The source is public if you would rather build
				it yourself.
			</p>
			<a
				href="{site.repo}/blob/main/CONTRIBUTING.md"
				class="tap-target mt-1 inline-flex items-center text-label-md text-primary hover:underline"
				target="_blank"
				rel="noreferrer"
			>
				Build from source
			</a>
		</div>
	</div>

	<p class="mt-8 text-body-sm text-on-surface-variant">
		Looking for an older version? Every build is on the
		<a href={site.releases} class="text-primary hover:underline" target="_blank" rel="noreferrer"
			>releases page</a
		>.
	</p>
</section>
