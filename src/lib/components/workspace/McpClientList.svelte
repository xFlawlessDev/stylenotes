<script lang="ts">
	/** Connected MCP clients (docs/design/mcp-local-free.md #D7, #D10). */
	import { Plug, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { mcpStore, refreshMcpClients } from '$lib/stores/mcp.svelte';
	import { mcpRepo } from '$lib/db/mcp';

	const clients = $derived(mcpStore.clients);

	async function forget(instanceId: string) {
		await mcpRepo.removeClient(instanceId);
		await refreshMcpClients();
	}
</script>

<div class="flex flex-col gap-2.5">
	<span class="text-label-sm font-label tracking-wider text-outline uppercase">Clients</span>

	{#if clients.length === 0}
		<div class="glass-well rounded-2xl p-3 text-body-sm font-body text-outline">
			No client has connected yet. Paste the config below into Claude Desktop or Cursor, then restart
			it — the client appears here.
		</div>
	{:else}
		<div class="flex flex-col gap-1.5">
			{#each clients as client (client.instanceId)}
				<div class="flex items-center gap-2.5 rounded-2xl bg-surface-container-lowest/30 p-2.5">
					<div
						class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container"
					>
						<Plug size={15} />
					</div>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-body-md font-body text-on-surface">{client.name}</span>
						<span class="truncate text-label-sm font-label text-outline"
							>{client.source} · {client.instanceId}</span
						>
					</div>
					<Button
						variant="danger-ghost"
						size="icon-xs"
						shape="pill"
						aria-label="Forget {client.name}"
						onclick={() => void forget(client.instanceId)}
					>
						<Trash2 size={14} />
					</Button>
				</div>
			{/each}
		</div>
	{/if}
</div>
