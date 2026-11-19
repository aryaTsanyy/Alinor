# Alinor: spesifikasi visual

Dokumen ini wajib diikuti oleh semua UI mulai Phase 3 (lihat `CLAUDE.md` dan `TASKS.md`). Bahasa antarmuka: Indonesia. Istilah kode (nama token, komponen, status store) tetap dalam bahasa Inggris.

Bagian yang belum diputuskan pemilik ada di "Usulan untuk persetujuan pemilik" dan "Pertanyaan terbuka". Jangan diimplementasikan sebagai final sebelum diputuskan.

## a. Prinsip dan batas

1. **Kaca hanya untuk kartu dan panel.** Latar halaman, header, navigasi, dialog, dan banner peringatan tidak memakai kaca. Satu layar boleh punya banyak kartu kaca, tetapi tidak pernah satu lapisan kaca yang menutupi seluruh layar.
2. **Jujur soal beban.** Semua hal yang dihitung engine dan semua kasus yang tidak didukung harus terlihat, tidak pernah disembunyikan, dikecilkan jadi ikon tanpa teks, atau hanya ada di tooltip:
   - kuadran turunan dan alasannya,
   - Q1 overflow,
   - kekurangan feasibility,
   - kasus jadwal tak didukung (acara melewati tengah malam, exception `MODIFIED`),
   - status penyimpanan (`needs-attention`, sesi `unavailable`, `persistError`).
3. **Makna tidak pernah hanya lewat warna.** Kuadran dan peringatan selalu punya label teks dan ikon (bagian g).
4. **Kontras dihitung, bukan dikira.** Setiap pasangan teks/latar di dokumen ini ada di tabel kontras (bagian c). Pasangan baru, latar baru di belakang kaca, atau perubahan alpha harus dihitung ulang sebelum dipakai.
5. **Waktu diturunkan, bukan dihitung mundur.** Lihat bagian h.

## b. Token warna

Palet merek (sumber tunggal, semua token adalah turunannya):

| Nama | Hex | Peran |
| --- | --- | --- |
| Navy | `#14213D` | Latar mode dark; teks utama di latar terang; teks di atas fill coral dan biru langit |
| Cream | `#F4EDE0` | Latar mode light; teks di atas navy |
| Coral | `#FF6B5B` | Aksen: CTA, angka, kata yang ditekankan |
| Biru langit | `#98D3F3` | Warna merek; tint kaca |

### Aturan pakai yang tidak boleh dilanggar

- **Biru langit tidak boleh jadi teks di latar terang** (1,39:1 di cream). Di mode light ia hanya dipakai sebagai fill, tint, atau dekorasi, dan teks di atasnya selalu navy. Untuk teks atau tautan bernuansa merek di mode light, pakai `--brand-ink`.
- **Coral tidak boleh jadi teks di latar terang**, termasuk teks besar (2,40:1 di cream, di bawah 3:1). Di mode light coral hanya dipakai sebagai fill dengan teks navy. Untuk angka atau kata yang ditekankan di mode light, pakai `--accent-ink`.
- **Di mode dark, biru langit boleh jadi teks** di semua permukaan.
- **Coral mentah di mode dark** hanya lolos di latar navy polos, kaca di atas navy, dan kartu opak. Ia gagal di kaca di atas blob (3,80:1 dan 4,31:1). Karena itu teks aksen di dark selalu memakai `--accent-ink` (`#FF8679`), yang lolos di semua permukaan dark.

Varian turunan dihitung dengan script: hue dan saturasi tetap, lalu lightness digeser sampai rasio ≥ 4,5:1 di **semua** permukaan mode itu, termasuk kaca di atas blob terkuat. Di mode light dicari varian paling terang yang lolos, di mode dark yang paling gelap. Varian hover dibuat dengan mencampur fill dengan navy, lalu dicek ulang.

### Token mode light

| Token | Nilai | Peran |
| --- | --- | --- |
| `--bg` | `#F4EDE0` | Latar halaman |
| `--bg-blob-sky` | `rgb(152 211 243 / 0.55)` | Pusat radial gradient dekoratif di latar |
| `--bg-blob-coral` | `rgb(255 107 91 / 0.30)` | Pusat radial gradient dekoratif kedua |
| `--surface-glass` | `rgb(244 237 224 / 0.62)` + tint `rgb(152 211 243 / 0.06)` | Isi kartu/panel kaca |
| `--surface-glass-border` | `rgb(20 33 61 / 0.10)` | Tepi kaca (dekoratif) |
| `--surface-solid` | `#E9EAE2` (cream + 12% biru langit) | Fallback opak kartu/panel; isi dialog |
| `--text` | `#14213D` | Teks utama |
| `--text-muted` | `rgb(20 33 61 / 0.65)` | Teks sekunder. Alpha 0,65 adalah nilai terkecil yang lolos 4,5:1 di semua permukaan light |
| `--accent` | `#FF6B5B` | Fill CTA, lencana Q1, banner `needs-attention` |
| `--accent-hover` | `#E36257` (coral + 12% navy) | Hover fill coral |
| `--accent-ink` | `#C81400` | Teks aksen: angka, kata ditekankan |
| `--on-accent` | `#14213D` | Teks di atas `--accent` dan `--brand` |
| `--brand` | `#98D3F3` | Fill chip, lencana Q2 |
| `--brand-hover` | `#8BC1E1` (biru langit + 10% navy) | Hover fill biru langit |
| `--brand-ink` | `#126A9A` | Tautan, teks bernuansa merek |
| `--focus` | `#14213D` | Focus ring |

