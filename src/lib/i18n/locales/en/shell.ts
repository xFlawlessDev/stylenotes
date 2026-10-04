/** Title bar, workspaces and the notifications panel. */
export const shell = {
	brand: 'StyleNotes',
	window: { hideToTray: 'Hide to tray', minimize: 'Minimize', maximize: 'Maximize' },
	section: { notes: 'Notes', tasks: 'Tasks', graph: 'Graph' },
	sectionLabel: 'Workspace section',
	commandPalette: 'Open command palette',
	searchPlaceholder: 'Search notes and actions',
	toggleAssistant: 'Toggle AI assistant',
	toggleDock: 'Toggle dock',
	toggleTheme: 'Toggle light and dark',
	openFolders: 'Open folders',
	openNotesList: 'Open notes list',
	settings: 'Settings',
	notifications: 'Notifications',
	workspace: {
		label: 'Workspace',
		manage: 'Manage workspaces…',
		manageTitle: 'Manage workspaces',
		manageDescription:
			'Workspaces keep notes and tasks apart per context. Deleting one removes everything inside it.',
		newPlaceholder: 'New workspace name',
		newLabel: 'New workspace name',
		add: 'Add',
		nameLabel: 'Workspace name',
		saveName: 'Save workspace name',
		cancelRename: 'Cancel rename',
		active: 'Active workspace',
		member: 'Workspace',
		rename: 'Rename {name}',
		delete: 'Delete {name}',
		deleteQuestion: 'Delete “{name}” and everything inside it?',
		unsavedWarning: 'This workspace has edits that are not saved yet. Deleting it now discards them.',
		unsavedNotes: 'Notes: {titles}',
		unsavedTasks: 'Tasks: {titles}',
		close: 'Close',
		activeBadge: 'Workspace: {name}',
		foreignBadge: 'Workspace: {name} (not the workspace this window follows)',
		error: {
			nameRequired: 'Give the workspace a name.',
			nameTaken: 'A workspace with that name already exists.',
			create: 'Could not create the workspace.',
			rename: 'Could not rename the workspace.',
			delete: 'Could not delete the workspace.',
		},
	},
	notification: {
		panelTitle: 'Notifications',
		newCount: '{count} new',
		markAllRead: 'Mark all read',
		allCaughtUp: 'You are all caught up.',
		clearAll: 'Clear all',
		savedLocally: 'Saved locally',
		closeNotifications: 'Close notifications',
		/** Marks a computed row: it reflects live state, not a stored event. */
		live: 'Live',
		/** Marks the stored event rows below the computed ones. */
		recent: 'Recent',
		/**
		 * Computed from live app state, never stored; see
		 * `content/notification-insights.ts`. They appear while a condition
		 * holds and vanish when it clears.
		 */
		insight: {
			tasks: {
				title: 'Daily task summary',
				body: '{overdue} overdue · {today} due today · {blocked} blocked',
			},
			indexing: {
				title: 'Indexing your notes',
				progress: 'Indexed {done} of {total} items.',
				working: 'Building the search index. This can take a moment.',
				behindTitle: 'Search index is behind',
				behindBody: '{count} items are waiting to be indexed.',
			},
			vault: {
				title: 'Vault needs a decision',
				body: '{count} file(s) changed on both sides.',
			},
			suggestions: {
				title: 'New link suggestions',
				body: '{count} notes look related. Review them in the graph.',
			},
			attachments: {
				title: 'Unused attachments',
				body: '{count} stored file(s) are no longer referenced by any note.',
			},
			journal: {
				title: 'Journal not started',
				body: "Today's entry has not been written yet.",
			},
		},
		/** Raised by the app itself; see `stores/memory-nudge.ts`. */
		memory: {
			title: 'Semantic memory is off',
			body: 'Open Settings → Memory and pick an embedder so the assistant can search your notes by meaning.',
			time: 'Just now',
		},
		/** Raised by the background update check; see `stores/update.svelte.ts`. */
		update: {
			title: 'Version {version} is available',
			body: 'A new version of StyleNotes is ready. Open Settings → About to install it.',
			time: 'Just now',
		},
	},
} as const;


