/** Indonesian locale. Typed against the English bundle. */
import type { Messages } from '$lib/i18n/locales/en';
import { ai } from './ai';import { common } from './common';
import { dialogs } from './dialogs';
import { editor } from './editor';
import { graph } from './graph';
import { notes } from './notes';
import { over } from './overlay';
import { palette } from './palette';
import { settings } from './settings';
import { shell } from './shell';
import { tasks } from './tasks';

export const id: Messages = {
	common,
	shell,
	notes,
	tasks,
	over,
	graph,
	palette,
	dialogs,
	editor,
	settings,
	ai,
};