### Token mode dark

| Token | Nilai | Peran |
| --- | --- | --- |
| `--bg` | `#14213D` | Latar halaman |
| `--bg-blob-sky` | `rgb(152 211 243 / 0.22)` | Radial gradient dekoratif |
| `--bg-blob-coral` | `rgb(255 107 91 / 0.18)` | Radial gradient dekoratif kedua |
| `--surface-glass` | `rgb(20 33 61 / 0.55)` + tint `rgb(152 211 243 / 0.08)` | Isi kartu/panel kaca |
| `--surface-glass-border` | `rgb(152 211 243 / 0.18)` | Tepi kaca (dekoratif) |
| `--surface-solid` | `#21334F` (navy + 10% biru langit) | Fallback opak; isi dialog |
| `--text` | `#F4EDE0` | Teks utama |
| `--text-muted` | `rgb(244 237 224 / 0.61)` | Teks sekunder. Alpha 0,61 adalah nilai terkecil yang lolos di semua permukaan dark |
| `--accent` | `#FF6B5B` | Fill CTA |
| `--accent-hover` | `#E36257` | Hover fill coral |
| `--accent-ink` | `#FF8679` | Teks aksen |
| `--on-accent` | `#14213D` | Teks di atas `--accent` dan `--brand` |
| `--brand` | `#98D3F3` | Fill chip, lencana Q2 |
| `--brand-hover` | `#8BC1E1` | Hover fill biru langit |
| `--brand-ink` | `#98D3F3` | Tautan, teks bernuansa merek |
| `--focus` | `#98D3F3` | Focus ring |

Token didaftarkan ke Tailwind 4 lewat `@theme inline` di `globals.css` (pola yang sudah ada untuk `--background` dan `--foreground`). Contohnya `--color-accent: var(--accent)`, supaya kelas seperti `bg-accent` dan `text-accent-ink` tersedia. Cara memilih mode (ikut sistem atau toggle manual) masih pertanyaan terbuka.

## c. Tabel kontras

Rasio dihitung dengan rumus relative luminance WCAG 2.x oleh script Node sekali pakai, yang tidak di-commit. Warna beralpha dikomposit ke latarnya lebih dulu.

Permukaan kaca diuji pada **latar terburuk**: komposit kaca di atas titik terkuat setiap blob, tanpa efek blur. Blur hanya merata-ratakan warna latar, jadi titik terkuat tanpa blur adalah batas paling ketat.

Ambang: 4,5:1 untuk teks biasa, 3:1 untuk teks besar dan komponen UI (focus ring, border yang menjadi penanda komponen).

Baris `FAIL` adalah **pasangan yang sengaja dilarang**, dicantumkan sebagai dasar aturan di bagian b dan f. Pasangan itu tidak boleh dipakai.

