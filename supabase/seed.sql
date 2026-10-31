-- Brain Battle seed: two isolated sessions, 8 homegroups each, question packs A and B.
-- Homegroup names and join codes are placeholders — rename them in Admin → Roster.
-- Safe to run more than once: existing sessions, homegroups and questions are kept.
-- Buzzer codes are not seeded; generate them in Admin → Roster (codes are stored hashed).

insert into public.game_sessions (code, name, pack) values
  ('SESI1', 'Brain Battle — Sesi 1', 'A'),
  ('SESI2', 'Brain Battle — Sesi 2', 'B')
on conflict (code) do nothing;

with palette(n, color) as (
  values (1, '#ef4444'), (2, '#f97316'), (3, '#eab308'), (4, '#22c55e'),
         (5, '#06b6d4'), (6, '#3b82f6'), (7, '#a855f7'), (8, '#ec4899')
), ins as (
  insert into public.homegroups (session_id, name, color, sort_order)
  select s.id, 'HG ' || (case s.code when 'SESI1' then p.n else p.n + 8 end), p.color, p.n
    from public.game_sessions s cross join palette p
   where s.code in ('SESI1', 'SESI2')
  on conflict (session_id, name) do nothing
  returning id
)
insert into public.homegroup_credentials (homegroup_id, join_code)
select id, lpad((floor(random() * 9000) + 1000)::int::text, 4, '0') from ins;

-- ---------------------------------------------------------------------------
-- Questions. Quick Fire: 20 s, +100. Battle Buzzer: 30 s, +100/−50. Final: 45 s, +200/−100.
-- ---------------------------------------------------------------------------

-- Wrapped so re-running the seed never duplicates the question bank.
do $seed$
begin
if exists (select 1 from public.questions) then
  raise notice 'questions already seeded, skipping';
  return;
end if;

insert into public.questions (pack, round, order_no, category, difficulty, body, options, correct_option, duration_sec, points_correct, points_wrong) values
-- Pack A — Quick Fire
('A', 'quickfire', 1, 'Materi CB3', 'mudah',
 'Dalam Problem Tree, bagian AKAR (roots) menggambarkan…',
 '["Konsekuensi dari masalah", "Penyebab masalah", "Masalah utama", "Solusi yang dipilih"]', 1, 20, 100, 0),
('A', 'quickfire', 2, 'Materi CB3', 'mudah',
 'Urutan alur yang benar dari materi "From Good Intentions to Real Needs" adalah…',
 '["Issue → Problem → Need → Solution", "Solution → Need → Problem → Issue", "Problem → Issue → Solution → Need", "Need → Solution → Issue → Problem"]', 0, 20, 100, 0),
('A', 'quickfire', 3, 'Pengetahuan Umum', 'mudah',
 'Ibu kota Provinsi Jawa Barat adalah…',
 '["Bogor", "Cirebon", "Bandung", "Bekasi"]', 2, 20, 100, 0),
('A', 'quickfire', 4, 'Hitungan', 'mudah',
 '15 × 4 − 20 = ?',
 '["50", "40", "60", "35"]', 1, 20, 100, 0),
('A', 'quickfire', 5, 'Logika Lucu', 'sedang',
 'Ayah Budi punya empat anak: Satu, Dua, Tiga, dan…?',
 '["Empat", "Lima", "Nol", "Budi"]', 3, 20, 100, 0),
('A', 'quickfire', 6, 'Materi CB3', 'sedang',
 'Dalam Theory of Change, perubahan perilaku atau praktik yang berkaitan langsung dengan masalah disebut…',
 '["Output", "Outcome", "Input", "Activities"]', 1, 20, 100, 0),
('A', 'quickfire', 7, 'Pengetahuan Umum', 'mudah',
 'Planet yang paling dekat dengan Matahari adalah…',
 '["Merkurius", "Venus", "Mars", "Bumi"]', 0, 20, 100, 0),
