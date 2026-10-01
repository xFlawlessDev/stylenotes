# Design — Attachments & Artifact Store (local-first, S3-ready)

> Status: **Final (implementasi lokal)** — 10 keputusan (#A1–#A10), 0 pertanyaan terbuka.
> Tanggal: 2026-10-01
> Scope: user bisa melampirkan **file apa pun** ke note, disimpan sebagai *artifact* lokal yang
> terpusat, dan dipetakan 1:1 ke object storage (S3) saat cloud sync (`cloud-sync-ai-mcp.md`).
> Sebelumnya lampiran hanya **path absolut** di markdown (`![cat](C:/pics/cat.png)`) — rusak
> saat file dipindah, dan tidak berarti di device lain.

---

## 1. Masalah dengan model lama

- Note menyimpan path OS absolut. File pindah/dihapus → gambar hilang. Di device lain jalur itu tidak ada.
- Tidak ada dedup: file yang sama di dua note disimpan dua kali (secara referensi).
- `assetProtocol.scope` = `["**"]`, artinya webview boleh membaca file lokal mana pun.
- Rendering hanya menangani `<img>`; video/audio/PDF/dokumen jatuh ke jalur "tautan eksternal"
  (`external-links.ts`) yang membukanya di browser OS.
- Tidak ada baris DB yang bisa dijadikan daftar objek untuk sync.

## 2. Keputusan (#A1–#A10)

| # | Topik | Keputusan | Implikasi |
|---|-------|-----------|-----------|
| A1 | Model penyimpanan | **Content-addressed blob store** di `<app_data_dir>/attachments/` | Id = SHA-256 isi. Tidak ada jalur lokal di konten tersinkron |
| A2 | Layout | `attachments/<ab>/<sha256>[.<ext>]` (sharding 2 huruf) | Ini sekaligus **object key S3** — tidak perlu tabel translasi |
| A3 | Referensi di markdown | `stylenotes-attachment://<sha256>[.<ext>]` | Portabel; device lain me-render setelah blob-nya hadir |
| A4 | Impor | **Selalu copy ke store** lewat command Rust `attachment_import` | Backend Rust yang menulis; frontend tak pernah pegang path store |
| A5 | Dedup | Satu blob per isi; dua note berbagi satu file | `attachments` PK = hash; impor kedua tidak menulis ulang |
| A6 | Katalog | Tabel `attachments` (migration 24): `id, ext, name, size, rel_path, origin_path, created_at, last_seen_at` | Katalog = **indeks turunan**, bukan source of truth; bisa di-rebuild |
| A7 | Jenis file | `image \| video \| audio \| pdf \| file`, dari ekstensi | Media di-embed (`![]`/`<video>`/`<audio>`), sisanya tautan |
| A8 | Buka file | Tautan dokumen dibuka lewat command Rust `attachment_open` (`tauri-plugin-opener`) | Tidak perlu izin `open-path` di webview; store satu-satunya yang tahu layout |
| A9 | Path lama | Tetap didukung (render *dan* buka), tapi lampiran baru tak pernah memakainya | Note lama tidak pecah; migrasi malas, bukan paksa |
| A10 | Export | `stylenotes-attachment://…` ditulis ulang jadi `attachments/<ab>/<id>.<ext>` | `.md` yang diekspor menunjuk file yang bisa disalin berdampingan |

## 3. Tata letak & alur

```
<app_data_dir>/
├─ stylenotes.db
└─ attachments/
   ├─ ab/ab12…ef.png      ← blob (identitas = isi)
   └─ 9f/9f03…11.pdf
```

**Impor (drag-drop / picker / paste):** `FileDropZone` / toolbar → `importAttachments()`
(`content/attachment-actions.ts`) → command `attachment_import` menyalin + menghitung SHA-256 →
baris `attachments` ditulis (gagal tulis katalog **tidak** membatalkan blob) → markdown
`stylenotes-attachment://<id>.<ext>` disisipkan ke body.

**Render:** `renderNoteHtml` (`content/note-actions.ts`) memanggil `resolveAttachmentSources`
dengan `resolveAttachmentUrl` (`content/attachment-url.ts`), yang mengubah referensi → `asset://`
via `convertFileSrc`. Root store di-cache setelah satu panggilan `attachment_root`.

**Buka tautan file:** klik pada `<a href="stylenotes-attachment://…pdf">` ditangkap
`attachmentLinkTarget` (sebelum `handleExternalLink`) → command `attachment_open`.

## 4. Peta ke S3 (cloud sync)

Karena #A1–#A3, lapisan cloud tidak butuh logika khusus:

- **Key objek** = `rel_path` (`attachments/<ab>/<sha256>.<ext>`), sama persis dengan disk.
- **Daftar objek** sebuah workspace = `SELECT rel_path FROM attachments` yang di-referensikan body
  note-nya. `embeddings` adalah preseden pola "tabel turunan yang bisa di-drop" (AGENTS).
- **Push:** unggah blob yang belum ada (HEAD/`If-None-Match`); isi identik → idempotent.
- **Pull:** referensi yang blob-nya belum ada di device me-render placeholder
  (`attachment_resolve` melaporkan `exists: false`), bukan gambar rusak.
- **Konten note tetap portabel:** yang tersinkron adalah *hash*, bukan path — jadi path lokal tidak
  pernah bocor ke account lain.

## 5. Batas & keamanan

- **Ukuran maks** `MAX_ATTACHMENT_BYTES` = 512 MB (`src-tauri/src/attachments/mod.rs`). File lebih besar dilewati, bukan menggagalkan batch.
- **Ekstensi dinormalisasi** (lowercase, alfanumerik, ≤16, tanpa dot): ekstensi tak bisa menyelundupkan pemisah path.
- **Skema `stylenotes-attachment`** ditambahkan ke allow-list DOMPurify (`ALLOWED_URI`) supaya referensi yang blob-nya belum ada tidak menghilang saat sanitasi.
- File ditulis ke `*.part` lalu `rename` — crash di tengah tidak meninggalkan blob terpotong.
- `origin_path` hanya diagnostik; **tidak pernah** dijadikan source of truth dan tidak ikut sync.

## 6. Yang belum (menunggu fase cloud)

- Client S3 + antrean unggah/unduh (`sync_outbox` akan membawa operasi blob).
- GC blob yatim (tabel `attachments` + referensi body) saat delete note.
- Plafon total store per device / per akun.

## 7. Berkas terkait

- `src/lib/content/attachments.ts` — helper murni (parse/kind/markdown), unit-tested.
- `src/lib/content/attachment-url.ts` — resolusi target → URL webview.
- `src/lib/content/attachment-actions.ts` — command import/open/pick + tulis katalog.
- `src/lib/db/attachments.ts` — repo `attachments` (`attachmentsRepo`).
- `src-tauri/src/attachments/mod.rs` — logika murni (hash, layout, parse).
- `src-tauri/src/attachments/commands.rs` — I/O + `#[tauri::command]`.
- `src/lib/components/workspace/FileDropZone.svelte` — drag-drop + paste.
- Migration 24 di `src-tauri/src/lib.rs`.
