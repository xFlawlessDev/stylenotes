import DOMPurify from 'dompurify';
import { addMermaidDownloadButtons } from '$lib/content/preview-actions';

let mermaidModule: Promise<typeof import('mermaid').default> | undefined;
let diagramId = 0;

export async function prewarmMermaid(): Promise<void> {
	await getMermaid();
}

function getMermaid(): Promise<typeof import('mermaid').default> {
	if (!mermaidModule) {
		mermaidModule = import('mermaid').then(({ default: mermaid }) => {
			// DOMPurify strips SVG <foreignObject>, so HTML labels would render as empty
			// boxes. Plain SVG text labels survive sanitizing and stay readable.
			mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
			return mermaid;
		});
		mermaidModule = mermaidModule.catch((error) => {
			mermaidModule = undefined;
			throw error;
		});
	}
	return mermaidModule;
}

export async function renderMermaidBlocks(
	html: string,
	render: (source: string, id: string) => Promise<string>,
): Promise<string> {
	const template = document.createElement('template');
	template.innerHTML = html;
	const blocks = template.content.querySelectorAll('pre > code.language-mermaid');

	for (const [index, code] of Array.from(blocks).entries()) {
		const source = code.textContent ?? '';
		try {
			const svg = await render(source, `note-mermaid-${++diagramId}-${index}`);
			const safeSvg = DOMPurify.sanitize(svg, {
				USE_PROFILES: { html: true, svg: true, svgFilters: true },
			});
			const diagram = document.createElement('div');
			diagram.className = 'mermaid-diagram';
			diagram.innerHTML = safeSvg;
			if (diagram.querySelector('svg')) addMermaidDownloadButtons(diagram);
			code.parentElement?.replaceWith(diagram);
		} catch {
			continue;
		}
	}

	return template.innerHTML;
}

export async function renderNotePreviewHtml(
	html: string,
	renderDiagram?: (source: string, id: string) => Promise<string>,
): Promise<string> {
	if (!html.includes('language-mermaid')) return html;

	if (!renderDiagram) {
		const mermaid = await getMermaid();
		renderDiagram = async (source, id) => (await mermaid.render(id, source)).svg;
	}

	return renderMermaidBlocks(html, renderDiagram);
}
