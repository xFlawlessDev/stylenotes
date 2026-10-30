import { createCn } from 'cn/config';

/**
 * Typography tokens declared in `app.css` (`@theme`).
 *
 * The class merger does not know about them, so without this list it treats
 * `text-body-md` as a *text color* and drops it as soon as a real colour class
 * follows (e.g. `text-on-surface`). Registering them as font sizes keeps the
 * two independent, so variants can set size and colour separately.
 *
 * Mirrors `src/lib/cn.ts` in the desktop app: the site must merge classes
 * exactly the way the app does, or a shared component drifts.
 */
export const typographyClasses = [
	'display-lg',
	'display-sm',
	'headline-xl',
	'headline-lg',
	'headline-md',
	'headline-sm',
	'body-lg',
	'body-md',
	'body-sm',
	'label-md',
	'label-sm',
	'code-sm'
];

export const twMergeConfig = {
	extend: {
		classGroups: {
			'font-size': [{ text: typographyClasses }]
		}
	}
};

/** `cn` with StyleNotes' typography tokens registered. */
export const cn = createCn(twMergeConfig);
