# Technical Design — Journal (Daily Notes)

> Status: **Diimplementasikan** (2026-09-30). Bagian ini awalnya draft untuk review; keputusan di §9 sudah diambil dan kodenya sudah ada.
> Scope: fitur journal (note per hari) di app + satu tool MCP `journal_today` di atasnya.
> Terkait: `docs/design/archive/mcp-local-free.md` (#D19 hari lokal, #D17 metadata note, #D18 `edit_note_body`, §13a backup), `cloud-sync-ai-mcp.md` (§3.2/§3.3 split settings, #24).

Ringkasan keputusan ada di §8; yang masih terbuka ada di §9.

**Apa yang sudah jadi:** migrasi 18 (`notes.journal_day` + indeks unik), `content/journal.ts` (logika tanggal murni), `stores/journal.svelte.ts` (find-or-create), `stores/workspace-journal-ops.ts` + `workspace-note-ops.ts` + `workspace-ops.ts` (pemisahan controller), kartu "Hari ini" di feed, navigasi hari di header editor, `JournalSettings.svelte`, dan tool MCP `journal_today`.

---

## 1. Kenapa dokumen terpisah

Journal tidak bisa diselundupkan lewat `append_to_note`. Alasannya bukan teknis, tapi karena `append_to_note` **bergantung pada journal**: untuk "tambahkan ini ke catatan hari ini", harus ada dulu yang tahu note mana itu. Kalau append dikerjakan lebih dulu, ia harus menebak nama note, folder, dan penanda — lalu tebakan itu harus dirombak saat journal jadi.

Urutan yang benar: journal dulu, append menyusul di atasnya sebagai operasi yang sudah punya tujuan jelas.

Dan `edit_note_body` (#D18) sudah menyediakan `op: "insert"`. Artinya **setelah journal ada, append mungkin tidak butuh tool baru sama sekali.**

## 2. Temuan dari kode yang membentuk desain ini

1. **StyleNotes tidak punya konsep "hari ini" di data.** Tidak ada kolom tanggal di `notes`, tidak ada journal, tidak ada template. `created_at`/`updated_at` ada, tapi keduanya berarti "kapan ditulis", bukan "hari mana yang diwakili".
2. **`settings` adalah satu row JSON device-local** (`cloud-sync-ai-mcp.md` §3.3, #24). Aturan yang ada: preferensi yang bermakna lintas device masuk `settings_cloud`. Tapi tabel itu **belum ada** (Fase 0 sync belum dikerjakan), jadi §5.2 di bawah memutuskan lebih hati-hati daripada sekadar menuruti aturan itu.
3. **`localToday()` sudah ada** (`stores/settings.svelte.ts`, #D19) dan sudah memakai `settings.timezone`. Journal tidak perlu logika zona baru.
4. **Folder sudah punya repo** (`foldersRepo`, `workspace_id`, `position`) tapi dibaca sebagai daftar kustomisasi, bukan sebagai tempat tujuan penulisan. Journal butuh folder tujuan yang **boleh belum ada**.
5. **Note dibuat lewat `makeNote`/`createNote`** dan disimpan lewat `notesRepo.upsert`; tidak ada jalur "temukan-atau-buat" di app hari ini. Yang paling dekat adalah `commitNewNote` di `workspace-controller.svelte.ts`, dan itu terikat UI.
6. **UI settings punya pola jelas**: `nav` + `section` di `SettingsPanel.svelte`, komponen per section (`AppearanceSettings.svelte`), kontrol dari `base/*`. Journal settings mengikuti pola itu.

## 3. Bentuk data: tanggal disimpan di mana?

Tiga pilihan, dan ini keputusan paling menentukan:

| Opsi | Cara | Konsekuensi |
|---|---|---|
| **A. Judul saja** | Note berjudul `2026-09-30` di folder journal | Nol migrasi. Tapi: user yang mengubah judul ke "Rabu, 30 Sep" memutus journalnya sendiri; dan judul adalah teks yang ditampilkan, bukan kunci |
| **B. Kolom `notes.journal_day`** | Kolom `TEXT` nullable, indeks unik `(workspace_id, journal_day)` | Satu migrasi. Kuat: judul bebas, hari tidak bisa terduplikasi, dan "cari note hari ini" jadi query indeks, bukan pencocokan judul |
| **C. Tag penanda** | Tag `journal/2026-09-30` | Nol migrasi, tapi tag adalah namespace user — mencampur penanda sistem ke data yang user kelola akan bocor ke UI tag, autocomplete, dan `list_tags` |

**Rekomendasi: B.** Alasan utamanya bukan kerapian, tapi **idempotensi**: journal yang salah membuat note kedua untuk hari yang sama lebih buruk daripada journal yang gagal dibuat. Hanya B yang bisa menjaminnya di level database. Opsi A dan C bergantung pada judul/tag yang user bisa ubah dari UI lain — dan `update_note` (#D17) sekarang justru **memberi agent kemampuan mengubah keduanya**. Jadi A/C membuat jaminan itu bisa dilanggar oleh tool yang baru kita tambahkan.

Nullable + indeks unik: note biasa `journal_day = NULL`, dan SQLite tidak membandingkan NULL, jadi tidak ada konflik antar note biasa.

## 4. Perilaku "hari ini"

Yang perlu diputuskan dan tidak boleh ditebak:

- **Hari mana:** `localToday()` (#D19). Sudah selesai, tinggal dipakai.
- **Membandingkan dengan note yang sudah ada:** cari `journal_day = localToday()` di workspace aktif. Kalau ada → pakai. Kalau tidak → buat.
- **Di tengah malam:** user membuka app pukul 23:59 lalu 00:01. Journal harus **menghitung ulang** hari saat dibuka, bukan menyimpan hasil saat mount. Ini berarti `localToday()` dipanggil di titik pakai, bukan di module scope.
- **Workspace:** journal itu per workspace, karena workspace adalah vault (§13d). Tidak ada journal global.

## 5. Permukaan yang berubah

### 5.1 Database — satu migrasi

```
Migration { version: 18, description: "add_note_journal_day" }
  ALTER TABLE notes ADD COLUMN journal_day TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_journal_day
    ON notes (workspace_id, journal_day) WHERE journal_day IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_notes_journal_lookup ON notes (journal_day);
```

Indeks unik parsial (`WHERE journal_day IS NOT NULL`) karena SQLite menganggap NULL berbeda satu sama lain, tapi parsial membuat maksudnya eksplisit dan lebih murah.

Catatan: `notesRepo.upsert` dan `note_upsert_tx` harus ikut membawa kolom ini, dan `REPLACE`/`replaceAll` juga. Ini menyentuh kode non-journal — risiko yang sama seperti #D13, dan harus diperlakukan dengan hati-hati yang sama.

### 5.2 Settings - device-local dulu, pindah ke `settings_cloud` saat Fase 0

```
journalEnabled: boolean            // default false: fitur ini opt-in
journalFolder: string              // default 'journal'
journalFormat: string              // default 'YYYY-MM-DD'
journalTemplate: string            // markdown awal untuk note baru
```

Keempatnya masuk **`settings` yang device-local** sekarang.

**Koreksi terhadap versi pertama dokumen ini.** Versi awal menulis bahwa setting
journal "jelas lintas device" sehingga harus masuk `settings_cloud` **sekarang**.
Itu terlalu cepat, dan dokumen ini mencatat koreksinya alih-alih menimpanya:

- `settings_cloud` **tidak ada**. `cloud-sync-ai-mcp.md` §3.3 + #24
  memutuskan tabel itu untuk preferensi lintas device, tapi Fase 0 sync belum
  dikerjakan dan belum ada sinkronisasi apa pun di repo ini.
- "Taruh di `settings_cloud`" hari ini berarti membangun sebagian Fase 0 di
  tengah fitur journal, dengan asumsi yang belum diuji, demi sesuatu yang belum
  dipakai.
- **Karena `journal_day` yang jadi kunci, tidak sync tidak merusak apa pun.**
  Yang berbeda antar device hanya nama folder, judul, dan format tampilan — bukan
  hari mana yang diwakili sebuah note. Ini persis jenis risiko yang bisa ditunda.

**Komitmen yang mengikat** (inilah yang mencegah kesalahan "klaim lama tidak
akurat" di #24 terulang): saat Fase 0 sync dikerjakan, keempat key ini
**harus dipindah** ke `settings_cloud`, bersama key preferensi lintas device
lainnya. Pekerjaannya kecil — pindah 4 key + update `settingsRepo.load/save` —
dan daftarnya sudah ada di dokumen sync §10.

**Kondisi yang membatalkan keputusan ini:** kalau sync akan dikerjakan dalam
waktu dekat, membangun `settings_cloud` lebih dulu lebih murah daripada
memindah nanti.

### 5.3 App — journal sebagai fitur

- **`journal.ts`** (pure, di `content/`): format tanggal (`YYYY-MM-DD`, `YYYY/MM/DD`, `DD MMM YYYY`), judul default, dan pembuatan body dari template. Diuji, tanpa DOM.
- **`journal.svelte.ts`** (store): `openToday()`, `findByDay(day)`, `createForDay(day)` — temukan-atau-buat, dengan penanganan tabrakan indeks unik (dua window membuat note hari yang sama bersamaan).
- **UI**: tombol "Today" di feed/rail, dan navigasi hari sebelumnya/berikutnya di note window kalau note itu `journal_day` terisi.
- **`JournalSettings.svelte`**: section `journal` di `SettingsPanel`, kontrol dari `base/*`, semua string lewat `t()`.

### 5.4 MCP — satu tool

```
journal_today { workspace? }
  -> { ok, note: { id, ref, title, journalDay }, created: boolean }
```

- Read-atau-write dalam satu panggilan. Tapi ini **write** (bisa membuat note), jadi ia butuh grant scope `notes` `access: write`. Kalau grant read-only, ia tetap bisa **menemukan** note yang ada dan mengembalikannya, dan hanya menolak saat harus membuat: itu perilaku yang berguna, bukan error buta.
- Setelah ini, agent append lewat `edit_note_body { op: "insert", position: "end" }` — **tanpa tool baru.** Ini yang membatalkan kebutuhan `append_to_note`.

## 6. Sync lintas device (diputuskan: journal **harus** sync)

Note journal ikut sync karena `notes` adalah entity sync inti, dan `journal_day`
ikut sebagai kolom biasa — sync engine tidak perlu tahu kolom itu ada, ia hanya
mengirim record. Tidak ada tabel sync baru, tidak ada entity baru.

**Tapi ada satu konsekuensi yang tidak bisa ditawar, dan inilah alasan
`journal_day` lebih penting justru karena sync akan ada:**

```
Laptop  (offline) 09:00 -> buka journal hari ini -> buat note A (journal_day: 2026-09-30)
Desktop (online)  09:05 -> buka journal hari ini -> buat note B (journal_day: 2026-09-30)
                            sync
                     dua note untuk hari yang sama
```

Indeks unik mencegah ini **di dalam satu database**. Di dua database yang baru
bertemu kemudian, indeks tidak bisa mencegah apa pun — keduanya sudah punya
note-nya masing-masing, dan sync hanya memutuskan apa yang terjadi **setelah**
fakta.

Ini **bukan** alasan untuk membatalkan `journal_day`. Justru sebaliknya: ia
memberi sync sesuatu yang bisa **dideteksi**. Kalau hari hanya ada di judul,
tidak ada cara andal untuk tahu dua note mewakili hari yang sama — sync akan
melihat dua judul mirip dan tidak bisa memutuskan.

**Yang harus diputuskan saat Fase 0, bukan sekarang, tapi dicatat sekarang:**
perlakukan `(workspace_id, journal_day)` sebagai **identity**, bukan baris biasa.
Saat dua device bertabrakan pada hari yang sama, **gabung body-nya** alih-alih
memilih satu pemenang — dua bagian journal pada hari yang sama keduanya nyata,
dan membuang salah satunya = kehilangan tulisan user. Ini berbeda dari kebijakan
conflict-copy biasa (`cloud-sync-ai-mcp.md`, yang menulis "salinan konflik" untuk
record biasa), dan **hanya journal yang butuh** aturan ini.

Konsekuensi lanjutan: `notes.body` **tidak boleh** diperlakukan sebagai LWW buta
untuk baris yang punya `journal_day`. Itu masuk daftar pekerjaan Fase 0.

## 7. Risiko yang harus ditangani

| Risiko | Penanganan |
|---|---|
| Dua window membuat journal hari yang sama | Indeks unik + `journal_today` menangkap tabrakan dan **membaca ulang**, bukan gagal |
| User mengubah `journalFolder` | Note lama tetap punya `journal_day`; pencarian ikut `journal_day`, bukan folder. Folder hanya menentukan tempat note **baru** |
| User menghapus note journal | Hari itu jadi kosong; membuka lagi akan membuatnya ulang. Itu benar, bukan bug |
| `journalFormat` diubah | Hanya memengaruhi note baru. Note lama menyimpan `journal_day`, jadi tidak ada yang patah |
| Journal + `update_note` agent | Agent bisa memindahkan folder note journal. Tidak fatal **karena** kuncinya `journal_day`, bukan folder — ini alasan tambahan memilih opsi B |
| Zona waktu berubah | `localToday()` dipanggil saat pakai; tidak ada cache hari |

## 8. Keputusan tercatat

| # | Keputusan | Alasan |
|---|---|---|
| J1 | Hari disimpan di kolom `notes.journal_day`, bukan judul atau tag | Hanya ini yang bisa menjamin idempotensi di level DB; judul dan tag bisa diubah agent lewat `update_note` |
| J2 | Indeks unik parsial `(workspace_id, journal_day)` | Satu note per hari per workspace, dipaksa database |
| J3 | Hari dihitung `localToday()` (#D19) | Prasyarat yang sudah selesai; tidak ada logika zona baru |
| J4 | Journal per workspace | Workspace adalah vault |
| J5 | Setting journal **opt-in**, default mati | Fitur yang menulis note otomatis harus mendapat izin eksplisit |
| J6 | Append tidak dapat tool baru | `edit_note_body { op: "insert" }` sudah cukup, dan sekarang punya tujuan jelas |
| J7 | `journal_today` tetap berguna saat read-only | Menemukan note hari ini tidak butuh write |
| J8 | Setting journal **device-local dulu**, pindah ke `settings_cloud` saat Fase 0 | `settings_cloud` belum ada; karena `journal_day` yang jadi kunci, tidak sync tidak merusak apa pun. Lihat §5.2 |
| J9 | Journal **harus** sync; `(workspace_id, journal_day)` diperlakukan sebagai **identity** | Dua device offline bisa membuat note untuk hari yang sama; merge body, jangan pilih pemenang. Lihat §6 |

## 9. Yang masih terbuka

1. **Template journal: berapa jauh?** Sudah diimplementasikan minimal —
   `{date}` dan `{title}`, tanpa kondisional. Kalau perlu loop atau tanggal
   relatif, itu spec terpisah.
2. **Journal mingguan/bulanan.** Belum ada. `journal_day` siap menampungnya
   (`YYYY-Www`, `YYYY-MM`) kalau nanti diinginkan, tapi format dan UI-nya belum
   diputuskan.
3. **Kebijakan merge sync (§6/J9).** Dicatat, diputuskan saat Fase 0.
4. **Pemindahan setting ke `settings_cloud`.** Dicatat sebagai komitmen (§5.2),
   dikerjakan saat Fase 0.

---

## 10. Yang **tidak** ada di dokumen ini

- Implementasi sync journal — hanya kebijakannya yang dicatat (§6, J9).
- Template per hari dalam seminggu, atau journal mingguan/bulanan.
- Reminder/notifikasi journal.
- Migrasi note lama yang kebetulan berjudul tanggal menjadi journal.
