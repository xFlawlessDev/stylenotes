# Design archive

Desain di folder ini diarsipkan dari `docs/design/` (2026-10-01). Isinya tetap berlaku sebagai catatan keputusan, bukan rencana kerja.

| Dokumen | Fitur | Bukti utama |
|---|---|---|
| `mcp-local-free.md` | Local MCP stdio + Settings | migrasi 11, `src-tauri/src/mcp/`, `mcp_host.rs`, `mcp-host.svelte.ts`, `McpSettings.svelte`; laporan `docs/reports/mcp-e2e-test-report.md` |
| `artifacts.md` | Attachment / artifact store | migrasi 24, `src-tauri/src/attachments/`, `content/attachment-*.ts`, `stores/attachments.svelte.ts`, `AttachmentSettings.svelte` |
| `journal.md` | Journal (daily notes) + `journal_today` | migrasi 18, `content/journal.ts`, `stores/journal.svelte.ts`, `JournalSettings.svelte` |
| `constella-features.md` | Semantic memory, auto-link, clustering, contradiction, remote MCP, import markdown | migrasi 19–21, `src-tauri/src/{embed,remote_mcp}/`, `content/{semantic,clusters,contradictions,embeddings,markdown-import}.ts`, `stores/memory.svelte.ts` |
| `auto-save-versioning.md` | Auto-save hardening + note/task versioning | pragmas di `db/connection.ts`, `save-queue` `minGap`, `db_tx.rs`, `quit.rs`, migrasi 15, `stores/versioning.ts`, `RecordHistoryDialog.svelte` |
| `ui-extensions.md` | UI extensions (slot + widget deklaratif, tanpa eksekusi kode) | **Tidak dilanjutkan (shelved)** — draft #X1–#X18, tidak ada kode. Alasan: permukaan UI yang berguna menuntut runtime plugin (sandbox + host API), terlalu berat untuk solo dev. Lihat header dokumen. |

`ui-extensions.md` adalah pengecualian: satu-satunya dokumen di folder ini yang
**tidak pernah** diimplementasikan dan kini **ditutup** (shelved). Sisa desain di
folder ini sudah diimplementasikan.

Desain yang **belum** diimplementasikan tetap di `docs/design/`: `mobile.md` dan
`vault-mirror.md` (export mirror, impor folder, dan auto-sync dua-arah berbasis poll sudah ada
di kode; watcher `notify` dan dialog konflik masih desain).

Dokumen desain untuk **layanan cloud** (sync, kolaborasi, model bisnis) dikelola
bersama layanan itu, di luar repo ini. Dokumentasi publik menyebutnya lewat
deskripsi (mis. "the cloud sync design §4"), bukan lewat nama berkas atau tautan.
