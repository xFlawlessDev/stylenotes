/** Command palette. */
export const palette = {
	placeholder: 'Search notes, tasks, folders, and actions',
	noResults: 'No results for “{query}”.',
	groups: { notes: 'Notes', tasks: 'Tasks', folders: 'Folders', actions: 'Actions' },
	hint: { navigate: 'navigate', open: 'open', close: 'close' },
	closeLabel: 'Close command palette',
	action: {
		newNote: 'New note',
		newFolder: 'New folder',
		openTasks: 'Open tasks',
		openGraph: 'Open graph',
		toggleTheme: 'Toggle light and dark',
		openSettings: 'Open settings',
		export: 'Export all notes',
	},
} as const;


