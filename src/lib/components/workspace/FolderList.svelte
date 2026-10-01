<script lang="ts">
	import { Boxes } from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';
	import { defaultFolderIcons, resolveFolderIcon } from '$lib/content/folder-icons';
	import { isCustomFolder } from '$lib/stores/notes';
	import { t } from '$lib/i18n/index.svelte';
	import { pointerReorder } from '$lib/content/pointer-reorder';
	import FolderRow from '$lib/components/workspace/FolderRow.svelte';

	/**
	 * The folder list of the notes rail: selectable, renameable, reorderable.
	 *
	 * This is the part of the rail a caller would not want to rebuild, so it owns
	 * the reorder gesture and the inline-edit state that goes with it.
	 */
	let {
		folders,
		active,
		onselect,
		onrenamefolder,
		onfoldericon,
		ondeletedfolder,
		onreorder,
	}: {
		folders: Folder[];
		active: string;
		onselect: (id: string) => void;
		onrenamefolder?: (id: string, label: string) => void;
		onfoldericon?: (id: string, icon: string) => void;
		ondeletedfolder?: (id: string) => void;
		onreorder?: (fromId: string, toId: string) => void;
	} = $props();

	let editingId = $state<string | null>(null);
	let draggingId = $state<string | null>(null);
	let overId = $state<string | null>(null);

	const reorder = (node: HTMLElement) =>
		pointerReorder(node, {
			handleSelector: '[data-folder-handle]',
			idAttribute: 'data-folder-id',
			onStart: (id) => {
				if (id === 'all' || !onreorder) return;
				draggingId = id;
			},
			onMove: (id) => (overId = id),
			onEnd: () => {
				if (draggingId && overId && draggingId !== overId) onreorder?.(draggingId, overId);
				draggingId = null;
				overId = null;
			},
		});

	const tone: Record<string, string> = {
		primary: 'text-primary',
		secondary: 'text-secondary',
		tertiary: 'text-tertiary',
		sky: 'text-secondary',
		violet: 'text-tertiary',
		outline: 'text-outline',
	};

	function iconFor(folder: Folder) {
		return resolveFolderIcon(folder.icon) ?? defaultFolderIcons[folder.id] ?? Boxes;
	}
</script>

<nav class="flex flex-col gap-0.5" aria-label={t('notes.folders')} use:reorder>
	{#each folders as folder (folder.id)}
		<FolderRow
			{folder}
			active={active === folder.id}
			editing={editingId === folder.id}
			icon={iconFor(folder)}
			toneClass={tone[folder.tone]}
			draggable={folder.id !== 'all' && !!onreorder}
			deletable={isCustomFolder(folder.id)}
			dragging={draggingId === folder.id}
			dropping={overId === folder.id}
			onselect={() => onselect(folder.id)}
			onedit={folder.id === 'all'
				? undefined
				: () => {
						editingId = editingId === folder.id ? null : folder.id;
					}}
			onrename={(label) => {
				onrenamefolder?.(folder.id, label);
				editingId = null;
			}}
			onicon={(icon) => onfoldericon?.(folder.id, icon)}
			ondelete={() => {
				ondeletedfolder?.(folder.id);
				editingId = null;
			}}
		/>
	{/each}
</nav>
