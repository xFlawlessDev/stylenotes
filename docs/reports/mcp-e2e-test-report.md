# Uji E2E MCP Lokal — Laporan

> Tanggal: 2026-09-29
> Lingkup: 24 tool MCP (11 read, 13 write) lewat jalur nyata — shim `stdio` → job file → host di window `workspace` → store/repo → SQLite → snapshot.
> Perangkat: Windows, `bun run tauri dev`, aplikasi berjalan dengan grant `write` untuk scope `notes`, `tasks`, `dependency`, `workspace`.
> Skrip: `scripts/mcp-e2e.ps1` (smoke, 44 assert) dan `scripts/mcp-scenario.ps1` (skenario user nyata, 34 assert).

---

## 1. Ringkasan

| Suite | Assert | Lulus | Gagal |
|---|---:|---:|---:|
| Smoke E2E (`mcp-e2e.ps1`) | 44 | 44 | 0 |
| Skenario user nyata (`mcp-scenario.ps1`) | 34 | 34 | 0 |
| Guard destruktif (`mcp-guard-check.ps1`) | 8 | 8 | 0 |
| Unit test Rust (`stylenotes-mcp`) | 26 | 26 | 0 |
| Unit test frontend (Vitest) | 753 | 753 | 0 |
| `bun run check` (svelte-check) | — | 0 error, 0 warning | — |
| `bun run clippy` (`-D warnings`) | — | bersih | — |
| `bun run fmt:check` | — | bersih | — |

**Lima bug nyata ditemukan dan diperbaiki** (dua di antaranya berpotensi merusak data secara diam-diam):

1. `backlinks`/`outlinks`/`neighbours` selalu kosong — id node graph berbeda antara app dan shim.
2. Scope `workspace` tidak pernah tersimpan — daftar scope di-hardcode di dua tempat.
3. `overdueOnly` menandai setiap task ber-tanggal sebagai overdue.
4. `is_overdue` juga ikut menyertakan task yang `blocked` tanpa dasar.
5. `delete_workspace` bisa menghapus `workspace-default` beserta isinya.

Empat bug pada **skrip uji sendiri** juga ditemukan dan diperbaiki; semuanya kesalahan alat uji, bukan aplikasi (lihat §5).

---

## 2. Skenario yang diuji

Workspace baru **"Product Launch"** dibuat murni lewat MCP, lalu diisi data seperti pemakaian nyata:

**4 note** dengan `[[wiki link]]` yang saling menunjuk:

| Note | Folder | Tag | Menunjuk ke |
|---|---|---|---|
| Launch brief | launch | launch, spec | Positioning memo, Pricing model, Launch runbook |
| Positioning memo | launch | launch, marketing | Launch brief, Launch runbook |
| Pricing model | launch | launch, finance | Launch brief |
| Launch runbook | launch | launch, ops | Positioning memo, Pricing model |

**5 task** dengan rantai dependency dan tenggat:

| Task | Status | Prioritas | Tenggat |
|---|---|---|---|
| Finalise positioning | done | high | −3 hari |
| Approve pricing | doing | high | +2 hari |
| Write announcement | todo | medium | +5 hari |
| Ship v1 | todo | high | +10 hari |
| Run launch retro | todo | low | −1 hari (overdue) |

Rantai dependency: `Approve pricing → Finalise positioning`, `Write announcement → Approve pricing`, `Ship v1 → Write announcement` (4 simpul, `critical_path` = 4).

---

## 3. Hasil per tool — expected vs result

### 3.1 Workspace (tool baru)

| Tool | Expected | Result | Status |
|---|---|---|---|
| `list_workspaces` (sebelum) | daftar workspace dengan hitungan note/task | workspaces=[Personal, Product Launch 1433 (renamed)] count=2 | PASS |
| `create_workspace` | id + nama workspace baru | id=d6999332-… name=Product Launch 1438 | PASS |
| workspace terlihat di snapshot | host menerbitkan workspace baru | visible=True | PASS |
| `list_workspaces` (sesudah) | 2 workspace; yang baru 0 note / 0 task | count=2 newNote=0 newTask=0 | PASS |
| `rename_workspace` | nama berubah di `list_workspaces` | name=[Product Launch 1438 (renamed)] | PASS |
| `delete_workspace` tanpa `confirm` | ditolak `bad_arguments` | error=bad_arguments | PASS |
| `delete_workspace` (`workspace-default`) | ditolak `last_workspace` | error=last_workspace | PASS (setelah B5) |
| `delete_workspace` (workspace terakhir) | ditolak `last_workspace` | error=last_workspace | PASS (setelah B5) |
| `delete_workspace` (id tidak ada) | `not_found` | error=not_found | PASS |