| Mode | Pemakaian | Teks / depan | Latar | Rasio | Min | Hasil |
| --- | --- | --- | --- | --- | --- | --- |
| light | body text | --text (navy) #14213D | page (cream) #F4EDE0 | 13.72:1 | 4.5:1 | PASS |
| light | muted text | --text-muted (navy @0.65) #626876 | page (cream) #F4EDE0 | 4.77:1 | 4.5:1 | PASS |
| light | accent text | --accent-ink #C81400 | page (cream) #F4EDE0 | 5.07:1 | 4.5:1 | PASS |
| light | link / brand text | --brand-ink #126A9A | page (cream) #F4EDE0 | 5.08:1 | 4.5:1 | PASS |
| light | focus ring | --focus (navy) #14213D | page (cream) #F4EDE0 | 13.72:1 | 3:1 | PASS |
| light | body text | --text (navy) #14213D | glass over cream #EEEBE1 | 13.44:1 | 4.5:1 | PASS |
| light | muted text | --text-muted (navy @0.65) #606876 | glass over cream #EEEBE1 | 4.73:1 | 4.5:1 | PASS |
| light | accent text | --accent-ink #C81400 | glass over cream #EEEBE1 | 4.97:1 | 4.5:1 | PASS |
| light | link / brand text | --brand-ink #126A9A | glass over cream #EEEBE1 | 4.97:1 | 4.5:1 | PASS |
| light | focus ring | --focus (navy) #14213D | glass over cream #EEEBE1 | 13.44:1 | 3:1 | PASS |
| light | body text | --text (navy) #14213D | glass over sky blob #DCE6E5 | 12.58:1 | 4.5:1 | PASS |
| light | muted text | --text-muted (navy @0.65) #5A6678 | glass over sky blob #DCE6E5 | 4.58:1 | 4.5:1 | PASS |
| light | accent text | --accent-ink #C81400 | glass over sky blob #DCE6E5 | 4.65:1 | 4.5:1 | PASS |
| light | link / brand text | --brand-ink #126A9A | glass over sky blob #DCE6E5 | 4.65:1 | 4.5:1 | PASS |
| light | focus ring | --focus (navy) #14213D | glass over sky blob #DCE6E5 | 12.58:1 | 3:1 | PASS |
| light | body text | --text (navy) #14213D | glass over coral blob #F0DED3 | 12.19:1 | 4.5:1 | PASS |
| light | muted text | --text-muted (navy @0.65) #616371 | glass over coral blob #F0DED3 | 4.54:1 | 4.5:1 | PASS |
| light | accent text | --accent-ink #C81400 | glass over coral blob #F0DED3 | 4.51:1 | 4.5:1 | PASS |
| light | link / brand text | --brand-ink #126A9A | glass over coral blob #F0DED3 | 4.51:1 | 4.5:1 | PASS |
| light | focus ring | --focus (navy) #14213D | glass over coral blob #F0DED3 | 12.19:1 | 3:1 | PASS |
| light | body text | --text (navy) #14213D | fallback card (opaque) #E9EAE2 | 13.17:1 | 4.5:1 | PASS |
| light | muted text | --text-muted (navy @0.65) #5F6777 | fallback card (opaque) #E9EAE2 | 4.68:1 | 4.5:1 | PASS |
| light | accent text | --accent-ink #C81400 | fallback card (opaque) #E9EAE2 | 4.87:1 | 4.5:1 | PASS |
| light | link / brand text | --brand-ink #126A9A | fallback card (opaque) #E9EAE2 | 4.87:1 | 4.5:1 | PASS |
| light | focus ring | --focus (navy) #14213D | fallback card (opaque) #E9EAE2 | 13.17:1 | 3:1 | PASS |
| light | primary button label | navy #14213D | --accent (coral) #FF6B5B | 5.71:1 | 4.5:1 | PASS |
| light | primary button label (hover) | navy #14213D | --accent-hover #E36257 | 4.68:1 | 4.5:1 | PASS |
| light | chip / Q2 badge label | navy #14213D | --brand (sky) #98D3F3 | 9.85:1 | 4.5:1 | PASS |
| light | chip label (hover) | navy #14213D | --brand-hover #8BC1E1 | 8.23:1 | 4.5:1 | PASS |
| light | focus ring next to coral fill | navy #14213D | coral #FF6B5B | 5.71:1 | 3:1 | PASS |
| light | secondary button border | --text (navy) #14213D | page (cream) #F4EDE0 | 13.72:1 | 3:1 | PASS |
| light | decorative only (not for text) | coral #FF6B5B | page (cream) #F4EDE0 | 2.40:1 | 4.5:1 | FAIL |
| light | decorative only (not for text) | sky #98D3F3 | page (cream) #F4EDE0 | 1.39:1 | 4.5:1 | FAIL |
| light | timer digits | --text (navy) #14213D | glass over sky blob #DCE6E5 | 12.58:1 | 4.5:1 | PASS |
| dark | body text | --text (cream) #F4EDE0 | page (navy) #14213D | 13.72:1 | 4.5:1 | PASS |
| dark | muted text | --text-muted (cream @0.61) #9D9DA0 | page (navy) #14213D | 5.93:1 | 4.5:1 | PASS |
| dark | accent text | --accent-ink (coral) #FF8679 | page (navy) #14213D | 6.80:1 | 4.5:1 | PASS |
| dark | link / brand text | --brand-ink (sky) #98D3F3 | page (navy) #14213D | 9.85:1 | 4.5:1 | PASS |
| dark | focus ring | --focus (sky) #98D3F3 | page (navy) #14213D | 9.85:1 | 3:1 | PASS |
| dark | body text | --text (cream) #F4EDE0 | glass over navy #1F2F4C | 11.48:1 | 4.5:1 | PASS |
| dark | muted text | --text-muted (cream @0.61) #A1A3A6 | glass over navy #1F2F4C | 5.29:1 | 4.5:1 | PASS |
| dark | accent text | --accent-ink (coral) #FF8679 | glass over navy #1F2F4C | 5.69:1 | 4.5:1 | PASS |
| dark | link / brand text | --brand-ink (sky) #98D3F3 | glass over navy #1F2F4C | 8.24:1 | 4.5:1 | PASS |
| dark | focus ring | --focus (sky) #98D3F3 | glass over navy #1F2F4C | 8.24:1 | 3:1 | PASS |
| dark | body text | --text (cream) #F4EDE0 | glass over sky blob #2B3F5C | 9.12:1 | 4.5:1 | PASS |
| dark | muted text | --text-muted (cream @0.61) #A5A9AD | glass over sky blob #2B3F5C | 4.51:1 | 4.5:1 | PASS |
| dark | accent text | --accent-ink (coral) #FF8679 | glass over sky blob #2B3F5C | 4.52:1 | 4.5:1 | PASS |
| dark | link / brand text | --brand-ink (sky) #98D3F3 | glass over sky blob #2B3F5C | 6.55:1 | 4.5:1 | PASS |
| dark | focus ring | --focus (sky) #98D3F3 | glass over sky blob #2B3F5C | 6.55:1 | 3:1 | PASS |
| dark | body text | --text (cream) #F4EDE0 | glass over coral blob #30354E | 10.36:1 | 4.5:1 | PASS |
| dark | muted text | --text-muted (cream @0.61) #A8A5A7 | glass over coral blob #30354E | 4.95:1 | 4.5:1 | PASS |
| dark | accent text | --accent-ink (coral) #FF8679 | glass over coral blob #30354E | 5.14:1 | 4.5:1 | PASS |
| dark | link / brand text | --brand-ink (sky) #98D3F3 | glass over coral blob #30354E | 7.44:1 | 4.5:1 | PASS |
| dark | focus ring | --focus (sky) #98D3F3 | glass over coral blob #30354E | 7.44:1 | 3:1 | PASS |
| dark | body text | --text (cream) #F4EDE0 | fallback card (opaque) #21334F | 10.94:1 | 4.5:1 | PASS |
| dark | muted text | --text-muted (cream @0.61) #A2A4A8 | fallback card (opaque) #21334F | 5.11:1 | 4.5:1 | PASS |
| dark | accent text | --accent-ink (coral) #FF8679 | fallback card (opaque) #21334F | 5.42:1 | 4.5:1 | PASS |
| dark | link / brand text | --brand-ink (sky) #98D3F3 | fallback card (opaque) #21334F | 7.85:1 | 4.5:1 | PASS |
| dark | focus ring | --focus (sky) #98D3F3 | fallback card (opaque) #21334F | 7.85:1 | 3:1 | PASS |
| dark | primary button label | navy #14213D | --accent (coral) #FF6B5B | 5.71:1 | 4.5:1 | PASS |
| dark | primary button label (hover) | navy #14213D | --accent-hover #E36257 | 4.68:1 | 4.5:1 | PASS |
| dark | chip / Q2 badge label | navy #14213D | --brand (sky) #98D3F3 | 9.85:1 | 4.5:1 | PASS |
| dark | focus ring next to coral fill | sky #98D3F3 | coral #FF6B5B | 1.72:1 | 3:1 | FAIL |
| dark | secondary button border | --text (cream) #F4EDE0 | page (navy) #14213D | 13.72:1 | 3:1 | PASS |
| dark | raw coral as text (why --accent-ink is lighter) | coral #FF6B5B | page (navy) #14213D | 5.71:1 | 4.5:1 | PASS |
| dark | raw coral as text (why --accent-ink is lighter) | coral #FF6B5B | glass over navy #1F2F4C | 4.78:1 | 4.5:1 | PASS |
| dark | raw coral as text (why --accent-ink is lighter) | coral #FF6B5B | glass over sky blob #2B3F5C | 3.80:1 | 4.5:1 | FAIL |
| dark | raw coral as text (why --accent-ink is lighter) | coral #FF6B5B | glass over coral blob #30354E | 4.31:1 | 4.5:1 | FAIL |
| dark | raw coral as text (why --accent-ink is lighter) | coral #FF6B5B | fallback card (opaque) #21334F | 4.55:1 | 4.5:1 | PASS |
| dark | cream ring next to coral fill (rejected) | cream #F4EDE0 | coral #FF6B5B | 2.40:1 | 3:1 | FAIL |
| light | needs-attention banner label | navy #14213D | --accent (coral) #FF6B5B | 5.71:1 | 4.5:1 | PASS |
| dark | needs-attention banner label | navy #14213D | --accent (coral) #FF6B5B | 5.71:1 | 4.5:1 | PASS |
| light | banner title/body | --text #14213D | banner --surface-solid #E9EAE2 | 13.17:1 | 4.5:1 | PASS |
| light | banner secondary text | --text-muted #5F6777 | banner --surface-solid #E9EAE2 | 4.68:1 | 4.5:1 | PASS |
| light | banner icon Q1/feasibility | --accent-ink #C81400 | banner --surface-solid #E9EAE2 | 4.87:1 | 3:1 | PASS |
| light | banner icon unsupported | --brand-ink #126A9A | banner --surface-solid #E9EAE2 | 4.87:1 | 3:1 | PASS |
| light | banner left rule Q1/feasibility (decorative) | --accent #FF6B5B | banner --surface-solid #E9EAE2 | 2.31:1 | 3:1 | FAIL |
| light | banner left rule unsupported (decorative) | --brand-ink #126A9A | banner --surface-solid #E9EAE2 | 4.87:1 | 3:1 | PASS |
| light | banner edge vs page | --surface-solid #E9EAE2 | page #F4EDE0 | 1.04:1 | 3:1 | FAIL |
| dark | banner title/body | --text #F4EDE0 | banner --surface-solid #21334F | 10.94:1 | 4.5:1 | PASS |
| dark | banner secondary text | --text-muted #A2A4A8 | banner --surface-solid #21334F | 5.11:1 | 4.5:1 | PASS |
| dark | banner icon Q1/feasibility | --accent-ink #FF8679 | banner --surface-solid #21334F | 5.42:1 | 3:1 | PASS |
| dark | banner icon unsupported | --brand-ink #98D3F3 | banner --surface-solid #21334F | 7.85:1 | 3:1 | PASS |
| dark | banner left rule Q1/feasibility (decorative) | --accent #FF6B5B | banner --surface-solid #21334F | 4.55:1 | 3:1 | PASS |
| dark | banner left rule unsupported (decorative) | --brand-ink #98D3F3 | banner --surface-solid #21334F | 7.85:1 | 3:1 | PASS |
| dark | banner edge vs page | --surface-solid #21334F | page #14213D | 1.25:1 | 3:1 | FAIL |

