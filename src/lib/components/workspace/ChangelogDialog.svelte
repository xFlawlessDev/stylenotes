<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, EmptyState } from '$lib/components/base';
	import { ScrollText } from '@lucide/svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { releasedChangelog } from '$lib/content/changelog';

	/**
	 * The release history bundled at build time from `CHANGELOG.md`
	 * (`bun run release` appends to that file). It is read-only and offline, so
	 * the About section can always show what changed without a network call.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	const entries = releasedChangelog;
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog max-w-xl">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-secondary"
			>
				<ScrollText size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface"
				>{t('settings.about.changelogTitle')}</Dialog.Title
			>
			<Dialog.Description>{t('settings.about.changelogHint')}</Dialog.Description>
		</Dialog.Header>

		<div class="scrollbar-none flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
			{#if entries.length === 0}
				<EmptyState icon={ScrollText} title={t('settings.about.changelogEmpty')} />
			{/if}

			{#each entries as entry (entry.version)}
				<div class="flex flex-col gap-2">
					<div class="flex items-baseline justify-between gap-2">
						<span class="text-headline-sm font-headline text-on-surface">
							{t('settings.about.changelogVersion', { version: entry.version })}
						</span>
						{#if entry.date}
							<span class="text-code-sm font-code text-outline">{entry.date}</span>
						{/if}
					</div>

					{#each entry.sections as section (section.title)}
						<div class="flex flex-col gap-1 rounded-2xl bg-surface-container-lowest/30 p-3">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>{section.title}</span
							>
							<ul class="flex flex-col gap-1.5">
								{#each section.items as item, index (index)}
									<li class="flex gap-2 text-body-sm font-body text-on-surface-variant">
										<span class="mt-1.5 size-1 shrink-0 rounded-full bg-outline"></span>
										<span class="leading-snug">{item}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/each}
		</div>

		<Dialog.Footer
			class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
		>
			<Button variant="primary" onclick={() => (open = false)}>
				{t('settings.about.changelogClose')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
