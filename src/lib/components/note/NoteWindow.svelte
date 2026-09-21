<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import { NotebookPen } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import {
		applyNotePatch,
		foldersFor,
		listNotes,
		loadFolders,
		NOTES_CHANGED,
		persistNote,
		type CustomFolder,
		type NotePatch,
		type NotesChangedPayload
	} from '$lib/stores/notes';
	import { createSaveQueue } from '$lib/stores/save-queue.svelte';
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
	import DetailWindowHeader from '$lib/components/detail/DetailWindowHeader.svelte';
	import NoteBodyEditor from '$lib/components/note/NoteBodyEditor.svelte';
	import NoteViewSwitcher from '$lib/components/note/NoteViewSwitcher.svelte';
	import SelectField from '$lib/components/fields/SelectField.svelte';

	const noteId = currentNoteId();

	let note = $state<Note | null>(null);
	let notes = $state<Note[]>([]);
	let customFolders = $state<CustomFolder[]>([]);
	let loaded = $state(false);
	let revealed = $state(false);
	let title = $state('');
	let folder = $state('personal');
	let view = $state<EditorView>('write');
	let closing = false;

	const queue = createSaveQueue<Note>(persistNote);
	const folderOptions = $derived(
		foldersFor(notes, customFolders)
			.filter((item) => item.id !== 'all')
			.map((item) => ({ value: item.id, label: item.label }))
	);

	$effect(() => {
		title = note?.title ?? '';
		folder = note?.folder ?? 'personal';
	});

	async function load() {
		const [storedNotes, storedFolders] = await Promise.all([listNotes(), loadFolders()]);
		notes = storedNotes;
		customFolders = storedFolders;
		const found = storedNotes.find((item) => item.id === noteId) ?? null;
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
		queue.enqueue(next);
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
			await hydrateSettings();
			await load();
			await applyAlwaysOnTop(settings.detailAlwaysOnTop);
			if (disposed) return;
			requestAnimationFrame(() => {
				void (async () => {
					await revealAndFocusCurrentWindow();
					if (!disposed) revealed = true;
				})();
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
		{/snippet}
	</DetailWindowHeader>

	{#if note}
		<div class="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5 pt-2">
			<input
				class="w-full shrink-0 bg-transparent px-1.5 text-headline-sm font-headline font-bold tracking-tight text-on-surface placeholder:text-outline/60 focus:outline-none"
				type="text"
				placeholder="Untitled note"
				aria-label="Note title"
				bind:value={title}
				oninput={() => update({ title })}
			/>
			<div class="flex shrink-0 items-center gap-2 px-1.5">
				<SelectField
					size="sm"
					label="Note folder"
					class="h-7 w-[136px] px-2 text-code-sm font-code"
					options={folderOptions}
					bind:value={folder}
					onchange={(next) => update({ folder: next })}
				/>
				{#if note.tags.length}
					<span class="min-w-0 truncate text-code-sm font-code text-outline">
						{note.tags.map((tag) => `#${tag}`).join(' ')}
					</span>
				{/if}
			</div>
			<NoteBodyEditor
				body={note.body}
				{view}
				autofocus={revealed}
				onchange={(body) => update({ body })}
			/>
			<footer class="shrink-0 px-1.5 text-code-sm font-code text-outline">
				<span>{note.words} words · {note.chars} chars</span>
			</footer>
		</div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
			<div class="glass-well flex size-12 items-center justify-center rounded-2xl text-outline">
				<NotebookPen size={22} />
			</div>
			<div class="flex flex-col gap-1">
				<h2 class="text-headline-sm font-headline text-on-surface">Note unavailable</h2>
				<p class="text-body-sm font-body text-outline">
					This note was deleted or could not be loaded.
				</p>
			</div>
			<button
				type="button"
				class="glass-chip rounded-xl px-3 py-1.5 text-label-md font-label text-on-surface-variant transition-colors hover:text-on-surface"
				onclick={closeWindow}
			>
				Close window
			</button>
		</div>
	{/if}
</div>
