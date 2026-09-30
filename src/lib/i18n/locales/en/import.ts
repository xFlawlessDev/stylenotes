/**
 * Markdown import strings (docs/design/constella-features.md #D14).
 */
export const importMarkdown = {
	title: 'Import Markdown',
	subtitle: 'Bring an Obsidian vault, a folder, or a single note into this workspace.',
	close: 'Close import',
	recursive: 'Include subfolders',
	chooseFolder: 'Choose folder',
	chooseFile: 'Choose file',
	pickFolder: 'Choose a vault or folder to import',
	pickFile: 'Choose a markdown file',
	preview: '{notes} notes · {links} wiki links · {tags} tags',
	conflicts: '{count} title already exists',
	skipped: '{count} files skipped',
	conflictPolicy: 'When a title already exists',
	policySkip: 'Keep existing',
	policyDuplicate: 'Import as new',
	cancel: 'Cancel',
	confirm: 'Import',
	error: { write: 'Could not write the imported notes' },
} as const;
