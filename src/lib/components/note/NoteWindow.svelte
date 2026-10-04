<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { emitTo, listen } from '@tauri-apps/api/event';
	import { NotebookPen, History } from '@lucide/svelte';
	import { createNote, type Note } from '$lib/content/content';
	import { t } from '$lib/i18n/index.svelte';
	import type { WikiClick, WikiEntity } from '$lib/content/wiki-links';
	import { planWikiClick } from '$lib/content/wiki-navigation';
	import { NOTE_HEADING_EVENT, NOTE_WINDOW_PREFIX, openNoteWindow, openTaskInWorkspace } from '$lib/windows';
	import type { Task } from '$lib/stores/tasks';
	import { listAllTasks } from '$lib/stores/tasks.svelte';
	import AmbiguousWikiDialog from '$lib/components/dialogs/AmbiguousWikiDialog.svelte';
	import RecordHistoryDialog from '$lib/components/dialogs/RecordHistoryDialog.svelte';
	import type { EntityVersion } from '$lib/content/version-types';
	import {
		applyNotePatch,
		foldersFor,
		listNotes,
		loadFolders,
		listAllNotes,
		NOTES_CHANGED,
		persistNote,
		type CustomFolder,
		type NotePatch,
		type NotesChangedPayload
	} from '$lib/stores/notes';
	import { createSaveQueue } from '$lib/stores/save-queue.svelte';
	import { registerQuitFlush } from '$lib/stores/quit-flush';
	import { captureNoteVersion, captureAttachmentVersion, notePatchFromVersion } from '$lib/content/note-versioning';
	import { attachmentReferencesChanged } from '$lib/content/attachment-manager';
	import { setPendingEdit } from '$lib/stores/mcp-pending-edits';
	import {
		applySettingsSnapshot,
		hydrateSettings,
		settings,
		SETTINGS_CHANGED,
		updateSettings,
		type EditorView,
		type Settings
	} from '$lib/stores/settings.svelte';
	import { currentNoteId, isTauri, revealAndFocusCurrentWindow } from '$lib/windows';
	import { hydrateWorkspaces, workspaceStore } from '$lib/stores/workspaces.svelte';
	import { startWorkspaceSync, workspaceLookup } from '$lib/workspace-sync.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';
	import DetailWindowHeader from '$lib/components/detail/DetailWindowHeader.svelte';
	import NoteBodyEditor from '$lib/components/note/NoteBodyEditor.svelte';
	import NoteTags from '$lib/components/note/NoteTags.svelte';
	import NoteViewSwitcher from '$lib/components/note/NoteViewSwitcher.svelte';
	import { Button, EmptyState, Input, Select } from '$lib/components/base';

	const noteId = currentNoteId();

	let note = $state<Note | null>(null);
	let notes = $state<Note[]>([]);
	let tasks = $state<Task[]>([]);
	let customFolders = $state<CustomFolder[]>([]);
	let loaded = $state(false);
	let revealed = $state(false);
	let title = $state('');
	let folder = $state('personal');
	let view = $state<EditorView>('write');
	let closing = false;
	let historyOpen = $state(false);
	let candidateEntities = $state<WikiEntity[]>([]);
	let candidatesOpen = $state(false);
	let pendingHeading = $state<string | null>(null);
	let requestedHeading = $state<string | null>(null);

	const queue = createSaveQueue<Note>(persistNote);
	const folderOptions = $derived(
		foldersFor(notes, customFolders)
			.filter((item) => item.id !== 'all')
			.map((item) => ({ value: item.id, label: item.label }))
	);
	/** The window is universal: the badge names the note's own workspace. */
	const noteWorkspace = $derived(workspaceLookup()(note?.workspaceId));
	const foreignWorkspace = $derived(
		!!note && (note.workspaceId ?? 'workspace-default') !== workspaceStore.activeId
	);

	$effect(() => {
		title = note?.title ?? '';
		folder = note?.folder ?? 'personal';
	});

	// Publish the unsaved-edit state so the MCP host can refuse to overwrite it (#D4).
	$effect(() => {
		if (!noteId) return;
		setPendingEdit('note', noteId, queue.state.dirty);
		return () => setPendingEdit('note', noteId, false);
	});

	$effect(() => {
		if (!requestedHeading || !loaded) return;
		const heading = requestedHeading;
		void (async () => {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			document.getElementById(heading)?.scrollIntoView();
			requestedHeading = null;
		})();
	});

	async function load() {
		const [allNotes, allTasks] = await Promise.all([listAllNotes(), listAllTasks()]);
		const found = allNotes.find((item) => item.id === noteId) ?? null;
		const [storedNotes, storedFolders] = await Promise.all([
			listNotes(found?.workspaceId),
			loadFolders(found?.workspaceId),
		]);
		notes = storedNotes;
		customFolders = storedFolders;
		const workspaceId = found?.workspaceId ?? 'workspace-default';
		tasks = allTasks.filter((task) => (task.workspaceId ?? 'workspace-default') === workspaceId);
		if (found && !loaded) {
			view = found.body.trim() ? settings.editorView : 'write';
			loaded = true;
		}
		note = found;
	}

	function update(patch: NotePatch) {
		const current = note;
		if (!current) return;
		const next = applyNotePatch(current, patch);
		note = next;
		// History is best-effort and must never block or fail the actual save;
		// the pre-image is `current` (the state before this edit). A body edit
		// that changes the attachments referenced always earns a version.
		if (settings.versioningEnabled) {
			if (patch.body !== undefined && attachmentReferencesChanged(current.body, patch.body)) {
				captureAttachmentVersion(current);
			} else {
				captureNoteVersion(current);
			}
		}
		queue.enqueue(next);
	}

	/** Restores a saved version through the normal save path, so it is itself versioned. */
	function restoreVersion(version: EntityVersion) {
		update(notePatchFromVersion(version));
	}

	function showAmbiguous(entities: WikiEntity[], heading: string | null) {		candidateEntities = entities;
		pendingHeading = heading;
		candidatesOpen = entities.length > 0;
	}

	async function openWikiTarget(entity: WikiEntity, heading: string | null) {
		await queue.flush();
		if (entity.kind === 'task') {
			await openTaskInWorkspace(entity.id);
			return;
		}
		if (!isTauri && entity.id === note?.id) return;
		if (entity.id === note?.id) {
			if (heading) document.getElementById(heading)?.scrollIntoView();
			return;
		}
		await openNoteWindow(entity.id);
		if (heading) await emitTo(`${NOTE_WINDOW_PREFIX}${entity.id}`, NOTE_HEADING_EVENT, { heading });
	}

	async function handleWikiClick(click: WikiClick) {
		const current = note;
		if (!current) return;
		const plan = planWikiClick(click, current, notes, customFolders, tasks);
		if (!plan) return;
		if (plan.status === 'open') {
			await openWikiTarget(plan.entity, plan.heading);
			return;
		}
		if (plan.status === 'choose') {
			showAmbiguous(plan.entities, plan.heading);
			return;
		}
		const created = createNote({
			title: plan.title,
			folder: plan.folder,
			workspaceId: current.workspaceId,
		});
		if (!(await persistNote(created))) return;
		notes = [created, ...notes];
		await openWikiTarget({ ...created, kind: 'note' }, plan.heading);
	}

	function toggleDock() {
		if (!note) return;
		update({ overlay: !note.overlay });
	}

	function toggleAlwaysOnTop() {
		updateSettings({ detailAlwaysOnTop: !settings.detailAlwaysOnTop });
	}

	async function applyAlwaysOnTop(value: boolean) {
		if (!isTauri) return;
		try {
			await getCurrentWindow().setAlwaysOnTop(value);
		} catch {
			/* the platform may refuse; the setting stays authoritative */
		}
	}

	async function minimize() {
		if (!isTauri) return;
		try {
			await getCurrentWindow().minimize();
		} catch {
			/* already minimized */
		}
	}

	async function closeWindow() {
		if (closing) return;
		closing = true;
		await queue.flush();
		if (!isTauri) return;
		try {
			await getCurrentWindow().destroy();
		} catch {
			/* already closed */
		}
	}

	onMount(() => {
		const unlisteners: (() => void)[] = [];
		let disposed = false;

		void (async () => {
			await hydrateWorkspaces();
			await startWorkspaceSync();
			await hydrateSettings();
			await load();
			await applyAlwaysOnTop(settings.detailAlwaysOnTop);
			if (disposed) return;
			// Reveal directly: a hidden macOS WKWebView throttles
			// `requestAnimationFrame`, so gating the reveal only on rAF can
			// leave the window permanently hidden. Re-assert focus after paint.
			await revealAndFocusCurrentWindow();
			if (!disposed) revealed = true;
			requestAnimationFrame(() => {
				void revealAndFocusCurrentWindow();
			});
		})();

		if (!isTauri) return;

		void listen<NotesChangedPayload>(NOTES_CHANGED, (event) => {
			if (event.payload?.source === getCurrentWindow().label) return;
			if (!queue.state.dirty) void load();
		}).then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		void listen<Settings>(SETTINGS_CHANGED, (event) => {
			applySettingsSnapshot(event.payload);
			void applyAlwaysOnTop(settings.detailAlwaysOnTop);
		}).then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		void listen<{ heading: string }>(NOTE_HEADING_EVENT, (event) => {
			requestedHeading = event.payload.heading;
		}).then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		// Flush before the app quits, so the last edit is not lost. Settings are
		// flushed by the layout's own handler in this same window.
		void registerQuitFlush(() => queue.flush()).then((fn) =>
			disposed ? fn() : unlisteners.push(fn)
		);

		void getCurrentWindow()
			.onCloseRequested((event) => {
				if (closing) return;
				event.preventDefault();
				void closeWindow();
			})
			.then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		return () => {
			disposed = true;
			for (const off of unlisteners) off();
		};
	});
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-surface">
	<DetailWindowHeader
		{title}
		fallbackTitle="Untitled note"
		icon={NotebookPen}
		saving={queue.state.saving}
		saveFailed={queue.state.failed}
		docked={note?.overlay ?? false}
		alwaysOnTop={settings.detailAlwaysOnTop}
		ontoggledock={toggleDock}
		ontoggletop={toggleAlwaysOnTop}
		onminimize={minimize}
		onclose={closeWindow}
	>
		{#snippet actions()}
			<NoteViewSwitcher {view} onview={(next) => (view = next)} />
			{#if note && settings.versioningEnabled}
				<Button
					bare
					class="size-6 rounded-md text-on-surface-variant hover:bg-surface-container/70 hover:text-on-surface"
					aria-label={t('notes.editor.versionHistory')}
					onclick={() => (historyOpen = true)}
				>
					<History size={13} />
				</Button>
			{/if}
		{/snippet}
	</DetailWindowHeader>

	{#if note}
		<div class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-1.5 p-2.5 pt-2">
			<Input
				variant="bare"
				size="sm"
				class="shrink-0 px-1.5 font-headline text-headline-sm font-bold tracking-tight placeholder:text-outline/60"
				placeholder={t('notes.editor.titlePlaceholder')}
				aria-label={t('notes.editor.titleLabel')}
				bind:value={title}
				oninput={() => update({ title })}
			/>
			<div class="flex shrink-0 items-center gap-2 px-1.5">
				<WorkspaceBadge
					name={noteWorkspace.name}
					color={noteWorkspace.color}
					foreign={foreignWorkspace}
				/>
				<Select
					size="sm"
					label={t('notes.editor.noteFolder')}
					class="w-[136px] px-2 font-code text-code-sm"
					options={folderOptions}
					bind:value={folder}
					onchange={(next) => update({ folder: next })}
				/>
			</div>
			<div class="shrink-0 px-1.5">
				<NoteTags tags={note.tags} onchange={(tags) => update({ tags })} />
			</div>
			<NoteBodyEditor
				body={note.body}
				{view}
				{note}
				{notes}
				{tasks}
				folders={customFolders}
				autofocus={revealed}
				onwikilink={handleWikiClick}
				onchange={(body) => update({ body })}
			/>
			<footer class="shrink-0 px-1.5 text-code-sm font-code text-outline">
				<span>{t('editor.status.wordsChars', { words: note.words, chars: note.chars })}</span>
			</footer>
		</div>
	{:else}
		<EmptyState
			size="md"
			icon={NotebookPen}
			heading={t('notes.editor.unavailable')}
			title={t('notes.editor.unavailableHint')}
			class="gap-3"
		>
			<Button
				variant="secondary"
				size="md"
				class="px-3 text-label-md text-on-surface-variant hover:text-on-surface"
				onclick={closeWindow}
			>
				{t('notes.editor.closeWindow')}
			</Button>
		</EmptyState>
	{/if}
	<AmbiguousWikiDialog
		bind:open={candidatesOpen}
		entities={candidateEntities}
		heading={pendingHeading}
		onselect={(entity, heading) => void openWikiTarget(entity, heading)}
	/>
	{#if note}
		<RecordHistoryDialog
			bind:open={historyOpen}
			entity="note"
			entityId={note.id}
			onrestore={restoreVersion}
		/>
	{/if}
</div>
