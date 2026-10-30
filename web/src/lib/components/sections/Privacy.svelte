<script lang="ts">
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { site } from '#lib/site.js';

	const points = [
		{
			title: 'No account, ever',
			body: 'There is no sign-up, no login, and no server in the loop. The app opens and edits with no connection.'
		},
		{
			title: 'A file you own',
			body: 'Notes live in a SQLite database on your machine. Point a workspace at a folder and you also get a plain-Markdown mirror, exported and re-imported automatically.'
		},
		{
			title: 'Cloud is opt-in',
			body: 'Sync, a hosted AI gateway, and remote MCP access are separate, optional services. The app is cloud-ready but works completely offline without them.'
		}
	];
</script>

<section id="privacy" class="anchor-offset border-b border-border/60">
	<div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
		<div class="max-w-2xl">
			<h2 class="flex items-start gap-2.5 text-headline-lg text-foreground sm:text-headline-xl">
				<ShieldCheck class="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
				Your notes, your device
			</h2>
			<p class="mt-3 text-body-lg text-on-surface-variant">
				StyleNotes is local-first by design. Nothing is sent anywhere unless you explicitly
				turn on an optional cloud feature — and the source is public, so you can check that
				claim.
			</p>
			<a
				href="{site.repo}/blob/main/SECURITY.md"
				class="tap-target mt-2 inline-flex items-center text-label-md text-primary hover:underline"
				target="_blank"
				rel="noreferrer"
			>
				Read the security policy
			</a>
		</div>

		<dl class="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-3">
			{#each points as point (point.title)}
				<div class="border-t border-border/60 pt-4">
					<dt class="text-headline-sm text-foreground">{point.title}</dt>
					<dd class="mt-2 text-body-sm leading-relaxed text-on-surface-variant">
						{point.body}
					</dd>
				</div>
			{/each}
		</dl>
	</div>
</section>
