# Brain Battle

Kuis real-time untuk **AFL Winter Peak 2026 · Capacity Building 3**. 16 homegroup dibagi ke 2 sesi terisolasi (8 HG per sesi, ±8–9 anggota per HG), 18 menit per sesi, 3 babak:

| Babak | Soal | Mekanisme | Skor |
|---|---|---|---|
| Quick Fire | 8 pilihan ganda | Semua anggota menjawab di HP | +100 per jawaban benar; skor HG = total ÷ jumlah anggota resmi |
| Battle Buzzer | 6 rebutan | 1 buzzer per HG, jawab lisan | Benar +100, salah −50 |
| Final Showdown | 3 rebutan + taruhan | Tiap HG bertaruh dulu (0 = lewati, maks. skor sendiri atau minimal 200); hanya yang bertaruh boleh rebutan | Benar + taruhan, salah − taruhan, tidak sempat menjawab 0. Skor boleh minus |

Stack: React + TypeScript + Vite + Tailwind CSS, Supabase (PostgreSQL, Realtime, Auth), deploy ke Vercel.

## Halaman

| URL | Untuk | Keterangan |
|---|---|---|
| `/` | Peserta | Masukkan kode sesi (`SESI1` / `SESI2`) |
| `/play/SESI1` | Peserta | Pilih HG → pilih nama |
| `/play/SESI1/game` | Peserta | Layar main; operator buzzer klaim buzzer di sini |
| `/screen/SESI1` | Proyektor | Soal, timer, pemenang buzzer, leaderboard, QR join |
| `/admin` | Panitia | Login, pilih sesi, bank soal |
| `/admin/s/SESI1` | Panitia | Control center: babak, soal, buzzer, penilaian, roster, skor, audit |

## Setup

1. **Buat project Supabase** di supabase.com.
2. **Jalankan migration + seed**: buka *SQL Editor*, jalankan isi
   ketiga file di `supabase/migrations/` secara berurutan (`…000001`, `…000002`, `…000003`), lalu `supabase/seed.sql`.
   (Project yang sudah berjalan cukup menjalankan file migration yang belum pernah dijalankan.)
   (Kalau pakai Supabase CLI: `supabase link` lalu `supabase db push`, dan jalankan seed di SQL Editor.)
