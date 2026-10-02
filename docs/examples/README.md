# Custom CSS examples

Lembar CSS siap-tempel untuk menguji tema/plugin UI (`Settings → Appearance → plugin UI → CSS`).
Semuanya memakai **token tema** yang sudah ada, jadi ikut light/dark dan accent tanpa kerja
tambahan — dan tidak bergantung pada utility Tailwind (Tailwind tidak dikompilasi runtime;
lihat `docs/design/archive/ui-extensions.md` temuan 15).

## Cara pakai

1. Buka Settings → Appearance.
2. Buat plugin UI baru.
3. Tempel isi salah satu file di kolom CSS.
4. Simpan dan amati perubahannya.

Boleh digabung: tempel beberapa lembar jadi satu.

## Hook yang stabil

Menarget kombinasi utility Tailwind rapuh (class bisa berubah kapan saja). Untuk CSS tema,
pakai hook ini:

| Hook | Elemen | Dipakai di |
|---|---|---|
| `[data-ui="titlebar"]` | header jendela workspace | `TitleBar.svelte` |
| `[data-ui="notes-feed"]` | panel daftar catatan | `NotesFeed.svelte` |
| `[data-ui="note-card"]` | satu kartu catatan | `NotesFeed.svelte` |
| `[data-ui="note-header"]` | header editor catatan | `NoteHeader.svelte` |
| `[data-ui="settings-panel"]` | panel Settings | `SettingsPanel.svelte` |
| `[data-ui="dock-rail"]` | deretan item dock | `DockRailItems.svelte` |
| `[data-slot="base-button"]` | setiap tombol `base/Button` | `base/button.svelte` |
| `[data-slot="base-input"]` | setiap `base/Input` | `base/input.svelte` |
| `[data-slot="base-textarea"]` | setiap `base/Textarea` | `base/textarea.svelte` |

## Token yang bisa dipakai

- Warna: `--color-primary`, `--color-on-primary`, `--color-primary-container`,
  `--color-tertiary`, `--color-error`, `--color-surface`,
  `--color-surface-container-lowest`, `--color-surface-container-low`, `--color-surface-container`,
  `--color-surface-container-high`, `--color-surface-container-highest`,
  `--color-on-surface`, `--color-on-surface-variant`, `--color-outline`,
  `--color-outline-variant`, `--color-scrim`.
- Kaca: `--glass-stroke`, `--glass-highlight`, `--glass-shadow`, `--glass-glow`, `--glass-blur`.
- Bentuk: `--radius`, `--radius-sm|md|lg|xl|2xl|3xl|4xl`.
- Font: `--font-headline`, `--font-body`, `--font-label`, `--font-code`.

## Prinsip

- **Token, bukan hex.** Hex membuat tema rusak saat mode/accent berganti.
- **Tanpa Tailwind.** Tidak ada `bg-*`/`text-*` yang tersedia untuk CSS plugin. Pakai
  `background-color: var(--color-…)`.
- **Spesifisitas dulu, `!important` terakhir.** Hook `[data-ui]` sudah cukup spesifik untuk
  menimpa utility. Kalau ada yang tidak menang, itu biasanya style inline — baru pakai
  `!important`.
- Jangan menambah `--var` milik app (mis. `--glass-blur`) sembarangan; token manifest adalah
  jalur resminya.