Hal yang perlu diperhatikan:

- Margin `--accent-ink` dan `--brand-ink` di mode light tipis di kaca di atas blob coral (4,51:1). Blob tidak boleh diperkuat (alpha lebih tinggi) tanpa menghitung ulang.
- Focus ring biru langit di samping fill coral (dark) hanya 1,72:1, dan ring cream juga gagal (2,40:1). Karena itu focus ring **selalu** memakai offset (bagian f), sehingga warna yang bersebelahan dengan ring adalah permukaan, bukan fill tombol.
- Banner peringatan opak (bagian g) diuji pada `--surface-solid`. Teks dan ikonnya lolos. Ada dua baris yang gagal, keduanya sengaja dicatat:
  - Garis kiri coral di mode light hanya 2,31:1 terhadap `--surface-solid`.
  - Tepi banner terhadap halaman hanya 1,04:1 (light) dan 1,25:1 (dark).
  Keduanya dekoratif. Makna banner dibawa oleh ikon dan judul teks, bukan oleh garis atau tepi, jadi garis dan tepi tidak boleh menjadi satu-satunya pembeda. Banner diberi border 1px `--surface-glass-border` seperti kartu.
- Status `disabled` dikecualikan dari syarat kontras WCAG, tetapi tetap wajib punya teks yang terbaca dan alasan (bagian f).

