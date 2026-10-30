<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import { site } from '#lib/site.js';
	import Button from '#lib/components/base/button.svelte';
</script>

<section class="bg-surface-container-lowest/40">
	<div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
		<div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
			<div class="max-w-xl">
				<h2 class="text-headline-lg text-foreground sm:text-headline-xl">
					Write it down. Keep it yours.
				</h2>
				<p class="mt-3 text-body-lg text-on-surface-variant">
					Free, open source, and offline by default. Download once and it is yours.
				</p>
			</div>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<a href="/download" class="sm:w-auto">
					<Button variant="primary" size="xl" block>
						<Download class="size-4" />
						Download StyleNotes
					</Button>
				</a>
				<a
					href={site.latestRelease}
					class="tap-target inline-flex items-center justify-center px-3 text-label-md text-on-surface-variant hover:text-primary"
					target="_blank"
					rel="noreferrer"
				>
					All releases
				</a>
			</div>
		</div>
	</div>
</section>
