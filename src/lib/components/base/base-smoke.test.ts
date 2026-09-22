import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import Button from './button.svelte';
import ChoiceTile from './choice-tile.svelte';
import ColorField from './color-field.svelte';
import EmptyState from './empty-state.svelte';
import Field from './field.svelte';
import Input from './input.svelte';
import SearchInput from './search-input.svelte';
import SegmentedControl from './segmented-control.svelte';
import Select from './select.svelte';
import Slider from './slider.svelte';
import Switch from './switch.svelte';
import Textarea from './textarea.svelte';

const noop = () => {};
const label = createRawSnippet(() => ({ render: () => '<span>Label</span>' }));

function mountInto(component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const app = mount(component as any, { target, props });
	flushSync();
	return { target, app };
}

describe('base components', () => {
	it('mounts every primitive with realistic props', () => {
		const cases: [string, unknown, Record<string, unknown>][] = [
			['Button', Button, { variant: 'primary', children: label }],
			['Button bare', Button, { bare: true, children: label }],
			['Input', Input, { placeholder: 'Text', value: 'a' }],
			['Input bare', Input, { variant: 'bare', size: 'none', value: 'a' }],
			['Textarea', Textarea, { placeholder: 'Text', value: 'a' }],
			['Field', Field, { label: 'Field', for: 'x', children: label }],
			['Switch', Switch, { checked: true, label: 'Toggle', onchange: noop }],
			['Slider', Slider, { value: 4, label: 'Size', oninput: noop }],
			['ColorField', ColorField, { value: '#a8c7e8', label: 'Accent', onchange: noop }],
			[
				'Select',
				Select,
				{
					value: 'a',
					options: [
						{ value: 'a', label: 'A' },
						{ value: 'b', label: 'B' }
					],
					label: 'Pick',
					onchange: noop
				}
			],
			[
				'SegmentedControl',
				SegmentedControl,
				{ value: 'a', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], onchange: noop }
			],
			['ChoiceTile', ChoiceTile, { label: 'Tile', active: true, onclick: noop }],
			['EmptyState', EmptyState, { title: 'Nothing here' }],
			['SearchInput', SearchInput, { value: '', placeholder: 'Search', onquery: noop }]
		];

		for (const [name, component, props] of cases) {
			const { target, app } = mountInto(component, props);
			expect(target.children.length, name).toBeGreaterThan(0);
			unmount(app);
			target.remove();
		}
	});

	it('keeps the shared button layout on every variant', () => {
		const variants = ['primary', 'secondary', 'tonal', 'soft', 'ghost', 'outline', 'danger'];
		for (const variant of variants) {
			const { target, app } = mountInto(Button, { variant, children: label });
			const button = target.querySelector('button');
			expect(button?.className, variant).toContain('inline-flex');
			expect(button?.className, variant).toContain('items-center');
			unmount(app);
			target.remove();
		}
	});

	it('renders switches as an accessible toggle', () => {
		const { target, app } = mountInto(Switch, { checked: true, label: 'Reduce motion' });
		const button = target.querySelector('button');
		expect(button?.getAttribute('role')).toBe('switch');
		expect(button?.getAttribute('aria-checked')).toBe('true');
		expect(button?.getAttribute('aria-label')).toBe('Reduce motion');
		unmount(app);
		target.remove();
	});

	it('sizes choice tiles to their content', () => {
		// A fixed height would let flex-shrink squash swatches and icons.
		const { target, app } = mountInto(ChoiceTile, { label: 'Tile', children: label });
		expect(target.querySelector('button')?.className).toContain('h-auto');
		unmount(app);
		target.remove();
	});

	it('labels a select whose selected option has an empty value', () => {
		const { target, app } = mountInto(Select, {
			value: '',
			label: 'Typeface',
			options: [
				{ value: '', label: 'Theme default (Inter)' },
				{ value: 'serif', label: 'Serif' }
			],
			onchange: noop
		});
		expect(target.textContent).toContain('Theme default (Inter)');
		unmount(app);
		target.remove();
	});
});
