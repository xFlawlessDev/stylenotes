<script lang="ts">
	import { onMount } from 'svelte';
	import { Copy, ShieldCheck, ShieldAlert, PlugZap, TriangleAlert } from '@lucide/svelte';
	import { Button, ChoiceTile, Field, Select, Switch } from '$lib/components/base';
	import { MCP_SCOPES, toolsByKind } from '$lib/content/mcp-tools';
	import { buildMcpConfig, configLocationHint, defaultInstanceId, MCP_CONFIG_TARGETS, type McpConfigTarget } from '$lib/content/mcp-config';
	import type { McpAccess, McpScope } from '$lib/content/mcp-types';
	import {
		hydrateMcp,
		mcpStore,
		mcpScopeEnabled,
		refreshMcpAppInfo,
		setMcpEnabled,
		toggleMcpScope,
		updateMcpSettings,
	} from '$lib/stores/mcp.svelte';
	import { workspaceStore } from '$lib/stores/workspaces.svelte';
	import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
	import McpClientList from './McpClientList.svelte';
	import McpAuditLog from './McpAuditLog.svelte';

	let confirmOpen = $state(false);
	let copied = $state<McpConfigTarget | null>(null);

	const instanceId = defaultInstanceId('stylenotes');
	const binaryPath = $derived(mcpStore.appInfo?.binaryPath ?? '');
	const toolCount = $derived(toolsByKind('write').length + toolsByKind('read').length);
	const access = $derived(mcpStore.settings.access);
	const writeEnabled = $derived(access === 'write');
	const binaryMissing = $derived(mcpStore.appInfo !== null && !binaryPath);

	const workspaceOptions = $derived([
		{ value: '', label: 'All workspaces' },
		...workspaceStore.items.map((workspace) => ({ value: workspace.id, label: workspace.name })),
	]);
	const selectedWorkspace = $derived(mcpStore.settings.workspaces[0] ?? '');

	const config = $derived.by(() =>
		Object.fromEntries(
			MCP_CONFIG_TARGETS.map((target) => [
				target.id,
				buildMcpConfig(target.id, { binaryPath, instanceId }),
			])
		) as Record<McpConfigTarget, string>
	);

	onMount(() => {
		void hydrateMcp();
		void refreshMcpAppInfo();
	});

	async function pickAccess(next: McpAccess) {
		if (next === 'write') {
			confirmOpen = true;
			return;
		}
		await updateMcpSettings({ access: 'read', scopes: [] });
	}

	async function grantWrite() {
		confirmOpen = false;
		// Opening write starts with every scope off: the user opts in explicitly.
		await updateMcpSettings({ access: 'write' });
	}

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

