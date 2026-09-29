import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const VALIDATOR = 'skills/stylenotes-mcp/scripts/validate-skill.mjs';

/** Runs the validator on a throwaway skill directory. */
function validate(files: Record<string, string>, dirName: string): { code: number; out: string } {
	const dir = mkdtempSync(join(tmpdir(), 'skill-'));
	const skillDir = join(dir, dirName);
	mkdirSync(skillDir, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		const target = join(skillDir, name);
		mkdirSync(join(target, '..'), { recursive: true });
		writeFileSync(target, content, 'utf8');
	}
	const result = spawnSync('node', [VALIDATOR, skillDir], { encoding: 'utf8' });
	rmSync(dir, { recursive: true, force: true });
	return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

const GOOD = '---\nname: demo\ndescription: A valid demo skill used to exercise the validator.\n---\n\n# Demo\n';

describe('validate-skill', () => {
	it('accepts a minimal valid skill', () => {
		const { code, out } = validate({ 'SKILL.md': GOOD }, 'demo');
		expect(out).toContain('OK');
		expect(code).toBe(0);
	});

	it('rejects a name that does not match the directory', () => {
		const { code, out } = validate({ 'SKILL.md': GOOD }, 'other');
		expect(code).toBe(1);
		expect(out).toContain('must match the directory name');
	});

	it('rejects uppercase and consecutive hyphens in the name', () => {
		const upper = validate(
			{ 'SKILL.md': GOOD.replace('name: demo', 'name: Demo') },
			'demo'
		);
		expect(upper.code).toBe(1);
		const double = validate(
			{ 'SKILL.md': GOOD.replace('name: demo', 'name: de--mo') },
			'demo'
		);
		expect(double.code).toBe(1);
		expect(double.out).toContain('consecutive hyphens');
	});

	it('rejects a missing description', () => {
		const { code, out } = validate(
			{ 'SKILL.md': '---\nname: demo\n---\n\n# Demo\n' },
			'demo'
		);
		expect(code).toBe(1);
		expect(out).toContain('`description` is required');
	});

	it('rejects a description over 1024 characters', () => {
		const long = 'x'.repeat(1025);
		const { code, out } = validate(
			{ 'SKILL.md': `---\nname: demo\ndescription: ${long}\n---\n\n# Demo\n` },
			'demo'
		);
		expect(code).toBe(1);
		expect(out).toContain('max 1024');
	});

	it('flags a broken relative link', () => {
		const { code, out } = validate(
			{ 'SKILL.md': `${GOOD}\nSee [missing](references/nope.md).\n` },
			'demo'
		);
		expect(code).toBe(1);
		expect(out).toContain('broken link');
	});

	it('accepts a link that resolves', () => {
		const { code } = validate(
			{
				'SKILL.md': `${GOOD}\nSee [ref](references/ref.md).\n`,
				'references/ref.md': '# Ref\n'
			},
			'demo'
		);
		expect(code).toBe(0);
	});

	it('rejects a missing frontmatter block', () => {
		const { code, out } = validate({ 'SKILL.md': '# Demo\n' }, 'demo');
		expect(code).toBe(1);
		expect(out).toContain('must start with a `---`');
	});
});
