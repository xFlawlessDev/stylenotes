<script lang="ts" module>
	/** SQLite writes `YYYY-MM-DD HH:MM:SS` (UTC); the log shows just the clock. */
	export function formatCallTime(value: string): string {
		const match = /(\d{2}:\d{2})/.exec(value);
		return match ? match[1] : value;
	}
</script>

<script lang="ts">
	/** Recent MCP tool calls, with a reset (docs/design/mcp-local-free.md #D7, #D10). */
	import { RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { clearMcpAudit, mcpStore } from '$lib/stores/mcp.svelte';

	let confirmClear = $state(false);

	const rows = $derived(mcpStore.audit);

	async function reset() {
		await clearMcpAudit();
		confirmClear = false;
	}
</script>

<div class="flex flex-col gap-2.5">
	<div class="flex items-center justify-between gap-2">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase"
			>{t('settings.mcp.recentCalls')}</span
		>
		{#if confirmClear}
			<div class="flex items-center gap-1.5">
				<span class="text-label-sm font-label text-error">{t('settings.mcp.clearLog')}</span>
				<Button variant="secondary" size="xs" class="text-error" onclick={() => void reset()}>
					{t('settings.mcp.yes')}
				</Button>
				<Button variant="secondary" size="xs" onclick={() => (confirmClear = false)}
					>{t('settings.mcp.no')}</Button
				>
			</div>
		{:else if rows.length}
			<Button variant="ghost" size="xs" class="text-outline" onclick={() => (confirmClear = true)}>
				<RotateCcw size={13} /> {t('settings.mcp.reset')}
			</Button>
		{/if}
	</div>

	{#if rows.length === 0}
		<div class="glass-well rounded-2xl p-3 text-body-sm font-body text-outline">
			{t('settings.mcp.auditEmpty')}
		</div>
	{:else}
		<div class="flex max-h-64 flex-col gap-1 overflow-y-auto">
			{#each rows as row (row.id)}
				<div class="flex items-center gap-2 rounded-xl bg-surface-container-lowest/30 px-2.5 py-1.5">
					<span
						class="size-1.5 shrink-0 rounded-full {row.ok ? 'bg-primary' : 'bg-error'}"
						aria-hidden="true"
					></span>
					<span class="min-w-0 flex-1 truncate font-code text-code-sm text-on-surface">{row.tool}</span>
					{#if row.workspace}
						<span class="shrink-0 text-label-sm font-label text-outline">{row.workspace}</span>
					{/if}
					<span
						class="shrink-0 rounded-full px-1.5 py-px text-label-sm font-label {row.scope === 'write'
							? 'bg-tertiary-container text-on-tertiary-container'
							: 'bg-surface-container text-outline'}"
					>
						{t(row.scope === 'write' ? 'settings.mcp.scopeWrite' : 'settings.mcp.scopeRead')}
					</span>
					<span class="shrink-0 text-label-sm font-label text-outline"
						>{formatCallTime(row.at)}</span
					>
				</div>
			{/each}
		</div>
	{/if}
</div>