<div class="flex min-w-0 flex-col gap-6">
	<div class="flex flex-col gap-2.5">
		<span class="text-label-sm font-label tracking-wider text-outline uppercase">Local MCP</span>

		<div class="glass-well flex items-center gap-3 rounded-2xl p-3">
			<div
				class="flex size-9 items-center justify-center rounded-2xl {mcpStore.enabled
					? 'bg-primary-container text-on-primary-container'
					: 'bg-surface-container text-outline'}"
			>
				<PlugZap size={17} />
			</div>
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="text-headline-sm font-headline text-on-surface">
					{mcpStore.enabled ? 'MCP is on' : 'MCP is off'}
				</span>
				<span class="truncate text-label-sm font-label text-outline">
					{mcpStore.enabled
						? `${mcpStore.clients.length} client(s) · ${access === 'write' ? 'read & write' : 'read only'}`
						: 'AI agents cannot reach your notes'}
				</span>
			</div>
			<Switch
				checked={mcpStore.enabled}
				label="Enable local MCP server"
				onchange={(checked) => void setMcpEnabled(checked)}
			/>
		</div>

		<p class="text-label-sm font-label leading-relaxed text-outline">
			Runs a local server on this device only — no port, no account, no internet. Agents reach it
			through the config below.
		</p>

		{#if binaryMissing}
			<div class="flex items-start gap-2 rounded-2xl bg-error-container/30 p-3">
				<TriangleAlert size={15} class="mt-0.5 shrink-0 text-error" />
				<span class="text-body-sm font-body text-on-error-container">
					The server binary was not found. Reinstall StyleNotes, then reopen this page.
				</span>
			</div>
		{/if}
	</div>

	{#if mcpStore.enabled}
		<div class="flex flex-col gap-2.5">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">Access</span>
			<div class="grid grid-cols-2 gap-2">
				<ChoiceTile
					layout="stack"
					icon={ShieldCheck}
					label="Read only"
					class="py-3"
					active={access === 'read'}
					onclick={() => void pickAccess('read')}
				/>
				<ChoiceTile
					layout="stack"
					icon={ShieldAlert}
					label="Allow writes"
					class="py-3"
					active={writeEnabled}
					onclick={() => void pickAccess('write')}
				/>
			</div>

			{#if writeEnabled}
				<div class="flex flex-col gap-2">
					<span class="text-label-sm font-label text-outline">What agents may change</span>
					{#each MCP_SCOPES as scope (scope.id)}
						<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
							<span class="flex flex-col">
								<span class="text-body-md font-body text-on-surface">{scope.label}</span>
								<span class="text-label-sm font-label text-outline">{scope.description}</span>
							</span>
							<Switch
								checked={mcpScopeEnabled(scope.id)}
								label="Allow {scope.label}"
								onchange={(checked) => void toggleMcpScope(scope.id as McpScope, checked)}
							/>
						</div>
					{/each}
					<p class="text-label-sm font-label leading-relaxed text-error">
						Allowing <strong>Notes</strong> lets an agent rewrite or permanently delete note content.
						StyleNotes keeps a copy of the previous body under <code class="font-code">mcp/backups/notes</code
							>.
					</p>
				</div>
			{/if}

			<Field label="Workspace scope" description="Limit agents to a single workspace, or leave open for all.">
				<Select
					label="MCP workspace scope"
					options={workspaceOptions}
					value={selectedWorkspace}
					onchange={(next) => void updateMcpSettings({ workspaces: next ? [next] : [] })}
				/>
			</Field>

			<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
				<span class="flex flex-col">
					<span class="text-body-md font-body text-on-surface">Record activity</span>
					<span class="text-label-sm font-label text-outline">Log every tool call below</span>
				</span>
				<Switch
					checked={mcpStore.settings.audit}
					label="Record activity"
					onchange={(checked) => void updateMcpSettings({ audit: checked })}
				/>
			</div>
		</div>

		<div class="flex flex-col gap-2.5">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">Connect a client</span>
			{#each MCP_CONFIG_TARGETS as target (target.id)}
				<div class="flex flex-col gap-1.5 rounded-2xl bg-surface-container-lowest/30 p-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="text-body-md font-body text-on-surface">{target.label}</span>
						<Button variant="secondary" size="xs" shape="pill" onclick={() => void copyConfig(target.id)}>
							<Copy size={13} />
							{copied === target.id ? 'Copied' : 'Copy config'}
						</Button>
					</div>
					<pre class="glass-well max-h-40 overflow-auto rounded-xl p-2.5 font-code text-code-sm text-on-surface-variant">{config[target.id]}</pre>
					<span class="text-label-sm font-label text-outline">{configLocationHint(target.id)}</span>
				</div>
			{/each}
			<span class="text-label-sm font-label leading-relaxed text-outline">
				Paste the block into each client's config, restart the client, and it can use the
				{toolCount} tools listed below.
			</span>
		</div>

		<McpClientList />
		<McpAuditLog />
	{/if}
</div>

<ConfirmDialog
	open={confirmOpen}
	title="Allow agents to write?"
	description="An agent will be able to change your notes and tasks using the tools you enable next. This is off by default and can be turned back off at any time."
	confirmLabel="Allow & enable writes"
	confirmVariant="danger"
	onconfirm={() => void grantWrite()}
	oncancel={() => (confirmOpen = false)}
/>
