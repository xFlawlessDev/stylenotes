<script lang="ts">
	import { CircleArrowUp, RefreshCw, ScrollText, TriangleAlert } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { appInfo } from '$lib/app-info';
	import {
		checkNow,
		dismissUpdate,
		installPendingUpdate,
		updateStore,
	} from '$lib/stores/update.svelte';
	import ChangelogDialog from '$lib/components/workspace/ChangelogDialog.svelte';

	/**
	 * The update controls for Settings → About: version, "check for updates",
	 * an available-release banner with install + progress, and a door to the
	 * bundled changelog. State lives in `stores/update.svelte.ts` so the
	 * background sweep and this panel agree.
	 */
	let changelogOpen = $state(false);

	const release = $derived(updateStore.release);
	const showBanner = $derived(!!release && updateStore.dismissed !== release.version);
	/** Idle text only claims "up to date" after a check actually succeeded. */
	const upToDate = $derived(!updateStore.checking && !updateStore.error && !release);

	const percent = $derived.by(() => {
		const progress = updateStore.progress;
		if (!progress || !progress.total) return null;
		return Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
	});
</script>

<div class="flex flex-col gap-3">
	{#if updateStore.installing}
		<div class="flex flex-col gap-2 rounded-2xl bg-surface-container-lowest/30 p-3">
			<span class="text-body-md font-body text-on-surface">
				{updateStore.progress?.phase === 'installing'
					? t('settings.about.installing')
					: t('settings.about.downloading', { percent: percent ?? 0 })}
			</span>
			<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
				<div
					class="emphasis-primary h-full rounded-full transition-[width] duration-300"
					style="width: {updateStore.progress?.phase === 'installing' ? 100 : (percent ?? 8)}%"
				></div>
			</div>
		</div>
	{:else if showBanner}
		<div class="flex flex-col gap-2 rounded-2xl bg-primary-container/25 p-3">
			<div class="flex items-center gap-2">
				<CircleArrowUp size={16} class="text-primary" />
				<span class="text-body-md font-body text-on-surface">
					{t('settings.about.updateAvailable', { version: release?.version ?? '' })}
				</span>
			</div>
			{#if release?.date}
				<span class="text-label-sm font-label text-outline"
					>{t('settings.about.releasedOn', { date: release.date })}</span
				>
			{/if}
			<div class="flex flex-wrap gap-2">
				<Button variant="primary" size="md" onclick={() => void installPendingUpdate()}>
					{t('settings.about.installUpdate')}
				</Button>
				<Button variant="ghost" size="md" onclick={() => release && dismissUpdate(release.version)}>
					{t('settings.about.later')}
				</Button>
			</div>
		</div>
	{:else if updateStore.error}
		<div class="flex items-start gap-2 rounded-2xl bg-error-container/20 p-3">
			<TriangleAlert size={15} class="mt-0.5 shrink-0 text-error" />
			<span class="text-label-sm font-label leading-relaxed text-error">{updateStore.error}</span>
		</div>
	{:else if upToDate}
		<div class="glass-well flex items-center gap-2 rounded-2xl p-3">
			<CircleArrowUp size={15} class="text-tertiary" />
			<span class="text-body-sm font-body text-on-surface-variant">
				{t('settings.about.upToDate', { version: appInfo.version })}
			</span>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2">
		<Button
			variant="secondary"
			size="lg"
			shape="tile"
			block
			class="justify-center text-label-md"
			disabled={updateStore.checking || updateStore.installing}
			onclick={() => void checkNow()}
		>
			<RefreshCw size={15} class={updateStore.checking ? 'animate-spin' : ''} />
			{updateStore.checking ? t('settings.about.checking') : t('settings.about.checkUpdate')}
		</Button>
		<Button
			variant="secondary"
			size="lg"
			shape="tile"
			block
			class="justify-center text-label-md"
			onclick={() => (changelogOpen = true)}
		>
			<ScrollText size={15} /> {t('settings.about.viewChangelog')}
		</Button>
	</div>
</div>

<ChangelogDialog bind:open={changelogOpen} />
