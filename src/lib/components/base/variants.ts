import { createTV } from 'tailwind-variants';
import { twMergeConfig } from '$lib/cn.js';

export { type VariantProps } from 'tailwind-variants';

/** `tv` variant builder that understands StyleNotes' typography tokens. */
export const tv = createTV({ twMergeConfig });