### 3.2 Setup (write)

| Tool | Expected | Result | Status |
|---|---|---|---|
| `create_note` ×4 | 4 note di workspace baru | created=4 | PASS |
| `create_task` ×5 | 5 task di workspace baru | created=5 | PASS |
| `link_tasks` ×3 | 3 edge dependency | linked=3 | PASS |

### 3.3 Read — notes

| Tool | Expected | Result | Status |
|---|---|---|---|
| `list_notes` (workspace) | 4 note, folder=launch | notes=4 | PASS |
| `list_notes` (tag=finance) | hanya Pricing model | titles=[Pricing model] | PASS |
| `search_notes` ("positioning") | Positioning memo peringkat 1 (hit judul) | first=Positioning memo | PASS |
| `get_note` Launch brief | outlinks=3 (memo, pricing, runbook) | outlinks=3 backlinks=2 | PASS |
| `get_note` Launch runbook | backlinks=2 (brief, memo) | backlinks=[Positioning memo, Launch brief] | PASS |
| `context` ("pricing") | Pricing model peringkat 1 + neighbours | first=Pricing model neighbours=3 | PASS |

### 3.4 Read — tasks & dependency

| Tool | Expected | Result | Status |
|---|---|---|---|
| `list_tasks` (workspace) | 5 task, prioritas high dulu | tasks=5 first=Finalise positioning | PASS |
| `list_tasks` (overdueOnly) | hanya Run launch retro | overdue=[Run launch retro] | PASS |
| overdue exclusion | Ship v1 (+10 hari, open) tidak overdue | shipOverdue=False dueAt=2026-10-09 | PASS |
| `list_tasks` (todo, tanpa done) | 3 task | count=3 [Ship v1, Write announcement, Run launch retro] | PASS |
| `get_task` Ship v1 | blocked=true, blockedBy=1 | blocked=True blockedBy=1 | PASS |
| `get_task` Finalise positioning | blocking ≥1 | blocking=1 | PASS |
| `task_board` (workspace) | kolom dengan hitungan | todo:3, doing:1, review:0, done:1 | PASS |
| `daily_summary` (workspace) | openTasks + inProgress | open=4 inProgress=1 | PASS |
| `list_dependencies` (workspace) | 3 edge | edges=3 | PASS |
| `critical_path` (to Ship v1) | panjang 4 | length=4 · [Finalise positioning → Approve pricing → Write announcement → Ship v1] | PASS |
| `graph_query` (Launch brief, depth 1) | ≥4 node, ≥3 edge wiki | nodes=4 edges=8 | PASS |
| `graph_query` (kind=wiki, depth 2) | hanya edge wiki, mencapai semua note | nodes=4 kinds=[wiki] | PASS |

### 3.5 Write semantics & guard

| Tool | Expected | Result | Status |
|---|---|---|---|
| `update_note_body` Pricing model | body tersimpan ("Revised: free tier") | bodyChanged=True chars=89 | PASS |
| `update_task` retro | priority=medium, dueAt terisi | priority=medium dueAt=2026-10-13 | PASS |
| `complete_task` Approve pricing | status=done; announcement tetap terhambat 1 | status=done announceBlockedBy=1 | PASS |
| `unlink_tasks` ship → announce | ship tidak lagi terhambat | blocked=False blockedBy=0 | PASS |
| `link_tasks` re-link ship → announce | diterima (rantai asiklik) | ok=True | PASS |
| `link_tasks` cycle | ditolak `dependency_cycle` | ok=False error=dependency_cycle | PASS |
| `delete_note` / `delete_task` tanpa `confirm` | ditolak `bad_arguments` | error=bad_arguments | PASS |
| `delete_workspace` tanpa `confirm` | ditolak `bad_arguments` | error=bad_arguments | PASS |
| `delete_workspace` (workspace terakhir) | ditolak `last_workspace` | error=last_workspace | PASS |

### 3.6 Isolasi lintas-workspace

| Uji | Expected | Result | Status |
|---|---|---|---|
| `get_note` note baru, `workspace=workspace-default` | `not_found` | error=not_found | PASS |
| `list_tasks` `workspace=workspace-default` | 0 task (tidak membocorkan) | tasks=0 | PASS |

