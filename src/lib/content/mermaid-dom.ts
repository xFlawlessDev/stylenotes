/** Minimal DOM builders shared by the Mermaid viewer pieces. */

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	return node;
}

export type IconName = 'maximize' | 'close' | 'plus' | 'minus' | 'fit' | 'reset' | 'chevron';

/** Inline Lucide-ish icon paths, sized for the viewer chrome. */
const ICONS: Record<IconName, { path: string; extra: string }> = {
	maximize: {
		path: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
		extra: '',
	},
	close: { path: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', extra: '' },
	plus: {
		path: '<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>',
		extra: '',
	},
	minus: { path: '<line x1="5" x2="19" y1="12" y2="12"/>', extra: '' },
	fit: {
		path: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
		extra: '',
	},
	reset: {
		path: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
		extra: '',
	},
	chevron: { path: '<path d="m6 9 6 6 6-6"/>', extra: 'width="12" height="12"' },
};

export function iconMarkup(name: IconName, size = 14): string {
	const { path, extra } = ICONS[name];
	const sizeAttr = extra || `width="${size}" height="${size}"`;
	return `<svg viewBox="0 0 24 24" ${sizeAttr} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Icon-only button with an accessible label everywhere. */
export function iconButton(name: IconName, label: string, size = 14): HTMLButtonElement {
	const button = el('button', 'mermaid-icon-button');
	button.type = 'button';
	button.title = label;
	button.setAttribute('aria-label', label);
	button.innerHTML = iconMarkup(name, size);
	return button;
}

/** Wires a click handler that never bubbles into the preview's own actions. */
export function onActivate(node: HTMLElement, handler: () => void) {
	node.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		handler();
	});
}