3. **Buat akun admin**: *Authentication → Users → Add user* (email + password), lalu di SQL Editor:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'admin@contoh.com';
   ```
   Disarankan mematikan *Allow new users to sign up* (akun non-admin memang tidak punya akses, tapi lebih rapi).
4. **Env**: salin `.env.example` → `.env.local`, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (anon/publishable key, **bukan** service-role).
5. `npm install` → `npm run dev` (bisa dibuka dari HP di jaringan yang sama lewat IP laptop).
6. **Deploy**: import repo ke Vercel, set dua env var di atas. `vercel.json` sudah menangani routing SPA.

## Persiapan sebelum acara

1. `/admin/questions` — tinjau paket A (Sesi 1) dan B (Sesi 2). Seed berisi 17 soal per paket: materi CB3 (Problem Tree, Theory of Change, Issue→Problem→Need→Solution), pengetahuan umum, tebak-tebakan, hitungan, dan soal cerita.
2. `/admin/s/SESI1` → tab **Roster & Kode**: ganti nama HG, isi anggota resmi (satu nama per baris), lalu **Buat kode untuk HG yang belum punya** dan cetak kartu kodenya. Kode buzzer tetap sama sampai diganti, dan selalu bisa dilihat lagi di kartu kode (hanya admin).
3. Ulangi untuk `SESI2`.
4. **Gladi bersih + simulasi beban** (lihat Pengujian).

## Alur hari-H (per sesi)

1. Proyektor buka `/screen/SESI1` (klik "Aktifkan suara"). Peserta scan QR, pilih HG, pilih nama. Operator buzzer tiap HG tekan **Saya operator** dan masukkan kode buzzer.
2. Admin cek panel kanan: jumlah masuk/online per HG dan status buzzer (titik hijau = heartbeat aktif).
3. **Quick Fire** → *Tampilkan soal 1* → timer server berjalan → *Ungkap jawaban* → *Soal berikutnya*. Roster terkunci otomatis saat babak dimulai.
4. **Battle Buzzer** → tampilkan soal → MC membacakan → **Buka buzzer** → HG tercepat muncul di layar → nilai: *Benar*, *Salah + buka lagi*, *Salah (tutup)*, atau *Batal (0 poin)*.
5. **Final Showdown** → *Tampilkan soal* membuka **fase taruhan** 20 detik: layar hanya menampilkan kategori, operator buzzer tiap HG memasang taruhan di HP (admin melihat jumlahnya, layar hanya menampilkan siapa yang sudah bertaruh). Klik **Kunci taruhan & tampilkan soal** → soal muncul → **Buka buzzer** (HG dengan taruhan 0 / tanpa taruhan tidak bisa menekan) → nilai seperti biasa. Saat jawaban diungkap, semua taruhan dibuka di layar.
6. **Hasil Akhir** → podium di layar. Tab **Skor & Audit** → *Ekspor CSV*.

Darurat: **Jeda** menolak semua jawaban/buzzer; **Lepas** di samping HG melepas paksa buzzer (misal HP operator mati); **Reset** di samping nama peserta (tab Roster) membebaskan namanya untuk masuk dari HP lain; **Koreksi skor manual** wajib beralasan dan tercatat di audit.

## Aturan yang diterapkan (keputusan bagian 12)

Default ini aku pilih supaya bisa langsung jalan. Semuanya bisa diubah:

- **Nama HG**: placeholder `HG 1`–`HG 8` (Sesi 1) dan `HG 9`, `HG 10`, `HG 12`–`HG 16`, dan `HG 17` (Sesi 2; HG 11 diganti HG 17). Ganti di tab Roster.
- **Verifikasi anggota**: tanpa kode HG. Admin mengisi roster resmi; peserta memilih HG dan namanya. Selama roster belum dikunci, peserta boleh menambahkan nama sendiri. Nama yang sudah masuk di satu HP **terkunci** (tidak bisa direbut HP lain). Kalau peserta ganti HP, admin menekan **Reset** di samping namanya (tab Roster), atau peserta menekan *Keluar dari perangkat ini*. Reset sesi mengeluarkan semua perangkat.
- **Quick Fire**: tiap soal dikendalikan admin (bukan otomatis). Timer 20–25 detik dihitung server, ditambah toleransi latensi 1,5 detik.
- **Rebutan ulang**: setiap HG hanya 1 kali percobaan per soal. HG yang salah dikecualikan dari soal itu, lalu admin bisa membuka buzzer lagi untuk HG lain.
- **Tie-break**: total → poin buzzer+final → rata-rata Quick Fire. Kalau masih seri, beri soal tambahan dan catat sebagai koreksi manual.
- **Ekspor**: CSV leaderboard + riwayat skor dari tab Skor & Audit.

## Model keamanan

- Peserta dan buzzer bersifat anonim. Mereka memegang token acak dari RPC; server hanya menyimpan hash SHA-256.
- Klien anonim hanya bisa `SELECT` tabel `game_sessions` dan `homegroups` (state publik tanpa rahasia). Semua aksi lain lewat RPC `SECURITY DEFINER` yang memvalidasi di server.
- Kunci jawaban hanya ditulis ke `game_sessions.reveal` saat admin menekan *Ungkap jawaban*.
- Pemenang buzzer ditentukan oleh `UPDATE … WHERE buzzer_state = 'open' AND buzzer_seq = $seq` yang atomik di Postgres. Jam HP tidak dipakai, dan tekanan untuk bukaan buzzer sebelumnya ditolak.
- Satu buzzer aktif per HG (primary key `buzzer_sessions.homegroup_id`). Klaim dari perangkat lain ditolak selama heartbeat (tiap 4 detik) masih segar (<15 detik).
- Skor buzzer/final/manual masuk ke ledger `score_events` yang append-only.

## Pengujian

- `npm run test:db` — menjalankan migration + seed di Postgres lokal (PGlite) lalu menguji: rata-rata HG 8 vs 9 anggota, jawaban ganda/telat ditolak, peserta tidak bisa membaca kunci/tabel rahasia, rotasi token saat ganti perangkat, buzzer eksklusif + takeover saat heartbeat mati, satu pemenang per bukaan, klaim basi ditolak, poin final, force release, isolasi sesi, dan reset.
- `npm run simulate -- --yes` — simulasi **72 pemain** terhadap Supabase sungguhan: join serentak, 72 jawaban serentak, perebutan klaim buzzer, dan 15× rebutan serentak 8 HG (harus tepat satu pemenang). Isi `SIM_SESSION`, `SIM_ADMIN_EMAIL`, `SIM_ADMIN_PASSWORD` di `.env.local`. **Skrip ini menghapus data main dan roster sesi tersebut.** Jalankan sebelum roster asli diisi, atau isi ulang roster setelahnya.
- `npm run build`, `npm run lint`.
