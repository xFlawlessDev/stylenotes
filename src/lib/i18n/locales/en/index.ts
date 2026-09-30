/**
 * English locale: the reference bundle. Every other locale is typed against
 * `Messages`, so a missing key is a compile error, not a runtime fallback.
 */
import { ai } from './ai';
import { common } from './common';
import { dialogs } from './dialogs';
import { editor } from './editor';
import { graph } from './graph';
import { importMarkdown } from './import';
import { notes } from './notes';
import { over } from './overlay';
import { palette } from './palette';
import { settings } from './settings';
import { shell } from './shell';
import { tasks } from './tasks';

/**
 * Widens a locale tree's literal types to `string` while keeping its exact
 * shape. Without it `as const` would demand the identical literal in every
 * language, which is the opposite of a translation.
 */
export type DeepString<T> = T extends string
	? string
	: T extends readonly (infer U)[]
		? DeepString<U>[]
		: T extends object
			? { [K in keyof T]: DeepString<T[K]> }
			: T;

export const en = {
	common,
	shell,
	notes,
	tasks,
	over,
	graph,
	importMarkdown,
	palette,
	dialogs,
	editor,
	settings,
	ai,
} as const;

export type Messages = DeepString<typeof en>;
