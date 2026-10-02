#!/usr/bin/env node
/**
 * Builds the `stylenotes-mcp` shim and copies it beside `src-tauri/` under the
 * target-triple name Tauri expects for `bundle.externalBin`.
 *
 * Tauri resolves an `externalBin` entry to `<name>-<target-triple>(.exe)` and
 * fails the build when the file is missing. Because the shim is compiled from
 * the same crate, it must be built first and copied into place — this script is
 * that step, run from `beforeDevCommand` and `beforeBuildCommand`.
 *
 * That same-crate dependency is also a chicken-and-egg: `tauri-build` runs
 * before the shim is compiled, so on a clean checkout it aborts looking for a
 * file the build is about to create. `seedPlaceholder` breaks it by putting an
 * empty file at that path just for the existence check.
 */
const { execFileSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const tauriDir = join(root, 'src-tauri');
const isWindows = process.platform === 'win32';
const exeSuffix = isWindows ? '.exe' : '';

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

function capture(command, args) {
  return execFileSync(command, args, { cwd: root }).toString().trim();
}

/** Reads the host target triple from `rustc -vV`. */
function targetTriple() {
  const output = capture('rustc', ['-vV']);
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith('host:'));
  if (!line) throw new Error('Could not determine the Rust host target triple');
  return line.replace('host:', '').trim();
}

/**
 * Seeds an empty placeholder at the `externalBin` path Tauri resolves.
 *
 * `tauri-build` runs before the shim is compiled and aborts when the file is
 * missing (`resource path ... doesn't exist`). Because the shim lives in the
 * same crate, its first build would otherwise trigger the very build script
 * that needs the file — a chicken-and-egg on a clean checkout. The placeholder
 * only satisfies that existence check; the real binary overwrites it below.
 */
function seedPlaceholder(destination) {
  if (existsSync(destination)) return;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, '');
}

function main() {
  if (!existsSync(join(tauriDir, 'Cargo.toml'))) {
    console.log('[mcp-sidecar] no src-tauri/Cargo.toml; skipping');
    return;
  }
  const triple = targetTriple();
  const destination = join(tauriDir, `stylenotes-mcp-${triple}${exeSuffix}`);

  seedPlaceholder(destination);
  console.log(`[mcp-sidecar] building stylenotes-mcp for ${triple}`);
  run('cargo', ['build', '--manifest-path', join(tauriDir, 'Cargo.toml'), '--bin', 'stylenotes-mcp']);

  const built = join(tauriDir, 'target', 'debug', `stylenotes-mcp${exeSuffix}`);
  if (!existsSync(built)) throw new Error(`Expected shim at ${built}`);

  // Overwrites the placeholder seed with the real shim.
  copyFileSync(built, destination);
  console.log(`[mcp-sidecar] copied to ${destination}`);
}

try {
  main();
} catch (error) {
  console.error('[mcp-sidecar] failed:', error.message);
  process.exit(1);
}
