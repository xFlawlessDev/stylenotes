/** Workspace graph page, canvas and drawer. */
export const graph = {
	pageTitle: 'Workspace graph',
	pageStats: '{notes} notes · {tasks} tasks · {links} links',
	highlightPlaceholder: 'Highlight nodes',
	highlightLabel: 'Highlight graph nodes',
	emptyHeading: 'Nothing to graph yet',
	emptyTitle: 'Create a note or task in this workspace to see it here.',
	nodes: 'Nodes',
	links: 'Links',
	node: { note: 'Note', task: 'Task' },
	edge: { wiki: 'Wiki links', link: 'Linked note', dependency: 'Dependencies' },
	fitView: 'Fit view',
	statusIdle: 'Hover a node to inspect links · drag nodes to move · scroll to zoom',
	statusActive: '{kind} · {title} · {count} link',
	statusActivePlural: '{kind} · {title} · {count} links',
	drawer: {
		title: 'Node details',
		close: 'Close details',
		connections: 'Connections',
		connectionOne: '{count} connection',
		connectionMany: '{count} connections',
		isolated: 'No links yet — this node is isolated in the graph.',
		open: 'Open {title}',
		openNote: 'Open note',
		openTask: 'Open task',
	},
	canvas: { ariaLabel: 'Force-directed graph canvas' },
	failed: 'Could not render the graph on this device.',
	layingOut: 'Laying out the graph…',
} as const;


