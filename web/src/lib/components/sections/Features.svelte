<script lang="ts">
	import AppWindow from '@lucide/svelte/icons/app-window';
	import FileText from '@lucide/svelte/icons/file-text';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Network from '@lucide/svelte/icons/network';
	import Palette from '@lucide/svelte/icons/palette';
	import Plug from '@lucide/svelte/icons/plug';
	import Search from '@lucide/svelte/icons/search';
	import { features } from '#lib/content/features.js';

	/** Icons are components, not strings, so they cannot live in the data module. */
	const icons = {
		'file-text': FileText,
		'list-checks': ListChecks,
		network: Network,
		search: Search,
		'app-window': AppWindow,
		keyboard: Keyboard,
		palette: Palette,
		plug: Plug
	} as const;

	/*
		Two tiers, because the features are not equal. Notes, tasks and the graph
		are the product; the rest are conveniences. Eight identical cards would
		say all eight matter the same amount, which is false.
	*/
	const primary = features.slice(0, 3);
	const supporting = features.slice(3);
</script>

<section id="features" class="anchor-offset border-b border-border/60">
	<div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
		<div class="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
			<div>
				<h2 class="text-headline-lg text-foreground sm:text-headline-xl">
					Everything you write down, in one local place
				</h2>
				<p class="mt-3 text-body-lg text-on-surface-variant">
					StyleNotes keeps notes and commitments together, in plain files you can read
					without it.
				</p>
			</div>

			<ul class="divide-y divide-border/60 border-y border-border/60">
				{#each primary as feature (feature.title)}
					{@const Icon = icons[feature.icon]}
					<li class="grid grid-cols-[auto_1fr] gap-x-4 py-5">
						<Icon class="mt-0.5 size-4 text-primary" aria-hidden="true" />
						<div>
							<h3 class="text-headline-sm text-foreground">{feature.title}</h3>
							<p class="mt-1.5 text-body-md leading-relaxed text-on-surface-variant">
								{feature.body}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-14 border-t border-border/60 pt-8 sm:mt-16">
			<h3 class="text-label-md text-outline">Also in the app</h3>			<ul class="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each supporting as feature (feature.title)}
					{@const Icon = icons[feature.icon]}
					<li class="grid grid-cols-[auto_1fr] gap-x-3">
						<Icon class="mt-0.5 size-3.5 text-on-surface-variant" aria-hidden="true" />
						<div>
							<h4 class="text-body-md font-medium text-foreground">{feature.title}</h4>
							<p class="mt-1 text-body-sm leading-relaxed text-on-surface-variant">
								{feature.body}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</section>
