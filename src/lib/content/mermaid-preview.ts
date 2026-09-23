import DOMPurify from 'dompurify';

let mermaidModule: Promise<typeof import('mermaid').default> | undefined;
let diagramId = 0;

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
		mermaidModule ??= import('mermaid').then(({ default: mermaid }) => {
			mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
			return mermaid;
		});
		const mermaid = await mermaidModule;
		renderDiagram = async (source, id) => (await mermaid.render(id, source)).svg;
	}

	return renderMermaidBlocks(html, renderDiagram);
}
