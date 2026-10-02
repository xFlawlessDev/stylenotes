/**
 * Barrel for the app's SQLite repos. Each concern lives in its own module;
 * `getDb`/`DB_URL` come from `./connection` and `workspacesRepo` from
 * `./workspaces`. Re-exported here so the rest of the app keeps importing
 * `$lib/db`.
 */
export { DB_URL, getDb } from './connection';
export { notesRepo } from './notes';
export { foldersRepo } from './folders';
export { notificationsRepo } from './notifications';
export { metaRepo } from './meta';
export { attachmentsRepo } from './attachments';
export type { AttachmentRecord, AttachmentWrite } from './attachments';
export { embeddingsRepo } from './embeddings';
export type { EmbeddingRecord, EmbeddingWrite } from './embeddings';
export { suggestionsRepo } from './suggestions';
export { clustersRepo } from './clusters';
export { remoteMcpRepo } from './remote-mcp';
export type { RemoteMcpMode, RemoteMcpRecord } from './remote-mcp';
export type { ClusterRecord } from './clusters';
export { settingsRepo } from './settings';
export { tasksRepo, dependenciesRepo } from './tasks';
export { workspacesRepo } from './workspaces';
export { vaultRepo } from './vault';
export type { VaultBinding, VaultFile, VaultLink, VaultMode, VaultWorkspaceType } from './vault';
