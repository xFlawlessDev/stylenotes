import { el, iconMarkup, onActivate } from '$lib/content/mermaid-dom';
import { extractSvgText } from '$lib/content/mermaid-export';
import { saveDiagram, svgToPng } from '$lib/content/preview-actions';

/** Export dropdown for a diagram: vector SVG or raster PNG. */
export function createExportMenu(svg: SVGSVGElement): HTMLElement {
	const wrapper = el('div', 'mermaid-export');
	const button = el('button', 'mermaid-export-button');
	button.type = 'button';
	button.setAttribute('aria-haspopup', 'menu');
	button.setAttribute('aria-expanded', 'false');
	button.title = 'Export diagram';
	button.setAttribute('aria-label', 'Export diagram');
	button.innerHTML = `<span>Export</span>${iconMarkup('chevron', 12)}`;

	const menu = el('div', 'mermaid-export-menu');
	menu.hidden = true;
	menu.setAttribute('role', 'menu');

	const close = () => {
		menu.hidden = true;
		button.setAttribute('aria-expanded', 'false');
		document.removeEventListener('pointerdown', onOutside, true);
	};
	const onOutside = (event: Event) => {
		if (wrapper.contains(event.target as Node)) return;
		close();
	};

	for (const format of ['svg', 'png'] as const) {
		const item = el('button', 'mermaid-export-item');
		item.type = 'button';
		item.setAttribute('role', 'menuitem');
		item.textContent = `Export as ${format.toUpperCase()}`;
		onActivate(item, () => {
			close();
			void exportDiagram(svg, format, button);
		});
		menu.append(item);
	}

	onActivate(button, () => {
		const opening = menu.hidden;
		menu.hidden = !opening;
		button.setAttribute('aria-expanded', String(opening));
		if (opening) {
			// Defer so the opening click does not immediately close the menu.
			setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
		} else {
			document.removeEventListener('pointerdown', onOutside, true);
		}
	});

	wrapper.append(button, menu);
	return wrapper;
}

async function exportDiagram(svg: SVGSVGElement, format: 'svg' | 'png', button: HTMLElement) {
	const label = button.querySelector('span');
	if (!label) return;
	const original = label.textContent ?? 'Export';
	try {
		const text = extractSvgText(svg.outerHTML);
		const blob =
			format === 'svg'
				? new Blob([text], { type: 'image/svg+xml;charset=utf-8' })
				: await svgToPng(text);
		const saved = await saveDiagram(blob, `mermaid-diagram.${format}`, format);
		label.textContent = saved ? 'Saved' : original;
	} catch {
		label.textContent = 'Failed';
	}
	setTimeout(() => {
		if (button.isConnected) label.textContent = original;
	}, 1400);
}
