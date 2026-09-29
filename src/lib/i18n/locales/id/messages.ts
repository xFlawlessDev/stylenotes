/**
 * Per-section message types, derived from the English bundle.
 *
 * A translator imports only the type it needs (`NotesMessages`) so a locale
 * file is checked against the exact English shape: a missing key or a renamed
 * one fails `bun run check` instead of silently falling back at runtime.
 */
import type { Messages } from '$lib/i18n/locales/en';

export type AiMessages = Messages['ai'];
export type CommonMessages = Messages['common'];
export type DialogMessages = Messages['dialogs'];
export type EditorMessages = Messages['editor'];
export type GraphMessages = Messages['graph'];
export type NotesMessages = Messages['notes'];
export type OverlayMessages = Messages['over'];
export type PaletteMessages = Messages['palette'];
export type SettingsMessages = Messages['settings'];
export type ShellMessages = Messages['shell'];
export type TasksMessages = Messages['tasks'];
