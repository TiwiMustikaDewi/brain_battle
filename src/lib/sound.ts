// Synthesised WebAudio cues (no audio files to load). Browsers only allow audio
// after a user gesture, so the context is unlocked on the first tap/click.
let ctx: AudioContext | null = null
let muted = false
try {
  muted = localStorage.getItem('bb:muted') === '1'
} catch {
  // storage unavailable — default to sound on
}

export function enableSound() {
  ctx ??= new AudioContext()
  void ctx.resume()
  syncMusic()
}

export function soundReady() {
  return ctx?.state === 'running'
}

/** Unlock audio on the first interaction anywhere on the page. */
export function unlockOnFirstGesture() {
  const unlock = () => {
    enableSound()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return unlock
}

export function isMuted() {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
  applyMusicVolume()
  try {
    localStorage.setItem('bb:muted', value ? '1' : '0')
  } catch {
    // ignore
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', gain = 0.12, slideTo?: number) {
  if (!ctx || muted) return
  const t0 = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function notes(seq: [freq: number, dur: number][], type: OscillatorType = 'triangle', gain = 0.14) {
  let t = 0
  for (const [f, d] of seq) {
    tone(f, t, d * 1.1, type, gain)
    t += d
  }
}

export const sfx = {
  /** New question on screen. */
  question: () => tone(300, 0, 0.35, 'sine', 0.16, 900),
  /** Buzzer opened. */
  open: () => notes([[880, 0.08], [1320, 0.16]], 'square', 0.1),
  /** Someone won the buzzer. */
  buzz: () => {
    tone(196, 0, 0.6, 'sawtooth', 0.2)
    tone(233, 0, 0.6, 'sawtooth', 0.12)
  },
  correct: () => notes([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3]]),
  wrong: () => {
    tone(220, 0, 0.25, 'square', 0.13, 180)
    tone(160, 0.25, 0.5, 'square', 0.13, 110)
  },
  /** Countdown tick for the last seconds; `urgent` on the final second. */
  tick: (urgent = false) => tone(urgent ? 1200 : 900, 0, 0.07, 'square', 0.08),
  timeUp: () => tone(440, 0, 0.7, 'sawtooth', 0.15, 110),
  /** Any button press. */
  click: () => {
    tone(1400, 0, 0.04, 'sine', 0.1, 600)
    tone(320, 0, 0.06, 'triangle', 0.07)
  },
  /** Phone: answer locked in. */
  tap: () => tone(700, 0, 0.06, 'triangle', 0.12),
  /** Round intro / leaderboard shown. */
  whoosh: () => tone(150, 0, 0.5, 'sine', 0.14, 1200),
  fanfare: () =>
    notes([
      [523, 0.12], [523, 0.12], [523, 0.12], [698, 0.45],
      [880, 0.2], [784, 0.12], [880, 0.12], [1047, 0.7],
    ], 'square', 0.1),
}

// ---------------------------------------------------------------------------
// Background music: a small generative synth loop (kick, bass, arpeggio, hats)
// scheduled ahead of time on the AudioContext clock. `tense` doubles the hats and
// arpeggio for questions with a running timer.
// ---------------------------------------------------------------------------

export type MusicMood = 'calm' | 'tense' | 'off'

const BPM = 116
const STEP = 60 / BPM / 4
// A minor – F – C – G, as MIDI root-position triads
const PROGRESSION = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
const MUSIC_LEVEL = 0.32

let musicOn = false
try {
  musicOn = localStorage.getItem('bb:music') === '1'
} catch {
  // ignore
}
let mood: MusicMood = 'off'
let bus: GainNode | null = null
let noise: AudioBuffer | null = null
let timer: ReturnType<typeof setInterval> | null = null
let step = 0
let nextAt = 0

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)

export function isMusicOn() {
  return musicOn
}

export function setMusicOn(value: boolean) {
  musicOn = value
  try {
    localStorage.setItem('bb:music', value ? '1' : '0')
  } catch {
    // ignore
  }
  syncMusic()
}

/** Default for this device when the user has never toggled music. */
export function setMusicDefault(value: boolean) {
  try {
    if (localStorage.getItem('bb:music') === null) musicOn = value
  } catch {
    musicOn = value
  }
  syncMusic()
}

export function setMusicMood(next: MusicMood) {
  mood = next
  syncMusic()
}

function applyMusicVolume() {
  if (!ctx || !bus) return
  const target = muted || !musicOn || mood === 'off' ? 0.0001 : mood === 'tense' ? MUSIC_LEVEL * 0.8 : MUSIC_LEVEL
  bus.gain.cancelScheduledValues(ctx.currentTime)
  bus.gain.setTargetAtTime(target, ctx.currentTime, 0.4)
}

function syncMusic() {
  const play = musicOn && mood !== 'off' && !!ctx
  if (play && !timer) startScheduler()
  applyMusicVolume()
  if (!play && timer) {
    const t = timer
    timer = null
    setTimeout(() => clearInterval(t), 1500) // let the fade-out finish
  }
}

function startScheduler() {
  if (!ctx) return
  if (!bus) {
    bus = ctx.createGain()
    bus.gain.value = 0.0001
    bus.connect(ctx.destination)
  }
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  step = 0
  nextAt = ctx.currentTime + 0.1
  timer = setInterval(() => {
    if (!ctx) return
    while (nextAt < ctx.currentTime + 0.15) {
      scheduleStep(step, nextAt)
      nextAt += STEP
      step++
    }
  }, 25)
}

function synth(freq: number, t: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  if (!ctx || !bus) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(bus)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function hiss(t: number, dur: number, gain: number, freq: number, type: BiquadFilterType) {
  if (!ctx || !bus || !noise) return
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(bus)
  src.start(t)
  src.stop(t + dur + 0.02)
}

function scheduleStep(n: number, t: number) {
  const s = n % 16
  const chord = PROGRESSION[Math.floor(n / 16) % PROGRESSION.length]
  const tense = mood === 'tense'

  if (s % 4 === 0) synth(140, t, 0.18, 'sine', 0.9, 45) // kick
  if (s === 4 || s === 12) hiss(t, 0.16, 0.35, 1800, 'bandpass') // clap
  if (tense ? true : s % 4 === 2) hiss(t, 0.04, tense ? 0.12 : 0.16, 8000, 'highpass') // hats
  if ([0, 3, 6, 8, 11, 14].includes(s)) synth(mtof(chord[0] - 24), t, STEP * 1.6, 'sawtooth', 0.16) // bass
  if (tense || s % 2 === 0) {
    const note = chord[(tense ? s : s / 2) % 3] + 12
    synth(mtof(note), t, STEP * 1.2, 'triangle', 0.07)
  }
  if (s === 0) for (const m of chord) synth(mtof(m), t, STEP * 15, 'sine', 0.035) // pad
}
