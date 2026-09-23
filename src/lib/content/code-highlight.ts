import { fromHighlighter } from '@shikijs/markdown-it';
import { createHighlighter, type Highlighter } from 'shiki';

/** Themes paired with the app's light/dark html classes (see layout.css). */
const THEMES = { light: 'vitesse-light', dark: 'vitesse-dark' } as const;

/** Opens a fenced code block (commonmark allows up to three spaces of indent). */
const FENCE_LINE = /^ {0,3}(?:`{3,}|~{3,})(.*)$/;

/** Languages shiki refused to load, so a note render does not retry them. */
const rejectedLanguages = new Set<string>();

let highlighterPromise: Promise<Highlighter> | undefined;

/**
 * One highlighter per window, created with just the engine and the two themes.
 * Grammars are compiled on demand by {@link loadLanguages} — loading every
 * bundled language up front blocks the main thread for seconds on window open.
 */
function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({ themes: Object.values(THEMES), langs: [] }).catch(
			(error: unknown) => {
				highlighterPromise = undefined;
				throw error;
			},
		);
	}
	return highlighterPromise;
}

/** Makes `parser` highlight fenced code with shiki. */
export async function installShiki(parser: { use: (...args: any[]) => unknown }): Promise<void> {
	parser.use(fromHighlighter(await getHighlighter(), { themes: THEMES }));
}

/** Compiles the grammars `langs` need, skipping names already loaded or not bundled. */
export async function loadLanguages(langs: string[]): Promise<void> {
	if (langs.length === 0) return;
	const highlighter = await getHighlighter();
	const loaded = new Set(highlighter.getLoadedLanguages());
	for (const lang of new Set(langs)) {
		if (loaded.has(lang) || rejectedLanguages.has(lang)) continue;
		try {
			await highlighter.loadLanguage(lang as never);
		} catch {
			// Not a language shiki bundles; its fence stays unhighlighted.
			rejectedLanguages.add(lang);
		}
	}
}

/** Language tags of the fenced code blocks in `source`, lower-cased and deduplicated. */
export function fencedLanguages(source: string): string[] {
	const langs = new Set<string>();
	for (const line of source.split('\n')) {
		const info = FENCE_LINE.exec(line)?.[1].trim();
		if (info) langs.add(info.split(/\s+/, 1)[0].toLowerCase());
	}
	return [...langs];
}