('A', 'quickfire', 8, 'Soal Cerita', 'sedang',
 'Sebuah homegroup punya 9 anggota. Masing-masing membawa 3 botol minum, lalu 5 botol diberikan ke panitia. Berapa botol yang tersisa?',
 '["27", "24", "22", "18"]', 2, 25, 100, 0),

-- Pack B — Quick Fire
('B', 'quickfire', 1, 'Materi CB3', 'mudah',
 'Dalam Problem Tree, bagian CABANG (branches) menggambarkan…',
 '["Konsekuensi dari masalah", "Penyebab masalah", "Masalah utama", "Sumber daya proyek"]', 0, 20, 100, 0),
('B', 'quickfire', 2, 'Materi CB3', 'mudah',
 '"Hambatan spesifik yang dialami kelompok tertentu" adalah definisi dari…',
 '["Issue", "Need", "Problem", "Solution"]', 2, 20, 100, 0),
('B', 'quickfire', 3, 'Pengetahuan Umum', 'mudah',
 'Ibu kota Provinsi Jawa Timur adalah…',
 '["Malang", "Surabaya", "Kediri", "Madiun"]', 1, 20, 100, 0),
('B', 'quickfire', 4, 'Hitungan', 'mudah',
 '18 × 3 − 14 = ?',
 '["38", "44", "50", "40"]', 3, 20, 100, 0),
('B', 'quickfire', 5, 'Logika Lucu', 'sedang',
 'Seorang peternak punya 17 domba. Semua mati kecuali 9. Berapa domba yang tersisa?',
 '["8", "9", "17", "0"]', 1, 20, 100, 0),
('B', 'quickfire', 6, 'Materi CB3', 'sedang',
 'Dalam Theory of Change, "fasilitas tersedia dan sistem pengumpulan mulai berjalan" termasuk…',
 '["Output", "Outcome", "Impact", "Input"]', 0, 20, 100, 0),
('B', 'quickfire', 7, 'Pengetahuan Umum', 'mudah',
 'Planet terbesar di tata surya kita adalah…',
 '["Saturnus", "Neptunus", "Jupiter", "Uranus"]', 2, 20, 100, 0),
('B', 'quickfire', 8, 'Soal Cerita', 'sedang',
 'Panitia menyiapkan 8 meja, masing-masing dengan 9 kursi. Ternyata 7 kursi rusak. Berapa kursi yang bisa dipakai?',
 '["72", "63", "65", "79"]', 2, 25, 100, 0);

insert into public.questions (pack, round, order_no, category, difficulty, body, answer_text, duration_sec, points_correct, points_wrong) values
-- Pack A — Battle Buzzer
('A', 'buzzer', 1, 'Materi CB3', 'sedang',
 'Sebutkan TIGA pertanyaan yang wajib ditanyakan setiap inovator menurut materi!',
 'Siapa yang mengalami masalah? (Who) • Apa penyebab masalahnya? (What causes) • Apa yang sebenarnya mereka butuhkan? (What they need)', 30, 100, 50),
('A', 'buzzer', 2, 'Pengetahuan Umum', 'mudah',
 'Siapa pencipta lagu kebangsaan "Indonesia Raya"?',
 'Wage Rudolf (W.R.) Supratman', 30, 100, 50),
('A', 'buzzer', 3, 'Tebak-tebakan', 'sedang',
 'Aku punya kota tapi tak ada rumah, punya sungai tapi tak ada air, punya hutan tapi tak ada pohon. Siapakah aku?',
 'Peta', 30, 100, 50),
('A', 'buzzer', 4, 'Logika', 'sedang',
 'Tiga orang membuat 3 poster dalam 3 menit. Berapa menit yang dibutuhkan 9 orang untuk membuat 9 poster?',
 '3 menit', 30, 100, 50),
('A', 'buzzer', 5, 'Materi CB3', 'sedang',
 'Sebutkan LIMA langkah roadmap "From Challenge to Solution" secara berurutan!',
 'Observe → Define → Diagnose → Design → Propose', 30, 100, 50),
('A', 'buzzer', 6, 'Pengetahuan Umum', 'mudah',
 'Bunga Rafflesia arnoldii, bunga terbesar di dunia, tumbuh alami di pulau mana?',
 'Sumatra (antara lain Bengkulu)', 30, 100, 50),

