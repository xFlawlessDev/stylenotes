/**
 * Pure journal logic (docs/design/journal.md #J1).
 *
 * A journal note is an ordinary note carrying a `journalDay` of `YYYY-MM-DD`.
 * Everything here is a pure function over strings and dates so the date
 * arithmetic is unit-testable without a DOM, a database, or a clock.
 *
 * Date handling rule for this module: the caller passes the day in, never
 * "now". "Today" is a timezone question owned by `localToday()` (#D19) — this
 * module only formats and steps days that are already resolved.
 */

/** `YYYY-MM-DD`, the same shape `dueAt` and the snapshot's `today` use. */
export const JOURNAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalDay(value: unknown): value is string {
	if (typeof value !== 'string' || !JOURNAL_DAY_PATTERN.test(value)) return false;
	// Reject a well-shaped but impossible date ("2026-02-31") by round-tripping.
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The date formats the journal title can use.
 *
 * Deliberately a closed set: a free-form pattern string would need a formatter
 * library and a parser to match, and the parser is what makes stepping days
 * reliable. A closed set means the user picks, and the app never guesses.
 */
export const JOURNAL_FORMATS = ['YYYY-MM-DD', 'YYYY/MM/DD', 'DD MMM YYYY', 'ddd, DD MMM YYYY'] as const;

export type JournalFormat = (typeof JOURNAL_FORMATS)[number];

const MONTHS_SHORT = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isJournalFormat(value: unknown): value is JournalFormat {
	return typeof value === 'string' && (JOURNAL_FORMATS as readonly string[]).includes(value);
}

/**
 * Formats a `YYYY-MM-DD` day for display as a note title.
 *
 * Locale-independent on purpose: this text becomes a note **title** that the
 * user may keep, share, or sync. Titles are persisted data, and persisted text
 * is never translated (the i18n rule), so month and weekday names stay English
 * abbreviations regardless of `settings.language`.
 */
export function formatJournalDay(day: string, format: JournalFormat = 'YYYY-MM-DD'): string {
	if (!isJournalDay(day)) return day;
	const [year, month, date] = day.split('-');
	const monthName = MONTHS_SHORT[Number(month) - 1] ?? month;
	if (format === 'YYYY/MM/DD') return `${year}/${month}/${date}`;
	if (format === 'DD MMM YYYY') return `${date} ${monthName} ${year}`;
	if (format === 'ddd, DD MMM YYYY') {
		const weekday = WEEKDAYS_SHORT[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';
		return `${weekday}, ${date} ${monthName} ${year}`;
	}
	return day;
}

/**
 * Steps a day by whole days, keeping the `YYYY-MM-DD` shape.
 *
 * Runs in UTC on purpose: stepping a local-midnight Date across a DST boundary
 * can land on 23:00 the previous day and drop a day. A `YYYY-MM-DD` day is a
 * calendar label with no time, so UTC is the correct frame to do arithmetic in.
 */
export function stepJournalDay(day: string, days: number): string {
	if (!isJournalDay(day)) return day;
	const at = new Date(`${day}T00:00:00Z`);
	at.setUTCDate(at.getUTCDate() + days);
	return at.toISOString().slice(0, 10);
}

/** Whether `day` is in the future relative to `today`. */
export function isFutureDay(day: string, today: string): boolean {
	return isJournalDay(day) && isJournalDay(today) && day > today;
}

/**
 * The title for a new journal note.
 *
 * Falls back to the day itself when the format is unknown, so a corrupt setting
 * produces a usable note rather than an "undefined" title.
 */
export function journalTitle(day: string, format: unknown): string {
	return formatJournalDay(day, isJournalFormat(format) ? format : 'YYYY-MM-DD');
}

/**
 * The body for a new journal note, with `{date}` and `{title}` substituted.
 *
 * Empty template (the default) means an empty note: the user's own format wins
 * over anything the app would invent. Substitution is deliberately minimal — no
 * conditionals, no loops — because a template language is a feature with its own
 * spec, and this only needs to save keystrokes.
 */
export function journalBody(day: string, template: string): string {
	if (!template) return '';
	return template
		.replaceAll('{date}', day)
		.replaceAll('{title}', journalTitle(day, 'ddd, DD MMM YYYY'));
}

/** Where a new journal entry is filed. A blank setting falls back to `journal`. */
export function journalFolder(folder: unknown): string {
	return typeof folder === 'string' && folder.trim() ? folder.trim() : 'journal';
}

/**
 * Days around `today` for the journal navigator, newest first.
 *
 * Bounded so the UI cannot ask for an unbounded list, and future days are
 * excluded: a journal records what happened, and offering to open tomorrow's
 * entry would only create a note nobody can fill in yet.
 */
export function recentJournalDays(today: string, count = 7): string[] {
	if (!isJournalDay(today)) return [];
	const days: string[] = [];
	for (let index = 0; index < Math.max(0, count); index += 1) {
		days.push(stepJournalDay(today, -index));
	}
	return days;
}
