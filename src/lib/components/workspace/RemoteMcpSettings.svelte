<script lang="ts">
	import { onMount } from 'svelte';
	import { Copy, Globe, RefreshCw, ShieldAlert, TriangleAlert } from '@lucide/svelte';
	import { Button, Field, SegmentedControl, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { RemoteMcpMode } from '$lib/db/remote-mcp';
	import {
		changeRemoteMode,
		disableRemoteMcp,
		enableRemoteMcp,
		forgetToken,
		hydrateRemoteMcp,
		remoteMcpStore,
		rotateRemoteToken
	} from '$lib/stores/remote-mcp.svelte';

	/**
	 * Remote MCP settings (docs/design/constella-features.md #D12).
	 *
	 * Three exposure tiers, loopback by default. LAN is opt-in and shows an
	 * explicit warning before it is enabled, because it widens the trust boundary
	 * from "this machine" to "this network plus the token". The token is shown
	 * once; only its hash is stored.
	 */
	let confirmLan = $state(false);
	let copied = $state(false);
	/** The endpoint address whose copy button was just pressed. */
	let copiedUrl = $state<string | null>(null);

	onMount(() => void hydrateRemoteMcp());

	const mode = $derived(remoteMcpStore.mode);
	const token = $derived(remoteMcpStore.token);

	const modeItems = [
		{ id: 'local', label: t('settings.mcp.remote.mode.local') },
		{ id: 'lan', label: t('settings.mcp.remote.mode.lan') },
		{ id: 'tunnel', label: t('settings.mcp.remote.mode.tunnel') }
	];

	async function onToggle(enabled: boolean) {
		if (!enabled) {
			await disableRemoteMcp();
			return;
		}
		if (mode === 'lan') {
			confirmLan = true;
			return;
		}
		await enableRemoteMcp(mode);
	}

	async function onMode(next: string) {
		const parsed = (next === 'lan' || next === 'tunnel' ? next : 'local') as RemoteMcpMode;
		// A mode change restarts the listener; ignore input while one is already
		// in flight so two restarts cannot race the fixed port.
		if (parsed === mode || remoteMcpStore.busy) return;
		if (parsed === 'lan' && !remoteMcpStore.enabled) {
			remoteMcpStore.mode = parsed;
			confirmLan = true;
			return;
		}
		await changeRemoteMode(parsed);
	}

	async function copyToken() {
		if (!token) return;
		try {
			await navigator.clipboard.writeText(token);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard denied: the token is still on screen to copy by hand */
		}
	}

	async function copyAddress(address: string) {
		const url = `${address}/mcp`;
		try {
			await navigator.clipboard.writeText(url);
			copiedUrl = address;
			setTimeout(() => (copiedUrl = null), 1500);
		} catch {
			/* clipboard denied: the URL is still on screen to copy by hand */
		}
	}
</script>

<div class="flex flex-col gap-4 rounded-2xl p-3 ring-1 ring-inset ring-outline-variant/40">
	<div class="flex items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-0.5">
			<span class="flex items-center gap-1.5 text-body-md font-body text-on-surface">
				<Globe size={14} /> {t('settings.mcp.remote.title')}
			</span>
			<span class="text-label-sm font-label text-outline">
				{t('settings.mcp.remote.hint')}
			</span>
		</div>
		<Switch
			checked={remoteMcpStore.enabled}
			label={t('settings.mcp.remote.title')}
			disabled={remoteMcpStore.busy}
			onchange={onToggle}
		/>
	</div>

	<SegmentedControl
		value={mode}
		items={modeItems}
		ariaLabel={t('settings.mcp.remote.exposure')}
		disabled={remoteMcpStore.busy}
		onchange={onMode}
	/>

	{#if mode === 'lan'}
		<div class="flex items-start gap-2 rounded-xl bg-error-container/20 p-2.5">
			<ShieldAlert size={14} class="mt-0.5 shrink-0 text-error" />
			<span class="text-label-sm font-label text-error">
				{t('settings.mcp.remote.lanWarning')}
			</span>
		</div>
	{:else if mode === 'tunnel'}
		<span class="text-label-sm font-label text-outline">
			{t('settings.mcp.remote.tunnelHint')}
		</span>
	{/if}

	{#if remoteMcpStore.error}
		<span class="text-label-sm font-label text-error">{remoteMcpStore.error}</span>
	{/if}

	{#if remoteMcpStore.enabled}
		{#if remoteMcpStore.addresses.length}
			<div class="flex flex-col gap-0.5">
				<span class="text-label-sm font-label text-outline">
					{t('settings.mcp.remote.address')}
				</span>
				{#each remoteMcpStore.addresses as address (address)}
					<div class="flex items-center gap-2">
						<code class="min-w-0 flex-1 truncate rounded bg-surface-container-lowest/60 px-2 py-1 text-label-sm"
							>{address}/mcp</code
						>
						<Button
							variant="secondary"
							size="sm"
							onclick={() => void copyAddress(address)}
						>
							<Copy size={13} />
							{copiedUrl === address
								? t('settings.mcp.copied')
								: t('settings.mcp.remote.copyUrl')}
						</Button>
					</div>
				{/each}
			</div>
		{/if}

		{#if token}
			<Field label={t('settings.mcp.remote.token')} class="gap-2">
				<div class="flex items-center gap-2">
					<code class="min-w-0 flex-1 truncate rounded bg-surface-container-lowest/60 px-2 py-1 text-label-sm"
						>{token}</code
					>
					<Button variant="secondary" size="sm" onclick={copyToken}>
						<Copy size={13} /> {copied ? t('settings.mcp.copied') : t('settings.mcp.remote.copy')}
					</Button>
					<Button variant="ghost" size="sm" onclick={forgetToken}>
						{t('settings.mcp.remote.hide')}
					</Button>
				</div>
				<span class="text-label-sm font-label text-tertiary">
					{t('settings.mcp.remote.tokenOnce')}
				</span>
			</Field>
		{:else if remoteMcpStore.tokenHint}
			<span class="text-label-sm font-label text-outline">
				{t('settings.mcp.remote.tokenHint', { hint: remoteMcpStore.tokenHint })}
			</span>
		{/if}

		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={remoteMcpStore.busy}
				onclick={rotateRemoteToken}
			>
				<RefreshCw size={13} /> {t('settings.mcp.remote.rotate')}
			</Button>
		</div>
	{/if}
</div>

{#if confirmLan}
	<div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
		<button
			class="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
			aria-label={t('settings.mcp.remote.cancel')}
			onclick={() => (confirmLan = false)}
		></button>
		<div class="glass-solid relative flex w-full max-w-sm flex-col gap-3 rounded-2xl p-5">
			<span class="flex items-center gap-2 text-headline-sm font-headline text-on-surface">
				<TriangleAlert size={16} class="text-error" /> {t('settings.mcp.remote.lanTitle')}
			</span>
			<p class="text-body-sm font-body leading-relaxed text-on-surface-variant">
				{t('settings.mcp.remote.lanConfirm')}
			</p>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" size="md" onclick={() => (confirmLan = false)}>
					{t('settings.mcp.remote.cancel')}
				</Button>
				<Button
					variant="danger"
					size="md"
					onclick={async () => {
						confirmLan = false;
						await enableRemoteMcp('lan');
					}}
				>
					{t('settings.mcp.remote.lanConfirmButton')}
				</Button>
			</div>
		</div>
	</div>
{/if}