## d. Spesifikasi glass

| Properti | Light | Dark |
| --- | --- | --- |
| Isi | `background: linear-gradient(rgb(152 211 243 / 0.06), rgb(152 211 243 / 0.06)), rgb(244 237 224 / 0.62)` | `background: linear-gradient(rgb(152 211 243 / 0.08), rgb(152 211 243 / 0.08)), rgb(20 33 61 / 0.55)` |
| Blur | `backdrop-filter: blur(16px) saturate(140%)` untuk kartu; `blur(24px) saturate(140%)` untuk panel | sama |
| Border | `1px solid rgb(20 33 61 / 0.10)` | `1px solid rgb(152 211 243 / 0.18)` |
| Kilau tepi atas | `inset 0 1px 0 rgb(244 237 224 / 0.60)` | `inset 0 1px 0 rgb(244 237 224 / 0.06)` |
| Bayangan | `0 8px 24px rgb(20 33 61 / 0.12)` | Tidak ada bayangan jatuh; elevasi lewat border dan kilau tepi (bayangan gelap tidak terlihat di navy) |

Tulis juga `-webkit-backdrop-filter` dengan nilai yang sama, untuk Safari.

**Latar yang memberi sesuatu untuk di-blur.** `--bg` ditambah dua radial gradient (`--bg-blob-sky`, `--bg-blob-coral`) yang memudar ke transparan, diletakkan di belakang konten dengan `position: fixed` supaya tidak ikut digulir. Ketentuannya:
- Tidak ada foto atau gambar bebas di belakang kaca.
- Kontras di tabel hanya berlaku untuk latar ini. Latar lain di belakang kaca berarti hitung ulang.

**Fallback opak.** Kartu dan panel memakai `--surface-solid`, tanpa `backdrop-filter`, ketika:
- `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`, atau
- `@media (prefers-reduced-transparency: reduce)`.

Border dan kontras teks tetap sama, dan baris "fallback card (opaque)" di tabel sudah menguji ini. Media query `prefers-reduced-transparency` belum didukung semua browser. Di browser yang tidak mendukung, kaca tetap tampil, dan itu tetap aman karena kontras kaca sudah diuji pada latar terburuk.

**Risiko performa (belum diuji).** `backdrop-filter` pada banyak kartu sekaligus di atas latar `position: fixed` bisa membuat scroll tersendat di perangkat kelas menengah. Ini belum diukur. Pada Phase 3, uji di perangkat menengah:
- scroll di Today view dan matriks;
- jumlah kartu kaca yang terlihat sekaligus;
- mode light dan dark.
Catat hasilnya di sini sebelum pola ini dipakai di semua layar. Sampai diuji, dokumen ini tidak mengklaim performanya aman.

**`forced-colors: active`.** Kaca dan blob dimatikan, dan warna sistem yang dipakai. Border kartu tetap ada supaya batas komponen terlihat.

## e. Tipografi, spacing, radius, elevasi, motion, titik henti

### Tipografi

- **Font:** Geist (`--font-geist-sans`) untuk teks dan Geist Mono (`--font-geist-mono`) untuk angka timer. Keduanya sudah dimuat oleh `next/font/google` di `src/app/layout.tsx`. Tidak ada font tambahan.
- **Skala:**

  | Peran | Ukuran / line-height | Bobot |
  | --- | --- | --- |
  | `text-xs` (label kecil, metadata) | 12/16 | 500 |
  | `text-sm` (teks sekunder) | 14/20 | 400 |
  | `text-base` (teks utama, minimum isi) | 16/24 | 400 |
  | `text-lg` (judul kartu) | 20/28 | 600 |
  | `text-2xl` (judul halaman) | 24/32 | 600 |
  | `text-3xl` (angka ringkasan) | 32/40 | 600 |
  | Timer | `clamp(3.5rem, 12vw, 5rem)` | 500 |

