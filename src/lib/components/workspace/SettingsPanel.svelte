<script lang="ts">
	import {
		X,
		Sun,
		Moon,
		Check,
		Download,
		RotateCcw,
		Sparkles,
		Keyboard,
		Type,
		Rows3,
		Rows2,
		Eye,
		PenLine,
		Columns2,
		Trash2,
		HardDrive,
		ShieldCheck,
	} from '@lucide/svelte';
	import {
		settings,
		updateSettings,
		resetSettings,
		accents,
		type Density,
		type EditorView,
	} from '$lib/stores/settings.svelte';

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

	type Section = 'appearance' | 'editor' | 'data' | 'about';
	let section = $state<Section>('appearance');

	const nav: { id: Section; label: string; icon: typeof Sun }[] = [
		{ id: 'appearance', label: 'Appearance', icon: Sun },
		{ id: 'editor', label: 'Editor', icon: Type },
		{ id: 'data', label: 'Data', icon: HardDrive },
		{ id: 'about', label: 'About', icon: Sparkles },
	];

	const densities: { id: Density; label: string; icon: typeof Rows3 }[] = [
		{ id: 'comfortable', label: 'Comfortable', icon: Rows3 },
		{ id: 'compact', label: 'Compact', icon: Rows2 },
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
			class="glass-solid relative flex h-full w-full max-w-[520px] flex-col overflow-hidden rounded-l-2xl"
		>
			<div class="flex items-center justify-between px-5 py-4">
				<div class="flex flex-col">
					<span class="text-headline-md font-headline text-on-surface">Settings</span>
					<span class="text-label-sm font-label text-outline">Personalize StyleNotes</span>
				</div>
				<button
					class="glass-chip flex size-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface"
					aria-label="Close"
					onclick={onclose}
				>
					<X size={16} />
				</button>
			</div>

			<div class="glass-divider h-px"></div>

			<div class="flex min-h-0 flex-1">
				<nav class="flex w-40 shrink-0 flex-col gap-1 p-2.5">
					{#each nav as item (item.id)}
						{@const Icon = item.icon}
						<button
							class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-body-md font-body transition-colors {section ===
							item.id
								? 'glass-chip text-on-surface'
								: 'text-on-surface-variant hover:bg-surface-container/50'}"
							onclick={() => (section = item.id)}
						>
							<Icon size={16} class={section === item.id ? 'text-primary' : 'text-outline'} />
							{item.label}
						</button>
					{/each}
				</nav>

				<div class="glass-divider w-px"></div>

				<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
					{#if section === 'appearance'}
						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Theme</span
							>
							<div class="grid grid-cols-2 gap-2">
								<button
									class="flex items-center justify-center gap-2 rounded-xl py-2.5 text-label-md font-label transition-all {settings.mode ===
									'dark'
										? 'glass-chip text-on-surface'
										: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
									onclick={() => updateSettings({ mode: 'dark' })}
								>
									<Moon size={15} /> Dark
								</button>
								<button
									class="flex items-center justify-center gap-2 rounded-xl py-2.5 text-label-md font-label transition-all {settings.mode ===
									'light'
										? 'glass-chip text-on-surface'
										: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
									onclick={() => updateSettings({ mode: 'light' })}
								>
									<Sun size={15} /> Light
								</button>
							</div>
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Accent color</span
							>
							<div class="grid grid-cols-4 gap-2">
								{#each accents as accent (accent.id)}
									<button
										class="flex flex-col items-center gap-1.5 rounded-xl py-2.5 transition-all {settings.accent ===
										accent.id
											? 'glass-chip'
											: 'bg-surface-container-lowest/30 hover:bg-surface-container/50'}"
										onclick={() => updateSettings({ accent: accent.id })}
									>
										<span
											class="{accent.swatchClass} flex size-6 items-center justify-center rounded-full ring-1 ring-inset ring-outline-variant"
										>
											{#if settings.accent === accent.id}
												<Check size={13} class="text-on-swatch" />
											{/if}
										</span>
										<span class="text-label-sm font-label text-on-surface-variant">{accent.label}</span>
									</button>
								{/each}
							</div>
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Density</span
							>
							<div class="grid grid-cols-2 gap-2">
								{#each densities as item (item.id)}
									{@const Icon = item.icon}
									<button
										class="flex items-center justify-center gap-2 rounded-xl py-2.5 text-label-md font-label transition-all {settings.density ===
										item.id
											? 'glass-chip text-on-surface'
											: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
										onclick={() => updateSettings({ density: item.id })}
									>
										<Icon size={15} /> {item.label}
									</button>
								{/each}
							</div>
						</div>

						<label
							class="flex cursor-pointer items-center justify-between rounded-xl bg-surface-container-lowest/30 p-3"
						>
							<span class="flex flex-col">
								<span class="text-body-md font-body text-on-surface">Reduce motion</span>
								<span class="text-label-sm font-label text-outline"
									>Minimize animations across the app</span
								>
							</span>
							<button
								class="relative h-5 w-9 shrink-0 rounded-full transition-colors {settings.reduceMotion
									? 'bg-primary'
									: 'bg-surface-container-highest'}"
								role="switch"
								aria-checked={settings.reduceMotion}
								aria-label="Reduce motion"
								onclick={() => updateSettings({ reduceMotion: !settings.reduceMotion })}
							>
								<span
									class="absolute top-0.5 size-4 rounded-full transition-transform {settings.reduceMotion
										? 'right-0.5 bg-on-primary'
										: 'left-0.5 bg-outline'}"
								></span>
							</button>
						</label>
					{/if}

					{#if section === 'editor'}
						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Default view</span
							>
							<div class="grid grid-cols-3 gap-2">
								{#each views as item (item.id)}
									{@const Icon = item.icon}
									<button
										class="flex flex-col items-center gap-1.5 rounded-xl py-3 text-label-sm font-label transition-all {settings.editorView ===
										item.id
											? 'glass-chip text-on-surface'
											: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50'}"
										onclick={() => updateSettings({ editorView: item.id })}
									>
										<Icon size={16} />
										{item.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="flex flex-col gap-2">
							{#each [{ k: 'spellcheck' as const, t: 'Check spelling', d: 'Underline misspelled words while writing' }, { k: 'showWordCount' as const, t: 'Show word count', d: 'Display live counts in the editor footer' }, { k: 'confirmDelete' as const, t: 'Confirm before deleting', d: 'Ask before a note is permanently removed' }] as row (row.k)}
								<label
									class="flex cursor-pointer items-center justify-between rounded-xl bg-surface-container-lowest/30 p-3"
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-on-surface">{row.t}</span>
										<span class="text-label-sm font-label text-outline">{row.d}</span>
									</span>
									<button
										class="relative h-5 w-9 shrink-0 rounded-full transition-colors {settings[
											row.k
										]
											? 'bg-primary'
											: 'bg-surface-container-highest'}"
										role="switch"
										aria-checked={settings[row.k]}
										aria-label={row.t}
										onclick={() => updateSettings({ [row.k]: !settings[row.k] })}
									>
										<span
											class="absolute top-0.5 size-4 rounded-full transition-transform {settings[
												row.k
											]
												? 'right-0.5 bg-on-primary'
												: 'left-0.5 bg-outline'}"
										></span>
									</button>
								</label>
							{/each}
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Shortcuts</span
							>
							<div class="flex flex-col gap-1 rounded-xl bg-surface-container-lowest/30 p-2">
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

					{#if section === 'data'}
						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Local storage</span
							>
							<div class="glass-well flex items-center gap-3 rounded-xl p-3">
								<div
									class="flex size-9 items-center justify-center rounded-xl bg-tertiary-container text-on-tertiary-container"
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
								<button
									class="glass-chip flex items-center justify-center gap-2 rounded-xl py-2.5 text-label-md font-label text-on-surface transition-colors hover:text-primary"
									onclick={onexport}
								>
									<Download size={15} /> Export
								</button>
							</div>
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>Reset</span
							>
							<div class="flex flex-col gap-2">
								<button
									class="flex items-center justify-between rounded-xl bg-surface-container-lowest/30 p-3 text-left transition-colors hover:bg-surface-container/50"
									onclick={resetSettings}
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-on-surface">Reset preferences</span>
										<span class="text-label-sm font-label text-outline"
											>Return appearance and editor options to defaults</span
										>
									</span>
									<RotateCcw size={15} class="shrink-0 text-outline" />
								</button>
								<button
									class="flex items-center justify-between rounded-xl bg-error-container/25 p-3 text-left transition-colors hover:bg-error-container/40"
									onclick={onresetdata}
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-error">Reset all data</span>
										<span class="text-label-sm font-label text-outline"
											>Restore the sample notes and clear local changes</span
										>
									</span>
									<Trash2 size={15} class="shrink-0 text-error" />
								</button>
							</div>
						</div>
					{/if}

					{#if section === 'about'}
						<div class="flex flex-col items-center gap-3 py-6 text-center">
							<div
								class="flex size-14 items-center justify-center rounded-2xl bg-surface-container-high text-primary ring-1 ring-inset ring-hairline"
							>
								<Sparkles size={24} />
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-headline-md font-headline text-on-surface">StyleNotes</span>
								<span class="text-label-sm font-label text-outline">Version 0.1.0</span>
							</div>
							<p class="max-w-[300px] text-body-sm font-body leading-relaxed text-on-surface-variant">
								A calm, local-first notebook built with Tauri, Svelte, and a liquid glass
								interface inspired by Material Design.
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
		</aside>
	</div>
{/if}