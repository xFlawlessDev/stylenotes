<script lang="ts">
	import { faq } from '#lib/content/features.js';
</script>

<section id="faq" class="anchor-offset border-b border-border/60">
	<div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
		<div class="grid gap-8 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
			<h2 class="text-headline-lg text-foreground sm:text-headline-xl">Questions</h2>

			<div class="divide-y divide-border/60 border-y border-border/60">
				{#each faq as item (item.question)}
					<!--
						<details> is the accessible, JS-free disclosure: it works before
						hydration, is keyboard-operable, and search engines see the answer
						text in the HTML.
					-->
					<details class="group">
						<summary
							class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-headline-sm text-foreground"
						>
							{item.question}
							<span
								class="grid size-6 shrink-0 place-items-center rounded-md border border-border text-on-surface-variant transition-transform group-open:rotate-45"
								aria-hidden="true"
							>
								<svg viewBox="0 0 12 12" class="size-3" fill="none" stroke="currentColor">
									<path d="M6 2v8M2 6h8" stroke-width="1.5" stroke-linecap="round" />
								</svg>
							</span>
						</summary>
						<p class="pb-4 text-body-md leading-relaxed text-on-surface-variant">
							{item.answer}
						</p>
					</details>
				{/each}
			</div>
		</div>
	</div>
</section>