- **Teks besar** (ambang 3:1) adalah ≥ 24px, atau ≥ 18,66px tebal. Meski begitu, semua token di atas sudah lolos 4,5:1, jadi ambang teks besar tidak dipakai untuk melonggarkan apa pun.
- **Angka** (pomodoro, jam, sisa waktu) memakai `font-variant-numeric: tabular-nums` supaya tidak bergoyang.
- **Format:** jam `HH:mm` (24 jam, sama dengan engine); tanggal tampil dalam locale `id-ID`.

### Spacing

Skala bawaan Tailwind (kelipatan 4px). Padding kartu `p-4` di mobile dan `p-6` dari `md`. Jarak antar kartu `gap-3` di mobile dan `gap-4` dari `md`. Gutter halaman `px-4`.

### Radius

| Elemen | Radius |
| --- | --- |
| Kartu | `rounded-2xl` (16px) |
| Panel | `rounded-3xl` (24px) |
| Tombol, input | `rounded-xl` (12px) |
| Chip, lencana | `rounded-full` |
| Dialog | `rounded-3xl` |

### Elevasi

| Level | Elemen | Permukaan |
| --- | --- | --- |
| 0 | Latar halaman | `--bg` dan blob |
| 1 | Kartu | Kaca, blur 16px |
| 2 | Panel (lembar samping, area matriks) | Kaca, blur 24px |
| 3 | Dialog | `--surface-solid` opak dengan scrim `rgb(20 33 61 / 0.45)`. Bukan kaca |

### Motion

- Durasi 150ms (hover, focus) dan 200ms (buka/tutup), `ease-out`. Hanya `opacity`, `transform` dan `background-color` yang dianimasikan.
- `@media (prefers-reduced-motion: reduce)`: transisi transform dihapus, hanya perubahan opacity yang boleh, dan indikator progres timer berubah tanpa transisi.
- Tidak ada animasi yang berulang terus-menerus. Timer tidak berkedip.

### Titik henti (mobile-first)

| Titik henti | Lebar | Tata letak |
| --- | --- | --- |
| (dasar) | < 640px | Satu kolom (mobile first, `TASKS.md` Phase 3) |
| `sm` | ≥ 640px | Belum ditentukan |
| `md` | ≥ 768px | Belum ditentukan |
| `lg` | ≥ 1024px | Belum ditentukan |

Navigasi memuat empat bagian: Today, Tasks, Schedule, Settings (`TASKS.md` Phase 3, "Layout and navigation"). Tata letak per titik henti, posisi navigasi, dan label tampilan berbahasa Indonesia masih usulan (lihat "Usulan untuk persetujuan pemilik", nomor 5).

Target sentuh minimum 44×44px. Ini lebih besar dari minimum 24×24px di WCAG 2.2 AA.

## f. Komponen

Semua status di bawah ini wajib ada. **Focus ring** untuk semua elemen interaktif: `outline: 2px solid var(--focus); outline-offset: 2px`, hanya pada `:focus-visible`, dan tidak pernah `outline: none` tanpa pengganti. Offset 2px wajib (bagian c).

| Komponen | Default | Hover | Focus | Disabled |
| --- | --- | --- | --- | --- |
| **Kartu** (tugas, alokasi) | Kaca level 1, teks `--text` | Jika bisa diklik: border berubah ke `--text-muted` | Ring pada kartu | Tidak berlaku; kartu tugas yang selesai memakai label "Selesai", bukan diredupkan saja |
| **Panel** | Kaca level 2 | Tidak ada | Ring hanya bila panel bisa difokus (lembar samping) | Tidak berlaku |
| **Tombol primer** | Fill `--accent`, teks `--on-accent`, bobot 600 | Fill `--accent-hover` | Ring dengan offset | `opacity: 0.5`, `cursor: not-allowed`, `aria-disabled`, dan alasan tertulis di dekatnya (mis. "Riwayat sesi tidak terbaca") |
| **Tombol sekunder** | Transparan, border 1px `--text`, teks `--text` | Latar `--surface-glass` | Ring | Sama dengan primer |
| **Chip** (filter, kategori) | Fill `--brand`, teks `--on-accent` | Fill `--brand-hover` | Ring | Sama dengan primer |
| **Lencana kuadran** | Lihat bagian g | Tidak interaktif | Tidak interaktif | Tidak berlaku |
| **Banner peringatan** | Opak (`--surface-solid`, border 1px `--surface-glass-border`), bukan kaca; lihat bagian g; `role="status"` (Q1, feasibility, tak didukung) atau `role="alert"` (`needs-attention`) | Tombol di dalamnya mengikuti aturan tombol | Ring pada tombol di dalamnya | Tidak berlaku |
| **Tampilan timer** | Angka Geist Mono, `--text`, di kartu kaca; label tugas dan kuadran di atasnya | Tombol kontrol mengikuti aturan tombol | Ring pada tombol kontrol | Kontrol mulai dinonaktifkan dengan alasan bila sesi `unavailable` atau store tidak `ready` |

