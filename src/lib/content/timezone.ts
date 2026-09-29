/**
 * Timezone resolution for the assistant's "current time".
 *
 * `settings.timezone` holds an IANA zone (`'Asia/Jakarta'`) or an empty string
 * for "automatic", which resolves to whatever the OS reports. The chosen zone
 * is turned into an exact wall clock sent with every AI request, so the model
 * sees the user's time rather than UTC.
 *
 * Pure and framework-free: it reads `Intl` and the clock through parameters,
 * so the formatting is unit-testable without a browser.
 */
import { currentLocale, tFor } from '$lib/i18n/index.svelte';

/** Settings value meaning "follow the operating system's zone". */
export const AUTO_TIMEZONE = '';

/**
 * Zones offered in the picker. Curated, not exhaustive: every entry is a place
 * a user is likely to be, and the list stays short enough to scan. Add one here
 * rather than generating all 400+ IANA zones.
 */
const CURATED_TIMEZONES = [
	'Pacific/Honolulu',
	'America/Anchorage',
	'America/Los_Angeles',
	'America/Denver',
	'America/Chicago',
	'America/New_York',
	'America/Phoenix',
	'America/Toronto',
	'America/Mexico_City',
	'America/Bogota',
	'America/Sao_Paulo',
	'America/Argentina/Buenos_Aires',
	'Atlantic/Reykjavik',
	'Europe/London',
	'Europe/Dublin',
	'Europe/Lisbon',
	'Europe/Madrid',
	'Europe/Paris',
	'Europe/Amsterdam',
	'Europe/Berlin',
	'Europe/Zurich',
	'Europe/Rome',
	'Europe/Vienna',
	'Europe/Prague',
	'Europe/Warsaw',
	'Europe/Stockholm',
	'Europe/Oslo',
	'Europe/Copenhagen',
	'Europe/Helsinki',
	'Europe/Athens',
	'Europe/Bucharest',
	'Europe/Istanbul',
	'Europe/Kyiv',
	'Europe/Moscow',
	'Africa/Casablanca',
	'Africa/Lagos',
	'Africa/Cairo',
	'Africa/Johannesburg',
	'Africa/Nairobi',
	'Asia/Jerusalem',
	'Asia/Riyadh',
	'Asia/Tehran',
	'Asia/Dubai',
	'Asia/Karachi',
	'Asia/Kolkata',
	'Asia/Kathmandu',
	'Asia/Dhaka',
	'Asia/Yangon',
	'Asia/Bangkok',
	'Asia/Jakarta',
	'Asia/Makassar',
	'Asia/Jayapura',
	'Asia/Singapore',
	'Asia/Kuala_Lumpur',
	'Asia/Manila',
	'Asia/Hong_Kong',
	'Asia/Shanghai',
	'Asia/Taipei',
	'Asia/Seoul',
	'Asia/Tokyo',
	'Australia/Perth',
	'Australia/Adelaide',
	'Australia/Brisbane',
	'Australia/Sydney',
	'Pacific/Auckland',
	'UTC',
] as const;

let resolvedZone: string | null = null;

/**
 * The system's IANA zone, resolved once from `Intl`. Returns an empty string
 * when the runtime cannot report one.
 */
export function systemTimezone(): string {
	if (resolvedZone !== null) return resolvedZone;
	try {
		resolvedZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
	} catch {
		resolvedZone = '';
	}
	return resolvedZone;
}

/**
 * The zone to format with: the explicit setting, the system zone, or UTC as a
 * last resort (never an empty string, which browsers reject as a `timeZone`).
 */
export function effectiveTimezone(preference: string): string {
	const chosen = preference.trim();
	if (chosen) return chosen;
	return systemTimezone() || 'UTC';
}

/** `UTC+07:00` for a zone at an instant; `UTC` for a zone with no offset. */
export function formatOffset(zone: string, date: Date): string {
	try {
		const formatted = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			timeZoneName: 'longOffset',
		}).format(date);
		const suffix = formatted.split(' ').at(-1) ?? '';
		// `longOffset` yields "GMT+07:00" and "GMT+00:00" for zero.
		if (suffix === 'GMT' || suffix === 'GMT+00:00') return 'UTC';
		return suffix.replace('GMT', 'UTC');
	} catch {
		return 'UTC';
	}
}

/**
 * Formats an instant as `YYYY-MM-DD HH:MM:SS UTC+07:00` in `zone`.
 *
 * Built from `en-US` `formatToParts` rather than `sv-SE`, so the numeric
 * year/month/day fields are the same everywhere.
 */
export function formatTimestampInZone(date: Date, zone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(date);
	const at = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? '00';
	// `hourCycle: h23` keeps midnight at 00 rather than 24 in some engines.
	const hour = at('hour') === '24' ? '00' : at('hour');
	return `${at('year')}-${at('month')}-${at('day')} ${hour}:${at('minute')}:${at('second')} ${formatOffset(zone, date)}`;
}

/**
 * Short label for a zone: `City (UTC+07:00)`. The city part comes from
 * `Intl.DisplayNames` in the UI language, falling back to the zone id.
 */
export function timezoneLabel(preference: string, date: Date, localeTag: string): string {
	const zone = effectiveTimezone(preference);
	return `${timezoneDisplayName(zone, localeTag)} (${formatOffset(zone, date)})`;
}

/** Display name for a zone id, falling back to the id itself. */
export function timezoneDisplayName(zone: string, localeTag: string): string {
	if (zone === 'UTC') return 'UTC';
	try {
		const display = new Intl.DisplayNames(localeTag, { type: 'timeZone' as 'language' });
		return display.of(zone) ?? zone;
	} catch {
		return zone.split('/').at(-1)?.replace(/_/g, ' ') ?? zone;
	}
}

/** Options for `Settings → Appearance`, `{ value, label }` for `<Select>`. */
export function timezoneOptions(
	date: Date,
	localeTag: string,
	labels: { automatic: string }
): { value: string; label: string }[] {
	const options = [
		{
			value: AUTO_TIMEZONE,
			label: `${labels.automatic} (${formatOffset(effectiveTimezone(AUTO_TIMEZONE), date)})`,
		},
	];
	for (const zone of CURATED_TIMEZONES) {
		options.push({
			value: zone,
			label: `${timezoneDisplayName(zone, localeTag)} (${formatOffset(zone, date)})`,
		});
	}
	return options;
}
