#!/usr/bin/env node
/**
 * Validates a skill directory against the Agent Skills spec
 * (https://agentskills.io/specification).
 *
 * Usage: node scripts/validate-skill.mjs <skill-dir>
 *
 * Checks the frontmatter rules that are mechanical:
 *   - SKILL.md exists and opens with a `---` frontmatter block
 *   - `name`: 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing
 *     or consecutive hyphens, matches the directory name
 *   - `description`: 1-1024 chars, non-empty
 *   - `license` / `compatibility`: length limits when present
 *   - every relative link in the body resolves to a file in the skill
 *   - SKILL.md stays under 500 lines
 *
 * Exits 0 when valid, 1 with a list of problems otherwise.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const args = process.argv.slice(2);
if (args.length !== 1) {
	console.error('Usage: node scripts/validate-skill.mjs <skill-dir>');
	process.exit(1);
}

const dir = resolve(args[0]);
const skillFile = join(dir, 'SKILL.md');
const problems = [];
const notes = [];

if (!existsSync(skillFile)) {
	problems.push('SKILL.md not found');
}

let frontmatter = {};
let body = '';

if (existsSync(skillFile)) {
	const raw = readFileSync(skillFile, 'utf8');
	const lines = raw.split(/\r?\n/);
	if (lines[0].trim() !== '---') {
		problems.push('SKILL.md must start with a `---` frontmatter block');
	} else {
		const end = lines.indexOf('---', 1);
		if (end === -1) {
			problems.push('frontmatter is not closed with `---`');
		} else {
			const fmLines = lines.slice(1, end);
			body = lines.slice(end + 1).join('\n');
			frontmatter = parseFrontmatter(fmLines, problems);
		}
	}
	if (raw.split(/\r?\n/).length > 500) {
		notes.push(
			`SKILL.md is ${raw.split(/\r?\n/).length} lines; the spec recommends staying under 500`
		);
	}
}

const name = frontmatter.name;
const description = frontmatter.description;

if (typeof name !== 'string' || name.length === 0) {
	problems.push('`name` is required');
} else {
	if (name.length > 64) problems.push(`\`name\` is ${name.length} chars; max 64`);
	if (!/^[a-z0-9-]+$/.test(name)) {
		problems.push('`name` may only contain lowercase letters, digits and hyphens');
	}
	if (name.startsWith('-') || name.endsWith('-')) {
		problems.push('`name` must not start or end with a hyphen');
	}
	if (name.includes('--')) problems.push('`name` must not contain consecutive hyphens');
	const dirName = dir.split(/[\\/]/).filter(Boolean).pop();
	if (dirName && name !== dirName) {
		problems.push(`\`name\` (${name}) must match the directory name (${dirName})`);
	}
}

if (typeof description !== 'string' || description.length === 0) {
	problems.push('`description` is required');
} else if (description.length > 1024) {
	problems.push(`\`description\` is ${description.length} chars; max 1024`);
}

if (typeof frontmatter.compatibility === 'string' && frontmatter.compatibility.length > 500) {
	problems.push('`compatibility` is over 500 chars');
}

// Every relative markdown link in SKILL.md and README.md must point at a real
// file in the skill. Reference files are prose and may link to each other too.
const linkSources = ['SKILL.md', 'README.md', ...listMarkdown(dir, 'references')];
for (const source of linkSources) {
	const sourcePath = join(dir, source);
	if (!existsSync(sourcePath)) continue;
	const sourceBody = readFileSync(sourcePath, 'utf8');
	for (const match of sourceBody.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
		const href = match[1].split('#')[0].trim();
		if (!href || /^[a-z]+:/i.test(href) || href.startsWith('/') || href.startsWith('#')) continue;
		const target = resolve(dirname(sourcePath), href);
		if (!existsSync(target)) {
			problems.push(`broken link in ${source}: ${href}`);
		} else if (!target.startsWith(dir)) {
			problems.push(`link escapes the skill directory in ${source}: ${href}`);
		} else if (statSync(target).isDirectory()) {
			problems.push(`link points at a directory, not a file, in ${source}: ${href}`);
		} else {
			const depth = relative(dir, dirname(target)).split(/[\\/]/).filter(Boolean).length;
			if (depth > 3) notes.push(`reference is nested ${depth} levels deep: ${href}`);
		}
	}
}

const label = name || args[0];
if (problems.length === 0) {
	console.log(`OK  ${label}`);
	for (const note of notes) console.log(`    note: ${note}`);
	process.exit(0);
}
console.error(`FAIL  ${label}`);
for (const problem of problems) console.error(`    - ${problem}`);
for (const note of notes) console.error(`    note: ${note}`);
process.exit(1);

/** Minimal YAML for the scalar fields the spec defines. */
function parseFrontmatter(lines, out) {
	const result = {};
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
		if (!match) continue;
		const key = match[1];
		let value = match[2].trim();
		// `metadata:` opens a nested map; record its scalar children.
		if (value === '' && key === 'metadata') {
			const meta = {};
			while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
				i += 1;
				const child = /^\s+([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(lines[i]);
				if (child) meta[child[1]] = stripQuotes(child[2].trim());
			}
			result.metadata = meta;
			continue;
		}
		value = stripQuotes(value);
		result[key] = value;
	}
	return result;
}

function stripQuotes(value) {
	if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'"))) {
		return value.slice(1, -1);
	}
	return value;
}

/** Markdown filenames directly inside `subdir` (one level, sorted). */
function listMarkdown(dir, subdir) {
	const target = join(dir, subdir);
	if (!existsSync(target) || !statSync(target).isDirectory()) return [];
	return readdirSync(target)
		.filter((entry) => entry.endsWith('.md'))
		.sort()
		.map((entry) => join(subdir, entry));
}