Hanya ada satu tombol primer per layar. Aksi destruktif (reset) tidak memakai tombol primer di luar dialog konfirmasi.

## g. Semantik: kuadran dan peringatan

### Kuadran

Kuadran selalu tampil sebagai lencana dengan **kode, label dan ikon**. Warna hanya penguat.

| Kuadran | Label | Ikon (bentuk) | Gaya |
| --- | --- | --- | --- |
| Q1 | Q1 · Penting & mendesak | Petir | Fill `--accent`, teks `--on-accent` |
| Q2 | Q2 · Penting, tidak mendesak | Kalender | Fill `--brand`, teks `--on-accent` |
| Q3 | Q3 · Mendesak, tidak penting | Jam | Outline 1px solid `--text`, teks `--text` |
| Q4 | Q4 · Tidak penting, tidak mendesak | Lingkaran minus | Outline 1px dashed `--text-muted`, teks `--text-muted` |

Labelnya diturunkan dari definisi matriks, bukan nama aksi. Nama aksi (mis. "Kerjakan", "Jadwalkan") masih pertanyaan terbuka. Alasan kuadran (jarak ke tenggat, override) tampil sebagai teks di dekat lencana, bukan di tooltip saja.

### Peringatan

Keempat peringatan wajib dibedakan lewat **ikon dan teks**, tidak lewat warna saja:

| Peringatan | Sumber | Ikon (bentuk) | Judul | Isi (contoh) | Gaya |
| --- | --- | --- | --- | --- | --- |
| Q1 overflow | `Q1OverflowWarning` (`type: "Q1_OVERFLOW"`, `taskIds`, `shortfallPomodoros`), dikembalikan `autoFillToday` | Tumpukan meluap | "Q1 melebihi batas harian" | "{n} pomodoro Q1 tidak dijadwalkan hari ini." | `--surface-solid`, garis kiri 4px `--accent`, ikon `--accent-ink` |
| Kekurangan feasibility | `FeasibilityWarning` (`taskId`, `shortfallPomodoros`), dari selector `selectFeasibility` | Jam pasir | "Waktu tidak cukup sebelum tenggat" | "{tugas}: kurang {n} pomodoro sebelum {tanggal}." | `--surface-solid`, garis kiri 4px `--accent`, ikon `--accent-ink` |
| Kasus tak didukung | Acara melewati tengah malam: store menolak dengan `InvalidDataError` ("endTime must be after startTime"); exception `MODIFIED`: engine melempar error | Lingkaran dicoret | "Belum didukung" | "Acara yang melewati tengah malam belum didukung. Jadwal ini tidak disimpan." | `--surface-solid`, garis kiri 4px `--brand-ink`, ikon `--brand-ink` |
| `needs-attention` | Store `hydration: "needs-attention"` | Perisai dengan tanda seru | "Data tidak bisa dibaca" | Lihat bagian i | Fill `--accent` opak, teks `--on-accent`, `role="alert"`, tidak bisa ditutup |

Q1 overflow dan kekurangan feasibility memakai warna yang sama (coral), jadi pembedanya ikon dan judul. Warna khusus per tingkat keparahan ada di usulan.

## h. Aturan timer

- **Sisa waktu selalu diturunkan dari timestamp:** `remainingMs = durationMs - (now - startedAt)`, dengan `now` dari `clock` yang di-inject (sama dengan store) dan dipotong ke 0.
- **Tidak ada penghitung yang berdetak.** Interval atau `requestAnimationFrame` hanya memicu render ulang dengan membaca `clock()`. Interval tidak pernah mengurangi state.
- **Durasi diambil dari `UserSettings`.** Dengan begitu timer benar setelah tab tertidur, layar terkunci atau reload, dan perekaman awal sesi (DECISION PENDING di `TASKS.md`) bisa ditambahkan kemudian tanpa mengubah tampilan. Cukup simpan `startedAt`.
- Format `mm:ss` dengan `tabular-nums`. Teks yang sudah diformat dihitung ulang paling sering satu kali per detik.
- **Aksesibilitas:** elemen timer memakai `role="timer"` dengan `aria-live="off"`. Pengumuman `aria-live="polite"` terpisah hanya saat sesi atau istirahat selesai. Tidak ada pengumuman tiap detik.
- **Saat selesai:** catat lewat `completePomodoro`. Sesi yang ditinggalkan juga dicatat lewat `completePomodoro`, dengan `completed: false` di `PomodoroSession`. Tidak ada status bernama "abandoned" di kode. Sesi seperti itu menandai alokasinya sudah dimulai, tanpa menambah hitungan.

## i. Wajib tampil di UI

