<script lang="ts">
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { VaultConflict } from '$lib/content/vault-reconcile';
	import type { VaultResolveChoice } from '$lib/stores/vault.svelte';

	/**
	 * Resolves vault conflicts one at a time (docs/design/vault-mirror.md #V8).
	 *
	 * A conflict is shown only when both sides changed since the last sync, so
	 * the user is never asked about a change that is not actually contested. Each
	 * choice is explicit and keeps the losing side recoverable: the app version
	 * goes to Record History, and "Keep both" creates a second note.
	 */
	let {
		conflicts,
		onresolve,
		onclose
	}: {
		conflicts: VaultConflict[];
		onresolve: (relPath: string, choice: VaultResolveChoice) => Promise<boolean>;
		onclose: () => void;
	} = $props();

	let busy = $state(false);

	const current = $derived(conflicts[0]);
	const total = $derived(conflicts.length);

	async function choose(choice: VaultResolveChoice) {
		if (busy || !current) return;
		busy = true;
		await onresolve(current.relPath, choice);
		busy = false;
	}
</script>

{#if current}
	<div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
		<button
			class="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
			aria-label={t('settings.vault.conflictDismiss')}
			onclick={onclose}
		></button>
		<div class="glass-solid relative flex w-full max-w-2xl flex-col gap-4 rounded-2xl p-5">
			<div class="flex flex-col gap-0.5">
				<span class="text-headline-sm font-headline text-on-surface">
					{t('settings.vault.conflictTitle')}
				</span>
				<span class="text-label-sm font-label text-outline">
					{t('settings.vault.conflictLede', { count: total })}
				</span>
			</div>

			<div class="flex items-center justify-between gap-2">
				<span class="min-w-0 truncate text-body-md font-body text-on-surface-variant">
					{current.relPath}
				</span>
				<span class="shrink-0 text-label-sm font-label text-outline">
					{t('settings.vault.conflictProgress', { index: 1, total })}
				</span>
			</div>

			<div class="grid min-h-0 grid-cols-2 gap-3">
				<div class="flex min-w-0 flex-col gap-1">
					<span class="text-label-sm font-label tracking-wider text-outline uppercase">
						{t('settings.vault.conflictLocal')}
					</span>
					<div
						class="scrollbar-none max-h-56 overflow-y-auto rounded-xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
					>
						<p class="text-body-sm font-body whitespace-pre-wrap text-on-surface">
							{current.localBody || '—'}
						</p>
					</div>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<span class="text-label-sm font-label tracking-wider text-outline uppercase">
						{t('settings.vault.conflictFile')}
					</span>
					<div
						class="scrollbar-none max-h-56 overflow-y-auto rounded-xl bg-surface-container-lowest/40 p-3 ring-1 ring-inset ring-outline-variant/40"
					>
						<p class="text-body-sm font-body whitespace-pre-wrap text-on-surface">
							{current.fileBody || '—'}
						</p>
					</div>
				</div>
			</div>

			<div class="flex flex-wrap justify-end gap-2">
				<Button variant="ghost" size="md" disabled={busy} onclick={onclose}>
					{t('settings.vault.conflictDismiss')}
				</Button>
				<Button variant="secondary" size="md" disabled={busy} onclick={() => choose('both')}>
					{t('settings.vault.conflictBoth')}
				</Button>
				<Button variant="secondary" size="md" disabled={busy} onclick={() => choose('file')}>
					{t('settings.vault.conflictFileAction')}
				</Button>
				<Button variant="primary" size="md" disabled={busy} onclick={() => choose('app')}>
					{t('settings.vault.conflictAppAction')}
				</Button>
			</div>
		</div>
	</div>
{/if}
