/**
 * The sections the Settings panel can be opened at.
 *
 * Kept out of `SettingsPanel.svelte` so the controller can ask for one — a
 * nudge deep in the chat hands the user a Settings page already sitting on
 * the section that explains it, instead of one they have to hunt through the
 * nav for.
 */
export type SettingsSection =
	| 'appearance'
	| 'editor'
	| 'dock'
	| 'ai'
	| 'mcp'
	| 'memory'
	| 'journal'
	| 'attachments'
	| 'data'
	| 'about';
