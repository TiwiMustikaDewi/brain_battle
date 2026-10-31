export type Round = 'lobby' | 'quickfire' | 'buzzer' | 'final' | 'results'
export type PlayRound = 'quickfire' | 'buzzer' | 'final'
export type Phase = 'idle' | 'wager' | 'question' | 'reveal'
export type Status = 'lobby' | 'live' | 'paused' | 'finished'
export type BuzzerState = 'closed' | 'open' | 'locked'

export interface PublicQuestion {
  id: string
  round: PlayRound
  category: string
  difficulty: string
  /** null during the Final Showdown wager phase (only the category is shown). */
  body: string | null
  options: string[] | null
  duration_sec: number
  points_correct: number
  points_wrong: number
  wager_sec?: number
}

export interface WagerResult {
  homegroup_id: string
  amount: number
  result: 'correct' | 'wrong' | 'void' | null
}

export interface Reveal {
  question_id: string
  correct_option: number | null
  answer_text: string | null
  counts: number[] | null
  answered: number | null
  roster: number
  wagers?: WagerResult[] | null
}

export interface Judgement {
  homegroup_id: string
  result: 'correct' | 'wrong' | 'void'
  delta: number
  seq: number
}

export interface GameSession {
  id: string
  code: string
  name: string
  pack: 'A' | 'B'
  status: Status
  round: Round
  phase: Phase
  roster_locked: boolean
  current_question_id: string | null
  question_no: number
  question_total: number
  question_started_at: string | null
  question_deadline: string | null
  public_question: PublicQuestion | null
  reveal: Reveal | null
  shown_question_ids: string[]
  buzzer_state: BuzzerState
  buzzer_seq: number
  buzzer_winner_hg: string | null
  buzzer_locked_at: string | null
  buzzer_excluded: string[]
  /** Homegroups that placed a wager on the current final question (amounts stay secret). */
  wagered_hgs: string[]
  last_judgement: Judgement | null
  message: string | null
  updated_at: string
}

export interface Homegroup {
  id: string
  session_id: string
  name: string
  color: string
  sort_order: number
  member_count: number
  quickfire_score: number
  battle_score: number
  total_score: number
  buzzer_holder: string | null
}

export interface Question {
  id: string
  pack: 'A' | 'B'
  round: PlayRound
  order_no: number
  category: string
  difficulty: 'mudah' | 'sedang' | 'sulit'
  body: string
  options: string[] | null
  correct_option: number | null
  answer_text: string | null
  duration_sec: number
  points_correct: number
  points_wrong: number
  created_at?: string
}

export const ROUND_LABEL: Record<Round, string> = {
  lobby: 'Lobby',
  quickfire: 'Quick Fire',
  buzzer: 'Battle Buzzer',
  final: 'Final Showdown',
  results: 'Hasil Akhir',
}

/** Largest wager a homegroup may place: its score, but at least 200 (mirrors private.wager_cap). */
export const wagerCap = (score: number) => Math.max(Math.floor(score), 200)

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const
