# Design archive

Desain di folder ini **sudah diimplementasikan** dan diarsipkan dari `docs/design/`
(2026-10-01). Isinya tetap berlaku sebagai catatan keputusan, bukan rencana kerja.

| Dokumen | Fitur | Bukti utama |
|---|---|---|
| `mcp-local-free.md` | Local MCP stdio + Settings | migrasi 11, `src-tauri/src/mcp/`, `mcp_host.rs`, `mcp-host.svelte.ts`, `McpSettings.svelte`; laporan `docs/reports/mcp-e2e-test-report.md` |
| `artifacts.md` | Attachment / artifact store | migrasi 24, `src-tauri/src/attachments/`, `content/attachment-*.ts`, `stores/attachments.svelte.ts`, `AttachmentSettings.svelte` |
| `journal.md` | Journal (daily notes) + `journal_today` | migrasi 18, `content/journal.ts`, `stores/journal.svelte.ts`, `JournalSettings.svelte` |
| `constella-features.md` | Semantic memory, auto-link, clustering, contradiction, remote MCP, import markdown | migrasi 19–21, `src-tauri/src/{embed,remote_mcp}/`, `content/{semantic,clusters,contradictions,embeddings,markdown-import}.ts`, `stores/memory.svelte.ts` |
| `auto-save-versioning.md` | Auto-save hardening + note/task versioning | pragmas di `db/connection.ts`, `save-queue` `minGap`, `db_tx.rs`, `quit.rs`, migrasi 15, `stores/versioning.ts`, `RecordHistoryDialog.svelte` |

Desain yang **belum** diimplementasikan tetap di `docs/design/`:
`cloud-sync-ai-mcp.md`, `collaboration.md`, `business-model.md`, `mobile.md`,
`ui-extensions.md`.
