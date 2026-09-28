<script lang="ts">
	import {
		X,
		Sun,
		Download,
		RotateCcw,
		Sparkles,
		Keyboard,
		Type,
		Eye,
		PenLine,
		Columns2,
		Trash2,
		HardDrive,
		ShieldCheck,
		PictureInPicture2,
		Plug,
	} from '@lucide/svelte';
	import { Button, ChoiceTile, Switch } from '$lib/components/base';
	import {
		settings,
		updateSettings,
		resetSettings,
		type EditorView,
	} from '$lib/stores/settings.svelte';
	import { appInfo } from '$lib/app-info';
	import AppearanceSettings from '$lib/components/workspace/AppearanceSettings.svelte';
	import DockSettings from '$lib/components/workspace/DockSettings.svelte';
	import McpSettings from '$lib/components/workspace/McpSettings.svelte';

	let {
		open = false,
		onclose,
		onexport,
		onresetdata,
		notecount,
	}: {
		open?: boolean;
		onclose: () => void;
		onexport: () => void;
		onresetdata: () => void;
		notecount: number;
	} = $props();

	type Section = 'appearance' | 'editor' | 'dock' | 'mcp' | 'data' | 'about';
	let section = $state<Section>('appearance');

	const nav: { id: Section; label: string; icon: typeof Sun }[] = [
		{ id: 'appearance', label: 'Appearance', icon: Sun },
		{ id: 'editor', label: 'Editor', icon: Type },
		{ id: 'dock', label: 'Overlay', icon: PictureInPicture2 },
		{ id: 'mcp', label: 'AI & MCP', icon: Plug },
		{ id: 'data', label: 'Data', icon: HardDrive },
		{ id: 'about', label: 'About', icon: Sparkles },
	];

	const views: { id: EditorView; label: string; icon: typeof Eye }[] = [
		{ id: 'write', label: 'Write', icon: PenLine },
		{ id: 'split', label: 'Split', icon: Columns2 },
		{ id: 'preview', label: 'Preview', icon: Eye },
	];

	const shortcuts = [
		{ keys: 'Ctrl K', label: 'Open command palette' },
		{ keys: 'Ctrl N', label: 'Create a new note' },
		{ keys: 'Ctrl ,', label: 'Open settings' },
		{ keys: 'Ctrl /', label: 'Toggle light and dark' },
		{ keys: 'Esc', label: 'Close the active panel' },
	];
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-stretch justify-end">
		<button
			class="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
			aria-label="Close settings"
			onclick={onclose}
		></button>

		<aside
			class="glass-solid relative flex h-full w-full max-w-[520px] flex-col overflow-hidden rounded-l-2xl max-sm:max-w-full max-sm:rounded-l-none"
		>
			<div class="flex items-center justify-between px-5 py-4">
				<div class="flex flex-col">
					<span class="text-headline-md font-headline text-on-surface">Settings</span>
					<span class="text-label-sm font-label text-outline">Personalize StyleNotes</span>
				</div>
				<Button
					size="icon"
					shape="pill"
					variant="secondary"
					class="text-on-surface-variant"
					aria-label="Close"
					onclick={onclose}
				>
					<X size={16} />
				</Button>
			</div>

			<div class="glass-divider h-px"></div>

			<div class="flex min-h-0 min-w-0 flex-1">
				<div class="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
				<nav class="scrollbar-none flex w-full shrink-0 flex-row gap-1 overflow-x-auto p-2.5 sm:w-40 sm:flex-col sm:overflow-visible">
					{#each nav as item (item.id)}
						{@const Icon = item.icon}
						<Button
							variant={section === item.id ? 'tonal' : 'ghost'}
							size="lg"
							class="shrink-0 justify-start gap-2.5 px-3 text-left font-body text-body-md"
							onclick={() => (section = item.id)}
						>
							<Icon size={16} class={section === item.id ? 'text-on-primary-container' : 'text-outline'} />
							{item.label}
						</Button>
					{/each}
				</nav>

				<div class="glass-divider hidden w-px shrink-0 sm:block"></div>
				<div class="glass-divider h-px w-full shrink-0 sm:hidden"></div>

				<div class="scrollbar-none flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
					{#if section === 'appearance'}
						<AppearanceSettings />
					{/if}

					{#if section === 'editor'}
						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Default view</span
							>
							<div class="grid grid-cols-3 gap-2">
								{#each views as item (item.id)}
									<ChoiceTile
										layout="stack"
										icon={item.icon}
										label={item.label}
										class="py-3"
										active={settings.editorView === item.id}
										onclick={() => updateSettings({ editorView: item.id })}
									/>
								{/each}
							</div>
						</div>

						<div class="flex flex-col gap-2">
							{#each [{ k: 'spellcheck' as const, t: 'Check spelling', d: 'Underline misspelled words while writing' }, { k: 'showWordCount' as const, t: 'Show word count', d: 'Display live counts in the editor header' }, { k: 'confirmDelete' as const, t: 'Confirm before deleting', d: 'Ask before a note is permanently removed' }] as row (row.k)}
								<div
									class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3"
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-on-surface">{row.t}</span>
										<span class="text-label-sm font-label text-outline">{row.d}</span>
									</span>
									<Switch
										checked={settings[row.k]}
										label={row.t}
										onchange={(checked) => updateSettings({ [row.k]: checked })}
									/>
								</div>
							{/each}
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Shortcuts</span
							>
							<div class="flex flex-col gap-1 rounded-2xl bg-surface-container-lowest/30 p-2">
								{#each shortcuts as item (item.keys)}
									<div class="flex items-center justify-between px-1.5 py-1.5">
										<span class="flex items-center gap-1.5 text-body-sm font-body text-on-surface-variant">
											<Keyboard size={13} class="text-outline" />
											{item.label}
										</span>
										<kbd class="glass-chip rounded-md px-2 py-0.5 text-code-sm font-code text-outline"
											>{item.keys}</kbd
										>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if section === 'dock'}
						<DockSettings />
					{/if}

					{#if section === 'mcp'}
						<McpSettings />
					{/if}

					{#if section === 'data'}
						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Local storage</span
							>
							<div class="glass-well flex items-center gap-3 rounded-2xl p-3">
								<div
									class="flex size-9 items-center justify-center rounded-2xl bg-tertiary-container text-on-tertiary-container"
								>
									<HardDrive size={17} />
								</div>
								<div class="flex flex-col">
									<span class="text-headline-sm font-headline text-on-surface"
										>{notecount} notes stored</span
									>
									<span class="text-label-sm font-label text-outline"
										>Kept on this device, no account required</span
									>
								</div>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<Button
									variant="secondary"
									size="lg"
									shape="tile"
									block
									class="justify-center text-label-md"
									onclick={onexport}
								>
									<Download size={15} /> Export to folder
								</Button>
							</div>
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Reset</span
							>
							<div class="flex flex-col gap-2">
								<Button
									variant="soft"
									size="md"
									shape="tile"
									block
									class="h-auto justify-between gap-3 p-3 text-left"
									onclick={resetSettings}
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-on-surface">Reset preferences</span>
										<span class="text-label-sm font-label text-outline"
											>Return appearance and editor options to defaults</span
										>
									</span>
									<RotateCcw size={15} class="shrink-0 text-outline" />
								</Button>
								<Button
									variant="danger"
									size="md"
									shape="tile"
									block
									class="h-auto justify-between gap-3 p-3 text-left"
									onclick={onresetdata}
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-error">Reset all data</span>
										<span class="text-label-sm font-label text-outline"
											>Restore the sample notes and clear local changes</span
										>
									</span>
									<Trash2 size={15} class="shrink-0 text-error" />
								</Button>
							</div>
						</div>
					{/if}

					{#if section === 'about'}
						<div class="flex flex-col items-center gap-3 py-6 text-center">
							<img
								src="/icon-128.png"
								alt={appInfo.name}
								class="size-14 rounded-2xl object-cover"
							/>
							<div class="flex flex-col gap-1">
								<span class="text-headline-md font-headline text-on-surface">{appInfo.name}</span>
								<span class="text-label-sm font-label text-outline">Version {appInfo.version}</span>
							</div>
							<p class="max-w-[300px] text-body-sm font-body leading-relaxed text-on-surface-variant">
								{appInfo.description}
							</p>
							<div
								class="glass-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-label-sm font-label text-on-surface-variant"
							>
								<ShieldCheck size={14} class="text-tertiary" />
								Private by default, stored on your device
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
		</aside>
	</div>
{/if}
