import { describe, expect, it } from 'vitest';
import { addCodeCopyButtons, extractCodeText } from '$lib/content/preview-actions';

describe('preview action helpers', () => {
	it('adds copy controls to code blocks but not Mermaid code fences', () => {
		const html = addCodeCopyButtons(
			'<pre class="shiki"><code class="language-ts">const answer = 42;</code></pre><pre><code class="language-mermaid">flowchart LR</code></pre>',
		);
		const template = document.createElement('template');
		template.innerHTML = html;

		expect(template.content.querySelectorAll('[data-preview-action="copy-code"]')).toHaveLength(1);
		expect(template.content.querySelector('.language-mermaid')?.parentElement?.querySelector('button')).toBeNull();
	});

	it('labels a code block with the language the fence declares', () => {
		const html = addCodeCopyButtons(
			'<pre><code class="language-powershell">curl</code></pre>',
		);
		const template = document.createElement('template');
		template.innerHTML = html;

		expect(template.content.querySelector('.code-block-language')?.textContent).toBe('PowerShell');
	});

	it('extracts source text from Shiki line spans without joining tokens incorrectly', () => {
		const code = document.createElement('code');
		code.innerHTML = '<span class="line"><span>const</span><span> value = 1;</span></span><span class="line"><span>return value;</span></span>';
		expect(extractCodeText(code)).toBe('const value = 1;\nreturn value;');
	});
});
