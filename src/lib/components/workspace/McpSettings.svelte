<script lang="ts">
	import { onMount } from 'svelte';
	import { Copy, ShieldCheck, ShieldAlert, PlugZap, TriangleAlert } from '@lucide/svelte';
	import { Button, ChoiceTile, Field, Select, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { MCP_SCOPES, toolsByKind } from '$lib/content/mcp-tools';
	import { buildMcpConfig, defaultInstanceId, MCP_CONFIG_TARGETS, type McpConfigTarget } from '$lib/content/mcp-config';
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
	import RemoteMcpSettings from './RemoteMcpSettings.svelte';

	let confirmOpen = $state(false);
	let copied = $state<McpConfigTarget | null>(null);

	const instanceId = defaultInstanceId('stylenotes');
	const binaryPath = $derived(mcpStore.appInfo?.binaryPath ?? '');
	const toolCount = $derived(toolsByKind('write').length + toolsByKind('read').length);
	const access = $derived(mcpStore.settings.access);
	const writeEnabled = $derived(access === 'write');
	const binaryMissing = $derived(mcpStore.appInfo !== null && !binaryPath);

	const workspaceOptions = $derived([
		{ value: '', label: t('settings.mcp.allWorkspaces') },
		...workspaceStore.items.map((workspace) => ({ value: workspace.id, label: workspace.name })),
	]);
	const selectedWorkspace = $derived(mcpStore.settings.workspaces[0] ?? '');

	// The danger note mixes a bold scope name and a code path into one sentence;
	// split the translated string so both can stay real elements.
	const DANGER_MARK = '\u0000';
	const dangerParts = $derived(
		t('settings.mcp.danger', { notes: DANGER_MARK, path: DANGER_MARK }).split(DANGER_MARK)
	);

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
		<span class="text-label-sm font-label tracking-wider text-outline uppercase"
			>{t('settings.mcp.title')}</span
		>

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
					{mcpStore.enabled ? t('settings.mcp.on') : t('settings.mcp.off')}
				</span>
				<span class="truncate text-label-sm font-label text-outline">
					{mcpStore.enabled
						? t('settings.mcp.clients', {
								count: mcpStore.clients.length,
								access: access === 'write' ? t('settings.mcp.readWrite') : t('settings.mcp.readOnly')
							})
						: t('settings.mcp.offHint')}
				</span>
			</div>
			<Switch
				checked={mcpStore.enabled}
				label={t('settings.mcp.enableLabel')}
				onchange={(checked) => void setMcpEnabled(checked)}
			/>
		</div>

		<p class="text-label-sm font-label leading-relaxed text-outline">
			{t('settings.mcp.byline')}
		</p>

		{#if binaryMissing}
			<div class="flex items-start gap-2 rounded-2xl bg-error-container/30 p-3">
				<TriangleAlert size={15} class="mt-0.5 shrink-0 text-error" />
				<span class="text-body-sm font-body text-on-error-container">
					{t('settings.mcp.binaryMissing')}
				</span>
			</div>
		{/if}
	</div>

	{#if mcpStore.enabled}
		<div class="flex flex-col gap-2.5">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase"
				>{t('settings.mcp.access')}</span
			>
			<div class="grid grid-cols-2 gap-2">
				<ChoiceTile
					layout="stack"
					icon={ShieldCheck}
					label={t('settings.mcp.readOnly')}
					class="py-3"
					active={access === 'read'}
					onclick={() => void pickAccess('read')}
				/>
				<ChoiceTile
					layout="stack"
					icon={ShieldAlert}
					label={t('settings.mcp.allowWrites')}
					class="py-3"
					active={writeEnabled}
					onclick={() => void pickAccess('write')}
				/>
			</div>

			{#if writeEnabled}
				<div class="flex flex-col gap-2">
					<span class="text-label-sm font-label text-outline">{t('settings.mcp.whatMayChange')}</span>
					{#each MCP_SCOPES as scope (scope.id)}
						<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
							<span class="flex flex-col">
								<span class="text-body-md font-body text-on-surface"
									>{t('settings.mcp.scope.' + scope.id)}</span
								>
								<span class="text-label-sm font-label text-outline"
									>{t('settings.mcp.scopeDescription.' + scope.id)}</span
								>
							</span>
							<Switch
								checked={mcpScopeEnabled(scope.id)}
								label={t('settings.mcp.allowScope', { scope: t('settings.mcp.scope.' + scope.id) })}
								onchange={(checked) => void toggleMcpScope(scope.id as McpScope, checked)}
							/>
						</div>
					{/each}
					<p class="text-label-sm font-label leading-relaxed text-error">
						{dangerParts[0]}<strong>{t('settings.mcp.scope.notes')}</strong>{dangerParts[1]}<code class="font-code">mcp/backups/notes</code>{dangerParts[2]}
					</p>
				</div>
			{/if}

			<Field
				label={t('settings.mcp.workspaceScope')}
				description={t('settings.mcp.workspaceScopeHint')}
			>
				<Select
					label={t('settings.mcp.workspaceScopeLabel')}
					options={workspaceOptions}
					value={selectedWorkspace}
					onchange={(next) => void updateMcpSettings({ workspaces: next ? [next] : [] })}
				/>
			</Field>

			<div class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3">
				<span class="flex flex-col">
					<span class="text-body-md font-body text-on-surface">{t('settings.mcp.recordActivity')}</span>
					<span class="text-label-sm font-label text-outline"
						>{t('settings.mcp.recordActivityHint')}</span
					>
				</span>
				<Switch
					checked={mcpStore.settings.audit}
					label={t('settings.mcp.recordActivity')}
					onchange={(checked) => void updateMcpSettings({ audit: checked })}
				/>
			</div>
		</div>

		<div class="flex flex-col gap-2.5">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase"
				>{t('settings.mcp.connectClient')}</span
			>
			{#each MCP_CONFIG_TARGETS as target (target.id)}
				<div class="flex flex-col gap-1.5 rounded-2xl bg-surface-container-lowest/30 p-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="text-body-md font-body text-on-surface">{target.label}</span>
						<Button variant="secondary" size="xs" shape="pill" onclick={() => void copyConfig(target.id)}>
							<Copy size={13} />
							{copied === target.id ? t('settings.mcp.copied') : t('settings.mcp.copyConfig')}
						</Button>
					</div>
					<pre class="glass-well max-h-40 overflow-auto rounded-xl p-2.5 font-code text-code-sm text-on-surface-variant">{config[target.id]}</pre>
					<span class="text-label-sm font-label text-outline"
						>{target.id === 'cursor'
							? t('settings.mcp.configHintCursor')
							: t('settings.mcp.configHintClaude')}</span
					>
				</div>
			{/each}
			<span class="text-label-sm font-label leading-relaxed text-outline">
				{t('settings.mcp.connectHint', { count: toolCount })}
			</span>
		</div>

		<RemoteMcpSettings />

		<McpClientList />
		<McpAuditLog />
	{/if}
</div>

<ConfirmDialog
	open={confirmOpen}
	title={t('settings.mcp.confirmTitle')}
	description={t('settings.mcp.confirmDescription')}
	confirmLabel={t('settings.mcp.confirmLabel')}
	confirmVariant="danger"
	onconfirm={() => void grantWrite()}
	oncancel={() => (confirmOpen = false)}
/>
