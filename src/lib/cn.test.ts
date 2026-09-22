import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
	it('keeps the custom type scale independent from text colors', () => {
		expect(cn('text-body-md text-on-surface')).toBe('text-body-md text-on-surface');
		expect(cn('text-label-sm font-label text-outline uppercase')).toBe(
			'text-label-sm font-label text-outline uppercase'
		);
	});

	it('still resolves conflicts inside the type scale', () => {
		expect(cn('text-body-md', 'text-label-sm')).toBe('text-label-sm');
	});

	it('still resolves conflicts between text colors', () => {
		expect(cn('text-on-surface', 'text-error')).toBe('text-error');
	});

	it('lets later utilities win', () => {
		expect(cn('glass-well h-9 rounded-xl', 'h-7 rounded-full')).toBe('glass-well h-7 rounded-full');
	});
});