---

## 4. Bug yang ditemukan dan perbaikan

### B1 — `backlinks`/`outlinks`/`neighbours` selalu kosong

- **Dampak:** pertanyaan inti agent "note mana yang menyebut X?" menjawab kosong tanpa error.
- **Akar:** app (`src/lib/content/workspace-graph.ts`) membuat id node `<kind>:<id>`, sedangkan shim (`src-tauri/src/mcp/read.rs::graph_node_id`) membuat `<kind>:<workspaceId>/<id>`. `links_for()` mencari dengan kunci yang tidak pernah ada.
- **Perbaikan:** `graph_node_id` diselaraskan menjadi `<kind>:<id>`.
- **Kenapa lolos:** tidak ada test yang memakai format id graph produksi; test lama memakai contoh `note:ws/a` yang tidak sesuai kenyataan.
- **Guard:** `read.rs` — `graph_node_id_matches_workspace_graph`, `links_for_resolves_edges_between_production_node_ids`; `read_graph.rs` — `graph_anchor_matches_production_node_ids`.

### B2 — Scope `workspace` tidak pernah tersimpan (toggle selalu kembali off)

- **Gejala yang dilaporkan user:** toggle scope kembali ke off dan tidak tersimpan.
- **Akar:** daftar scope di-hardcode `['notes','tasks','dependency']` di dua tempat (`src/lib/stores/mcp.svelte.ts` `isScope`, dan `src/lib/db/mcp.ts` `VALID_SCOPES`). Setiap penambahan scope ke-4 dibuang saat simpan; saat dimuat pun dibuang kembali, jadi toggle tak pernah bertahan.
- **Perbaikan:** satu sumber kebenaran `MCP_SCOPE_IDS` di `src/lib/content/mcp-types.ts`; store dan repo menurunkan daftarnya dari sana.
- **Guard:** `mcp-tools.test.ts` — `advertises only scopes that the settings layer can persist`.

### B3 — `overdueOnly` menandai setiap task ber-tanggal sebagai overdue

- **Dampak:** filter "task terlambat" mengembalikan task yang jatuh tempo tahun depan.
- **Akar:** `read_tasks.rs::is_overdue` hanya memeriksa `dueAt` ada dan status bukan `done`; komentar lama mengakui snapshot "tidak membawa jam".
- **Perbaikan:** bandingkan `dueAt` (`YYYY-MM-DD`) dengan prefiks `YYYY-MM-DD` dari `generatedAt` snapshot. Task due hari ini tidak overdue; snapshot tanpa jam yang valid bersikap konservatif (tidak menandai apa pun).
- **Guard:** `read_tasks.rs` — `overdue_compares_due_against_snapshot_day`, `overdue_is_conservative_without_a_usable_clock`.

### B4 — `overdueOnly` ikut menyertakan task yang `blocked`

- **Akar:** filter lama berbunyi `task["blocked"] == true || is_overdue(...)`, mencampur "terhambat" dengan "terlambat".
- **Perbaikan:** makna disatukan; hanya `is_overdue` yang menentukan.

### B5 — `delete_workspace` bisa menghapus `workspace-default`

- **Dampak:** memanggil `delete_workspace` pada `workspace-default` (dengan `confirm: true`) benar-benar menghapus workspace itu beserta note di dalamnya. Saat diuji, note bawaan "Welcome to StyleNotes" dan satu note kerja user ikut terhapus.
- **Akar:** guard hanya memeriksa "bukan workspace terakhir". `workspace-default` valid dihapus selama masih ada workspace lain. Padahal `workspace-default` adalah **fallback** untuk record tanpa workspace (`workspaceOf`, `resolveWorkspace`), sehingga menghapusnya menyandera baris-baris itu.
- **Perbaikan:** `deleteWorkspaceAction` menolak `workspace-default` secara eksplisit (`last_workspace`), selain tetap menolak workspace terakhir.
- **Guard:** `mcp-workspace-actions.test.ts` — `never deletes the default workspace`, `never deletes the last remaining workspace`, `deletes a non-default workspace when another one remains`; E2E oleh `scripts/mcp-guard-check.ps1` (8 assert).
- **Catatan jujur:** note kerja user "ERP" tidak dapat dipulihkan setelah kejadian ini (tidak ada backup). Note bawaan "Welcome to StyleNotes" dan `workspace-default` sudah dipulihkan.

