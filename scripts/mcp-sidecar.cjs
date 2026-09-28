#!/usr/bin/env node
/**
 * Builds the `stylenotes-mcp` shim and copies it beside `src-tauri/` under the
 * target-triple name Tauri expects for `bundle.externalBin`.
 *
 * Tauri resolves an `externalBin` entry to `<name>-<target-triple>(.exe)` and
 * fails the build when the file is missing. Because the shim is compiled from
 * the same crate, it must be built first and copied into place — this script is
 * that step, run from `beforeDevCommand` and `beforeBuildCommand`.
 */
const { execFileSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
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

function main() {
  if (!existsSync(join(tauriDir, 'Cargo.toml'))) {
    console.log('[mcp-sidecar] no src-tauri/Cargo.toml; skipping');
    return;
  }
  const triple = targetTriple();
  console.log(`[mcp-sidecar] building stylenotes-mcp for ${triple}`);
  run('cargo', ['build', '--manifest-path', join(tauriDir, 'Cargo.toml'), '--bin', 'stylenotes-mcp']);

  const built = join(tauriDir, 'target', 'debug', `stylenotes-mcp${exeSuffix}`);
  if (!existsSync(built)) throw new Error(`Expected shim at ${built}`);
  const destination = join(tauriDir, `stylenotes-mcp-${triple}${exeSuffix}`);

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(built, destination);
  console.log(`[mcp-sidecar] copied to ${destination}`);
}

try {
  main();
} catch (error) {
  console.error('[mcp-sidecar] failed:', error.message);
  process.exit(1);
}