-- Pack A — Final Showdown
('A', 'final', 1, 'Studi Kasus CB3', 'sulit',
 'Masalah sebuah proyek: belum ada sistem pengangkutan sampah terpilah. Tetapi kegiatan proyeknya hanya seminar. Menurut materi, apa yang harus dilakukan tim?',
 'Tim harus bisa menjelaskan bagaimana seminar mengatasi hambatan sistem pengangkutan; jika hubungan itu tidak jelas, solusinya perlu diperbaiki agar relevan dengan akar masalah.', 45, 200, 100),
('A', 'final', 2, 'Logika', 'sulit',
 'Sebuah botol beserta tutupnya seharga Rp11.000. Botol Rp10.000 lebih mahal daripada tutupnya. Berapa harga tutupnya?',
 'Rp500 (botol Rp10.500)', 45, 200, 100),
('A', 'final', 3, 'Soal Cerita', 'sulit',
 'Acara dimulai pukul 08.45. Ada 3 sesi, masing-masing 50 menit, dengan istirahat 15 menit di antara sesi. Pukul berapa acara selesai?',
 'Pukul 11.45 (3×50 + 2×15 = 180 menit)', 45, 200, 100),

-- Pack B — Battle Buzzer
('B', 'buzzer', 1, 'Materi CB3', 'sedang',
 'Sebutkan TIGA bagian Problem Tree beserta artinya!',
 'Akar (roots) = penyebab • Batang (trunk) = masalah utama • Cabang (branches) = konsekuensi/dampak', 30, 100, 50),
('B', 'buzzer', 2, 'Pengetahuan Umum', 'mudah',
 'Siapa yang memproklamasikan kemerdekaan Indonesia bersama Soekarno?',
 'Mohammad Hatta', 30, 100, 50),
('B', 'buzzer', 3, 'Tebak-tebakan', 'sedang',
 'Semakin banyak kamu ambil, semakin banyak yang kamu tinggalkan. Apakah itu?',
 'Langkah (jejak kaki)', 30, 100, 50),
('B', 'buzzer', 4, 'Logika', 'sedang',
 'Lima mesin membuat 5 gelang dalam 5 menit. Berapa menit yang dibutuhkan 100 mesin untuk membuat 100 gelang?',
 '5 menit', 30, 100, 50),
('B', 'buzzer', 5, 'Materi CB3', 'sedang',
 'Sebutkan ENAM elemen alur Theory of Change secara berurutan!',
 'Problem → Input → Activities → Output → Outcome → Impact', 30, 100, 50),
('B', 'buzzer', 6, 'Pengetahuan Umum', 'mudah',
 'Komodo hidup secara alami di provinsi mana?',
 'Nusa Tenggara Timur (NTT)', 30, 100, 50),

-- Pack B — Final Showdown
('B', 'final', 1, 'Studi Kasus CB3', 'sulit',
 'Sebuah tim ingin meningkatkan minat baca anak dan langsung memutuskan menyumbang buku. Menurut materi, apa kesalahan mereka dan apa yang seharusnya dicek lebih dulu?',
 'Mereka langsung menyimpulkan solusi tanpa memahami kebutuhan. Cek dulu: akses terhadap bacaan, kesempatan membaca, pendampingan, dan lingkungan yang mendukung.', 45, 200, 100),
('B', 'final', 2, 'Logika', 'sulit',
 'Sebuah buku dan sebuah pensil seharga Rp12.000. Buku Rp10.000 lebih mahal daripada pensil. Berapa harga pensilnya?',
 'Rp1.000 (buku Rp11.000)', 45, 200, 100),
('B', 'final', 3, 'Soal Cerita', 'sulit',
 'Acara dimulai pukul 13.20. Ada 4 games, masing-masing 25 menit, dengan jeda 10 menit di antara games. Pukul berapa acara selesai?',
 'Pukul 15.30 (4×25 + 3×10 = 130 menit)', 45, 200, 100);

end
$seed$;