1. **`hydration: "needs-attention"`.** Banner `needs-attention` (bagian g) ditampilkan di atas semua konten. Semua aksi pengubah data dinonaktifkan dengan alasan tertulis, karena store memang menolaknya dengan `StoreNotReadyError`.
   - Ada dua penyebab, dan keduanya punya isi yang berbeda:
     - Ada `issues` dengan `key: "data"` (data perencanaan rusak). Isinya: "Data perencanaan tidak bisa dibaca ({reason}). Data asli tidak diubah. Salinannya disimpan di {backupKey}."
     - `loadError` terisi (penyimpanan gagal dibaca, mis. diblokir browser; `issues` kosong). Isinya: pesan `loadError`.
   - Tombol "Coba lagi" (`resolveStorageIssue("retry")`) selalu ada.
   - Tombol "Mulai dari data kosong…" (membuka dialog konfirmasi untuk `resolveStorageIssue("reset")`) hanya tampil bila `issues` tidak kosong. Di kasus `loadError` saja, reset tidak mengubah apa pun, karena store hanya mereset key yang ada di `issues`.
2. **`sessionsStatus: "unavailable"`** (ada `issues` dengan `key: "sessions"`; `hydration` tetap `"ready"`). Banner `role="status"` dengan ikon perisai dan judul "Riwayat sesi tidak bisa dibaca". Tombol mulai timer dinonaktifkan dengan alasan "Sesi baru tidak bisa dicatat sampai riwayat sesi dipulihkan." Perencanaan lain tetap berjalan, sesuai perilaku store. Jalan keluarnya sama dengan nomor 1, dengan dialog yang menyebut backup log sesi.
3. **Dialog konfirmasi sebelum `resolveStorageIssue("reset")`.** Dialog opak (elevasi 3), bukan banner, dan bukan aksi satu klik.
   - Judul: "Mulai dari data kosong?"
   - Isi wajib menyebut backup: "Data yang rusak tidak dihapus: salinannya tetap ada di {backupKey}. Setelah ini Alinor memakai data kosong."
   - Tombol: "Batal" mendapat fokus awal. "Ya, mulai dari kosong" memakai gaya tombol primer di dalam dialog. Esc sama dengan Batal. Fokus terkunci di dalam dialog dan kembali ke tombol pemicu setelah ditutup.
4. **`persistError`.** Banner `role="status"`: "Perubahan terakhir belum tersimpan. Alinor akan mencoba lagi saat ada perubahan berikutnya." Pesan ini sesuai perilaku store, yang mencoba lagi pada save berikutnya.

## Usulan untuk persetujuan pemilik

Hal-hal berikut belum final dan perlu persetujuan:

1. **Warna semantik di luar palet.** Palet empat warna tidak punya warna "berhasil" (hijau) atau "peringatan ringan" (amber), jadi Q1 overflow, feasibility dan `needs-attention` semuanya bergantung pada coral. Usulan: tambahkan satu warna peringatan dan satu warna berhasil, masing-masing dengan varian `-ink`, dan hitung kontrasnya dengan cara yang sama sebelum dipakai. Sampai disetujui, pakai aturan di bagian g.
2. **Sumber ikon.** Repo belum punya pustaka ikon. Ada dua pilihan:
   - SVG inline yang dibuat sendiri (tanpa dependensi), atau
   - dependensi seperti `lucide-react` (perlu persetujuan, karena `CLAUDE.md` melarang menambah dependensi tanpa izin).
   Bentuk ikon di bagian g berlaku untuk kedua pilihan.
3. **Font body.** `src/app/globals.css` saat ini menimpa font dengan `font-family: Arial, Helvetica, sans-serif` pada `body`, padahal Geist sudah dimuat. Usulan untuk Phase 3: pakai `var(--font-sans)`.
4. **Bahasa dokumen.** Diputuskan pemilik: antarmuka berbahasa Indonesia. Penerapan `lang="id"` di `src/app/layout.tsx` **belum dilakukan**. Branch `chore/app-metadata` hanya mengganti `title` dan `description`, dan `lang` di sana masih `"en"`.
5. **Navigasi dan tata letak per titik henti.** Tidak ada di `TASKS.md` maupun `CLAUDE.md`, jadi belum final:
   - Label tampilan navigasi: "Hari ini", "Tugas", "Jadwal", "Pengaturan" (untuk Today, Tasks, Schedule, Settings).
   - Posisi navigasi: di bawah di mobile, pindah ke samping dari `md`.
   - Matriks 2×2 dari `md` (di bawahnya, kuadran ditumpuk satu kolom).
   - Today view dua kolom (timeline + daftar) dari `lg`.

## j. Pertanyaan terbuka

1. **Tema:** ikut sistem (`prefers-color-scheme`) saja, atau ada toggle manual? Kalau ada toggle, di mana preferensinya disimpan (store/repository atau `localStorage` terpisah)?
2. **Label aksi kuadran:** cukup label definisi (bagian g), atau ditambah nama aksi seperti "Kerjakan", "Jadwalkan", "Delegasikan", "Hapus"?
3. **Kontrol timer:** apakah ada jeda (pause)? Model timestamp di bagian h mendukungnya hanya jika jeda juga direkam sebagai timestamp. Ini terkait DECISION PENDING soal perekaman awal sesi.
4. **Dialog di mode dark:** apakah scrim `rgb(20 33 61 / 0.45)` cukup terlihat di atas latar navy, atau dialog dark perlu border `--surface-glass-border` yang lebih tegas? Perlu dicek di browser saat Phase 3.
5. **Notifikasi dalam aplikasi** (Phase 4): apakah memakai banner yang sama, atau komponen toast terpisah? Toast tidak dibahas di dokumen ini.