### Tool baru: workspace

MCP sebelumnya tidak bisa membuat workspace; agent harus bergantung pada UI. Ditambahkan 4 tool (24 total):

| Tool | Kind | Scope |
|---|---|---|
| `list_workspaces` | read | workspace |
| `create_workspace` | write | workspace |
| `rename_workspace` | write | workspace |
| `delete_workspace` | write | workspace |

- `create_workspace` menolak nama duplikat; `delete_workspace` menolak workspace terakhir (`last_workspace`) dan butuh `confirm: true`.
- Action ada di `src/lib/content/mcp-workspace-actions.ts`; host me-listen `WORKSPACES_CHANGED` agar snapshot memuat workspace baru tanpa restart.
- Registry TS dan Rust tetap sinkron (24 = 24, dijaga `mcp-tools.test.ts`).

---

## 5. Catatan: bug pada alat uji (bukan aplikasi)

Kegagalan awal skenario ternyata berasal dari skrip, bukan MCP:

1. **Penetapan `$wsId` di dalam scriptblock `Check`.** PowerShell menjalankan scriptblock di scope anak, jadi `$wsId` tetap `$null` di scope pemanggil dan setiap write berikutnya diam-diam jatuh ke `workspace-default`. Inkonsistensi ini yang awalnya terlihat seperti kebocoran lintas-workspace.
2. **Satu proses shim per panggilan.** Saat stdin ditutup segera setelah perintah dikirim, shim keluar sebelum hasil job tiba dan tidak membalas. Suite ini memakai satu proses shim persisten, seperti client MCP sungguhan.
3. **Assert siklus yang salah.** Uji "cycle" awal tidak benar-benar menutup lingkaran, sehingga penolakan yang benar terlihat seperti bug. Kini siklus ditutup eksplisit (re-link satu arah, lalu arah sebaliknya).
4. **Dua `@(` berturut-turut yang tidak tertutup** setelah penyuntingan, membuat skrip gagal parse.

Temuan turunan: `app-info.json` dapat tetap menyatakan `appRunning: true` sesaat setelah app berhenti; shim menolak dengan `app_not_running`/`write_not_granted` yang jelas, jadi tidak ada penulisan tanpa validasi. Perubahan kode frontend juga **tidak** berlaku sampai app dijalankan ulang; job yang tiba saat host masih versi lama dieksekusi oleh handler lama (inilah yang sempat membuat `rename_workspace` tampak "`id` is required").

---

## 6. Cara menjalankan ulang

```powershell
# App harus berjalan (bun run tauri dev) dengan write + scope yang dibutuhkan.
bun run mcp:sidecar                     # bangun & pasang shim
pwsh -File scripts/mcp-e2e.ps1          # suite smoke; -KeepData menahan data uji
pwsh -File scripts/mcp-scenario.ps1     # skenario user nyata (meninggalkan data)
pwsh -File scripts/mcp-guard-check.ps1  # guard destruktif (confirm, workspace-default)
bun run check ; bun run test ; bun run fmt:check ; bun run clippy
```

Data contoh skenario **disimpan** (bukan dibersihkan) agar bisa dieksplorasi dengan agent; hapus lewat UI atau `delete_workspace` bila tidak diperlukan.

---

## 7. Kondisi akhir

- Semua suite hijau: 44 + 34 + 8 assert E2E, 26 test Rust, 753 test Vitest, `check`/`clippy`/`fmt:check` bersih.
- Data uji yang gagal/tidak valid dibersihkan; `mcp/jobs` dan `mcp/results` kosong.
- Workspace contoh **Product Launch** beserta 4 note dan 5 task sengaja **disimpan** untuk eksplorasi lanjutan. `workspace-default` dan note bawaan "Welcome to StyleNotes" dipulihkan setelah kejadian B5.
- Perubahan kode: `src-tauri/src/mcp/{read.rs,read_graph.rs,read_tasks.rs,read_workspaces.rs,registry.rs,main.rs,write.rs}`, `src/lib/content/{mcp-types.ts,mcp-tools.ts,mcp-workspace-actions.ts,mcp-workspace-actions.test.ts}`, `src/lib/stores/{mcp.svelte.ts,mcp-host.svelte.ts}`, `src/lib/db/mcp.ts`, serta skrip `scripts/{mcp-e2e,mcp-scenario,mcp-guard-check}.ps1`.
