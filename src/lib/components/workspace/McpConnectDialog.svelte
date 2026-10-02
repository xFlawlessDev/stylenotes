<script lang="ts">
	/**
	 * Connect-a-client guide (docs/design/constella-features.md #D12).
	 *
	 * The MCP server is reached over the remote Streamable HTTP endpoint, so the
	 * snippet needs an endpoint URL and a Bearer token — never a local binary
	 * path. The token is shown once by the remote settings; this dialog uses it
	 * while it is in memory and falls back to a placeholder otherwise.
	 */
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/base';
	import { Copy, Plug } from '@lucide/svelte';
	import { t } from '$lib/i18n/index.svelte';
	import {
		buildMcpConfig,
		configLocationHint,
		MCP_CONFIG_TARGETS,
		type McpConfigTarget,
	} from '$lib/content/mcp-config';
	import { remoteMcpStore } from '$lib/stores/remote-mcp.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let copied = $state<McpConfigTarget | null>(null);

	/** The endpoint an agent should use; loopback until the listener is bound. */
	const endpoint = $derived(remoteMcpStore.addresses[0] ?? 'http://127.0.0.1:7317');
	const token = $derived(remoteMcpStore.token ?? '');

	const config = $derived.by(() =>
		Object.fromEntries(
			MCP_CONFIG_TARGETS.map((target) => [
				target.id,
				buildMcpConfig(target.id, { url: `${endpoint}/mcp`, token }),
			])
		) as Record<McpConfigTarget, string>
	);

	async function copyConfig(target: McpConfigTarget) {
		try {
			await navigator.clipboard.writeText(config[target]);
			copied = target;
			setTimeout(() => (copied = null), 1500);
		} catch {
			/* clipboard denied: the snippet is visible for manual copy */
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-dialog max-w-xl">
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-secondary"
			>
				<Plug size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface"
				>{t('settings.mcp.connectTitle')}</Dialog.Title
			>
			<Dialog.Description>
				{t('settings.mcp.connectDialogHint')}
			</Dialog.Description>
		</Dialog.Header>

		{#if !remoteMcpStore.enabled}
			<p class="rounded-xl bg-surface-container-lowest/40 p-3 text-body-sm font-body text-outline">
				{t('settings.mcp.connectEnableHint')}
			</p>
		{/if}

		<div class="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1 scrollbar-none">
			{#if !token}
				<p class="text-label-sm font-label leading-relaxed text-tertiary">
					{t('settings.mcp.connectTokenMissing')}
				</p>
			{/if}

			{#each MCP_CONFIG_TARGETS as target (target.id)}
				<div class="flex flex-col gap-1.5 rounded-2xl bg-surface-container-lowest/30 p-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="text-body-md font-body text-on-surface">{target.label}</span>
						<Button
							variant="secondary"
							size="xs"
							shape="pill"
							onclick={() => void copyConfig(target.id)}
						>
							<Copy size={13} />
							{copied === target.id ? t('settings.mcp.copied') : t('settings.mcp.copyConfig')}
						</Button>
					</div>
					<pre
						class="glass-well max-h-40 overflow-auto rounded-xl p-2.5 font-code text-code-sm text-on-surface-variant">{config[
							target.id
						]}</pre>
					<span class="text-label-sm font-label text-outline">{configLocationHint(target.id)}</span>
				</div>
			{/each}
		</div>

		<Dialog.Footer
			class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
		>
			<Button variant="primary" onclick={() => (open = false)}>
				{t('settings.mcp.gotIt')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
