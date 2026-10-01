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
		Bot,
		Plug,
		Cloud,
		CalendarDays,
		Brain,
		FileInput,
		FolderOpen,
	} from '@lucide/svelte';
	import { Button, ChoiceTile, Switch } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { SettingsSection } from '$lib/content/settings-sections';
	import {
		settings,
		updateSettings,
		resetSettings,
		type EditorView,
		type TaskView,
	} from '$lib/stores/settings.svelte';
	import { appInfo } from '$lib/app-info';
	import AppearanceSettings from '$lib/components/workspace/AppearanceSettings.svelte';
	import JournalSettings from '$lib/components/workspace/JournalSettings.svelte';
	import DockSettings from '$lib/components/workspace/DockSettings.svelte';
	import AiSettings from '$lib/components/workspace/AiSettings.svelte';
	import CloudSettings from '$lib/components/workspace/CloudSettings.svelte';
	import McpSettings from '$lib/components/workspace/McpSettings.svelte';
	import MemorySettings from '$lib/components/workspace/MemorySettings.svelte';
	import AttachmentSettings from '$lib/components/workspace/AttachmentSettings.svelte';
	import ImportMarkdownDialog from '$lib/components/workspace/ImportMarkdownDialog.svelte';

	let {
		open = false,
		initialSection = null,
		onclose,
		onexport,
		onresetdata,
		notecount,
		existingTitles = new Set<string>(),
		onimportnotes,
	}: {
		open?: boolean;
		/**
		 * Land on this section when the panel opens — a nudge deep in the app
		 * points at the setting it is about. `null` keeps the last section.
		 */
		initialSection?: SettingsSection | null;
		onclose: () => void;
		onexport: () => void;
		onresetdata: () => void;
		notecount: number;
		/** Titles already present, so the import dialog can flag conflicts (#D14). */
		existingTitles?: Set<string>;
		onimportnotes?: (
			notes: { title: string; folder: string; tags: string[]; body: string }[]
		) => Promise<boolean>;
	} = $props();

	let importOpen = $state(false);

	let section = $state<SettingsSection>('appearance');

	// Runs whenever the caller's target changes, so it also lands on the right
	// section when Settings is already open and someone asks for another one.
	$effect(() => {
		const wanted = initialSection;
		if (open && wanted) section = wanted;
	});

	const nav: { id: SettingsSection; label: string; icon: typeof Sun }[] = [
		{ id: 'appearance', label: t('settings.nav.appearance'), icon: Sun },
		{ id: 'editor', label: t('settings.nav.editor'), icon: Type },
		{ id: 'dock', label: t('settings.nav.dock'), icon: PictureInPicture2 },
		{ id: 'cloud', label: t('settings.nav.cloud'), icon: Cloud },
		{ id: 'ai', label: t('settings.nav.ai'), icon: Bot },
		{ id: 'mcp', label: t('settings.nav.mcp'), icon: Plug },
		{ id: 'memory', label: t('settings.nav.memory'), icon: Brain },
		{ id: 'journal', label: t('settings.nav.journal'), icon: CalendarDays },
		{ id: 'attachments', label: t('settings.nav.attachments'), icon: FolderOpen },
		{ id: 'data', label: t('settings.nav.data'), icon: HardDrive },
		{ id: 'about', label: t('settings.nav.about'), icon: Sparkles },
	];

	const views: { id: EditorView; label: string; icon: typeof Eye }[] = [
		{ id: 'write', label: t('settings.editor.view.write'), icon: PenLine },
		{ id: 'split', label: t('settings.editor.view.split'), icon: Columns2 },
		{ id: 'preview', label: t('settings.editor.view.preview'), icon: Eye },
	];

	const taskViews: { id: TaskView; label: string; icon: typeof Eye }[] = [
		{ id: 'write', label: t('settings.editor.view.write'), icon: PenLine },
		{ id: 'split', label: t('settings.editor.view.split'), icon: Columns2 },
		{ id: 'preview', label: t('settings.editor.view.preview'), icon: Eye },
	];

	const shortcuts = [
		{ keys: 'Ctrl K', label: t('settings.editor.shortcut.palette') },
		{ keys: 'Ctrl N', label: t('settings.editor.shortcut.newNote') },
		{ keys: 'Ctrl ,', label: t('settings.editor.shortcut.openSettings') },
		{ keys: 'Ctrl /', label: t('settings.editor.shortcut.toggleMode') },
		{ keys: 'Esc', label: t('settings.editor.shortcut.close') },
	];
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-stretch justify-end">
		<button
			class="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
			aria-label={t('settings.close')}
			onclick={onclose}
		></button>

		<aside
			class="glass-solid relative flex h-full w-full max-w-[520px] flex-col overflow-hidden rounded-l-2xl max-sm:max-w-full max-sm:rounded-l-none"
		>
			<div class="flex items-center justify-between px-5 py-4">
				<div class="flex flex-col">
					<span class="text-headline-md font-headline text-on-surface">{t('settings.title')}</span>
					<span class="text-label-sm font-label text-outline">{t('settings.subtitle')}</span>
				</div>
				<Button
					size="icon"
					shape="pill"
					variant="secondary"
					class="text-on-surface-variant"
					aria-label={t('settings.closeShort')}
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
								>{t('settings.editor.defaultView')}</span
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

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>{t('settings.editor.taskWindow')}</span
							>
							<div class="grid grid-cols-3 gap-2">
								{#each taskViews as item (item.id)}
									<ChoiceTile
										layout="stack"
										icon={item.icon}
										label={item.label}
										class="py-3"
										active={settings.taskView === item.id}
										onclick={() => updateSettings({ taskView: item.id })}
									/>
								{/each}
							</div>
						</div>

						<div class="flex flex-col gap-2">
							{#each [{ k: 'spellcheck' as const, t: 'settings.editor.spellcheck', d: 'settings.editor.spellcheckHint' }, { k: 'showWordCount' as const, t: 'settings.editor.showWordCount', d: 'settings.editor.showWordCountHint' }, { k: 'confirmDelete' as const, t: 'settings.editor.confirmDelete', d: 'settings.editor.confirmDeleteHint' }, { k: 'previewInlineEdit' as const, t: 'settings.editor.previewInlineEdit', d: 'settings.editor.previewInlineEditHint' }, { k: 'versioningEnabled' as const, t: 'settings.editor.versioningEnabled', d: 'settings.editor.versioningEnabledHint' }] as row (row.k)}
								<div
									class="flex items-center justify-between rounded-2xl bg-surface-container-lowest/30 p-3"
								>
									<span class="flex flex-col">
										<span class="text-body-md font-body text-on-surface">{t(row.t)}</span>
										<span class="text-label-sm font-label text-outline">{t(row.d)}</span>
									</span>
									<Switch
										checked={settings[row.k]}
										label={t(row.t)}
										onchange={(checked) => updateSettings({ [row.k]: checked })}
									/>
								</div>
							{/each}
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>{t('settings.editor.shortcuts')}</span
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

					{#if section === 'cloud'}
						<CloudSettings />
					{/if}

					{#if section === 'ai'}
						<AiSettings />
					{/if}

					{#if section === 'mcp'}
						<McpSettings />
					{/if}

					{#if section === 'memory'}
						<MemorySettings />
					{/if}

					{#if section === 'journal'}
						<JournalSettings />
					{/if}

					{#if section === 'attachments'}
						<AttachmentSettings />
					{/if}

					{#if section === 'data'}
						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>{t('settings.data.localStorage')}</span
							>
							<div class="glass-well flex items-center gap-3 rounded-2xl p-3">
								<div
									class="flex size-9 items-center justify-center rounded-2xl bg-tertiary-container text-on-tertiary-container"
								>
									<HardDrive size={17} />
								</div>
								<div class="flex flex-col">
									<span class="text-headline-sm font-headline text-on-surface"
										>{t('settings.data.notesStored', { count: notecount })}</span
									>
									<span class="text-label-sm font-label text-outline"
										>{t('settings.data.keptLocally')}</span
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
									<Download size={15} /> {t('settings.data.exportFolder')}
								</Button>
								{#if onimportnotes}
									<Button
										variant="secondary"
										size="lg"
										shape="tile"
										block
										class="justify-center text-label-md"
										onclick={() => (importOpen = true)}
									>
										<FileInput size={15} /> {t('settings.data.importMarkdown')}
									</Button>
								{/if}
							</div>
						</div>

						<div class="flex flex-col gap-2.5">
							<span class="text-label-sm font-label tracking-wider text-outline uppercase"
								>{t('settings.data.reset')}</span
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
										<span class="text-body-md font-body text-on-surface"
											>{t('settings.data.resetPreferences')}</span
										>
										<span class="text-label-sm font-label text-outline"
											>{t('settings.data.resetPreferencesHint')}</span
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
										<span class="text-body-md font-body text-error">{t('settings.data.resetData')}</span>
										<span class="text-label-sm font-label text-outline"
											>{t('settings.data.resetDataHint')}</span
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
								<span class="text-label-sm font-label text-outline"
									>{t('settings.about.version', { version: appInfo.version })}</span
								>
							</div>
							<p class="max-w-[300px] text-body-sm font-body leading-relaxed text-on-surface-variant">
								{appInfo.description}
							</p>
							<div
								class="glass-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-label-sm font-label text-on-surface-variant"
							>
								<ShieldCheck size={14} class="text-tertiary" />
								{t('settings.about.private')}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
		</aside>
	</div>
{/if}

{#if onimportnotes}
	<ImportMarkdownDialog
		bind:open={importOpen}
		{existingTitles}
		onimport={onimportnotes}
	/>
{/if}