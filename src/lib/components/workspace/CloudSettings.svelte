<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Field, Input } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		checkCloudConnection,
		cloudStore,
		disconnectCloud,
		hydrateCloud,
		setCloudBaseUrl,
	} from '$lib/stores/cloud.svelte';

	/**
	 * Cloud settings (docs/design/cloud-sync-ai-mcp.md). The cloud is off until a
	 * server URL is set, so by default the app looks (and is) fully offline. The
	 * business logic lives behind the server; this page only configures the seam.
	 */
	let draft = $state('');

	onMount(() => {
		void hydrateCloud().then(() => {
			draft = cloudStore.config.baseUrl;
		});
	});

	function connect(): void {
		void setCloudBaseUrl(draft);
	}

	function disconnect(): void {
		draft = '';
		void disconnectCloud();
	}
</script>

<div class="flex min-w-0 flex-col gap-6">
	<Field label={t('settings.cloud.title')} class="gap-2.5">
		<div class="flex flex-col gap-0.5">
			<span class="text-body-md font-body text-on-surface">{t('settings.cloud.lede')}</span>
			<span class="text-label-sm font-label text-outline">{t('settings.cloud.hint')}</span>
		</div>
	</Field>

	<Field label={t('settings.cloud.serverUrl')} class="gap-2.5">
		<div class="flex items-center gap-2">
			<Input
				bind:value={draft}
				placeholder="https://api.stylenotes.app"
				aria-label={t('settings.cloud.serverUrl')}
				onkeydown={(event) => {
					if (event.key === 'Enter') connect();
				}}
			/>
			<Button variant="tonal" onclick={connect}>{t('settings.cloud.connect')}</Button>
		</div>
		<span class="text-label-sm font-label text-outline">{t('settings.cloud.serverUrlHint')}</span>
	</Field>

	{#if cloudStore.error}
		<span class="text-label-sm font-label text-error">{cloudStore.error}</span>
	{/if}

	{#if cloudStore.config.baseUrl}
		<div class="flex flex-col gap-2.5">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">
				{t('settings.cloud.status')}
			</span>
			<div class="glass-well flex flex-col gap-1 rounded-2xl p-3">
				<span class="text-body-md font-body text-on-surface">
					{cloudStore.status.reachable
						? t('settings.cloud.reachable')
						: t('settings.cloud.unreachable')}
				</span>
				<span class="text-label-sm font-label text-outline">
					{cloudStore.status.signedIn
						? t('settings.cloud.signedInAs', { account: cloudStore.status.account })
						: t('settings.cloud.notSignedIn')}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="ghost" disabled={cloudStore.probing} onclick={() => void checkCloudConnection()}>
					{t('settings.cloud.check')}
				</Button>
				<Button variant="ghost" onclick={disconnect}>{t('settings.cloud.disconnect')}</Button>
			</div>
		</div>
	{/if}

	<div class="rounded-2xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40">
		<span class="text-label-sm font-label text-outline">{t('settings.cloud.newNote')}</span>
		<p class="mt-1 text-body-md font-body text-on-surface">{t('settings.cloud.newNoteBody')}</p>
	</div>
</div>
