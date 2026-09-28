<script lang="ts">
	import { History, RotateCcw } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, EmptyState } from '$lib/components/base';
	import { versioning } from '$lib/stores/versioning';
	import type { EntityVersion, VersionEntity } from '$lib/content/version-types';
	import { formatRelative, versionPreview } from '$lib/content/version-format';

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
		auto: 'Auto',
		manual: 'Manual',
		'pre-mcp': 'Before AI',
		close: 'On close',
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog w-[min(22rem,calc(100vw-2rem))]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-headline-sm font-headline text-on-surface">
				<History size={14} class="text-primary" /> Version history
			</Dialog.Title>
			<Dialog.Description class="text-body-sm font-body text-on-surface-variant">
				Local snapshots taken as you edit. Restoring keeps the current text as a new version.
			</Dialog.Description>
		</Dialog.Header>

		<div class="scrollbar-none max-h-[min(18rem,45vh)] overflow-y-auto py-1">
			{#if loading}
				<p class="px-1 py-6 text-center text-body-sm font-body text-outline">Loading…</p>
			{:else if versions.length === 0}
				<EmptyState
					size="md"
					icon={History}
					heading="No versions yet"
					title="Versions appear here after you edit for a while."
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
										>{formatRelative(version.updatedAt)}</span
									>
									<span class="rounded-sm bg-surface-container px-1.5 text-code-sm font-code text-outline">
										{reasonLabel[version.reason] ?? version.reason}
									</span>
								</div>
								<p class="truncate text-body-sm font-body text-on-surface-variant">
									{versionPreview(version.payload) || 'Empty'}
								</p>
							</div>
							<Button
								variant="secondary"
								size="xs"
								shape="pill"
								class="shrink-0 gap-1.5"
								onclick={() => restore(version)}
							>
								<RotateCcw size={12} /> Restore
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
