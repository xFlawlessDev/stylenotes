<script lang="ts">
	import { History, RotateCcw } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, EmptyState } from '$lib/components/base';
	import { versioning } from '$lib/stores/versioning';
	import type { EntityVersion, VersionEntity } from '$lib/content/version-types';
	import { versionPreview } from '$lib/content/version-format';
	import { t } from '$lib/i18n/index.svelte';
	import { relativeTime } from '$lib/i18n/format';

	/**
	 * Local version history for one note or task. Loading happens when the
	 * dialog opens; restoring hands the payload back to the caller, which applies
	 * it through the normal save path (so it is itself versioned).
	 */
	let {
		open = $bindable(false),
		entity,
		entityId,
		onrestore
	}: {
		open?: boolean;
		entity: VersionEntity;
		entityId: string;
		onrestore: (version: EntityVersion) => void;
	} = $props();

	let versions = $state<EntityVersion[]>([]);
	let loading = $state(false);

	$effect(() => {
		if (!open) return;
		const id = entityId;
		let cancelled = false;
		loading = true;
		void (async () => {
			const list = await versioning.list(entity, id).catch(() => []);
			if (cancelled) return;
			versions = list;
			loading = false;
		})();
		return () => {
			cancelled = true;
		};
	});

	function restore(version: EntityVersion) {
		onrestore(version);
		open = false;
	}

	const reasonLabel: Record<string, string> = {
		auto: t('dialogs.history.reason.auto'),
		manual: t('dialogs.history.reason.manual'),
		'pre-mcp': t('dialogs.history.reason.preMcp'),
		close: t('dialogs.history.reason.close'),
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog w-[min(22rem,calc(100vw-2rem))]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-headline-sm font-headline text-on-surface">
				<History size={14} class="text-primary" /> {t('dialogs.history.title')}
			</Dialog.Title>
			<Dialog.Description class="text-body-sm font-body text-on-surface-variant">
				{t('dialogs.history.description')}
			</Dialog.Description>
		</Dialog.Header>

		<div class="scrollbar-none max-h-[min(18rem,45vh)] overflow-y-auto py-1">
			{#if loading}
				<p class="px-1 py-6 text-center text-body-sm font-body text-outline">{t('dialogs.history.loading')}</p>
			{:else if versions.length === 0}
				<EmptyState
					size="md"
					icon={History}
					heading={t('dialogs.history.emptyHeading')}
					title={t('dialogs.history.emptyTitle')}
				/>
			{:else}
				<ul class="flex flex-col gap-1">
					{#each versions as version (version.id)}
						<li
							class="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-container/50"
						>
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-label-sm font-label text-on-surface"
										>{relativeTime(version.updatedAt)}</span
									>
									<span class="rounded-sm bg-surface-container px-1.5 text-code-sm font-code text-outline">
										{reasonLabel[version.reason] ?? version.reason}
									</span>
								</div>
								<p class="truncate text-body-sm font-body text-on-surface-variant">
									{versionPreview(version.payload) || t('dialogs.history.empty')}
								</p>
							</div>
							<Button
								variant="secondary"
								size="xs"
								shape="pill"
								class="shrink-0 gap-1.5"
								onclick={() => restore(version)}
							>
								<RotateCcw size={12} /> {t('dialogs.history.restore')}
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
