const MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: 'Kode sesi tidak ditemukan.',
  HOMEGROUP_NOT_FOUND: 'Homegroup tidak ditemukan.',
  WRONG_JOIN_CODE: 'Kode homegroup salah.',
  PARTICIPANT_NOT_FOUND: 'Nama tidak ada di daftar anggota.',
  ROSTER_LOCKED: 'Daftar anggota sudah dikunci. Pilih namamu dari daftar.',
  INVALID_NAME: 'Nama harus 2–40 karakter.',
  NAME_TAKEN: 'Nama itu sudah terdaftar di homegroup ini.',
  NAME_IN_USE: 'Nama ini sedang dipakai di perangkat lain. Kalau ini namamu, minta panitia menekan Reset.',
  INVALID_TOKEN: 'Sesi perangkat ini sudah tidak berlaku. Silakan masuk lagi.',
  GAME_NOT_LIVE: 'Permainan sedang tidak berjalan.',
  QUESTION_CLOSED: 'Soal ini sudah ditutup.',
  DEADLINE_PASSED: 'Waktu habis — jawaban tidak diterima.',
  INVALID_CHOICE: 'Pilihan tidak valid.',
  ALREADY_ANSWERED: 'Kamu sudah menjawab soal ini.',
  BUZZER_NOT_CONFIGURED: 'Kode buzzer homegroup ini belum diatur admin.',
  WRONG_BUZZER_CODE: 'Kode buzzer salah.',
  BUZZER_IN_USE: 'Buzzer sedang dipegang perangkat lain di homegroup-mu.',
  BUZZER_REVOKED: 'Hak buzzer perangkat ini sudah dilepas.',
  NOT_ADMIN: 'Akun ini bukan admin.',
  QUESTION_NOT_IN_ROUND: 'Soal tidak sesuai paket atau babak sesi ini.',
  NO_ACTIVE_QUESTION: 'Belum ada soal aktif.',
  BUZZER_NOT_AVAILABLE: 'Buzzer hanya bisa dibuka saat soal babak rebutan tampil.',
  NOTHING_TO_JUDGE: 'Tidak ada jawaban buzzer yang menunggu penilaian.',
  REASON_REQUIRED: 'Alasan koreksi wajib diisi.',
  CODE_TOO_SHORT: 'Kode minimal 4 karakter.',
  INVALID_RESULT: 'Hasil penilaian tidak valid.',
  WAGER_CLOSED: 'Waktu pasang taruhan sudah ditutup.',
  WAGER_TOO_HIGH: 'Taruhan melebihi batas maksimal homegroup-mu.',
  INVALID_WAGER: 'Jumlah taruhan tidak valid.',
}

export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k))
  if (code) return MESSAGES[code]
  if (/fetch|network|Failed to/i.test(raw)) return 'Koneksi bermasalah. Coba lagi.'
  return raw
}

export function isCode(e: unknown, code: string) {
  return e instanceof Error && e.message.includes(code)
}
