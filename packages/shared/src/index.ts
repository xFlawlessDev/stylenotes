/**
 * `@stylenotes/shared` — the contract shared by the OSS desktop app and the
 * closed-source cloud service.
 *
 * Rule: this package must never import `$lib`, `$app/*`, or `@tauri-apps/*`.
 * It is framework-free TypeScript so the cloud service (a plain Bun/Elysia
 * workspace) can consume it without dragging in the desktop app.
 */
export * from './hlc';
export * from './sync';
export * from './domain';
export * from './entitlements';
export * from './version';
