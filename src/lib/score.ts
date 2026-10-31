import type { Homegroup } from './types'

/**
 * Leaderboard order. Tie-break: total, then buzzer-round points (battle_score),
 * then Quick Fire average. A remaining exact tie shares the rank.
 */
export function rankHomegroups(hgs: Homegroup[]) {
  const sorted = [...hgs].sort(
    (a, b) =>
      b.total_score - a.total_score ||
      b.battle_score - a.battle_score ||
      b.quickfire_score - a.quickfire_score ||
      a.sort_order - b.sort_order,
  )
  return sorted.map((hg, i) => {
    let rank = i + 1
    for (let j = i - 1; j >= 0; j--) {
      const p = sorted[j]
      if (p.total_score === hg.total_score && p.battle_score === hg.battle_score && p.quickfire_score === hg.quickfire_score) rank = j + 1
      else break
    }
    return { ...hg, rank }
  })
}

export function fmtScore(n: number) {
  return Number.isInteger(n) ? n.toLocaleString('id-ID') : n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export function normalizeHomegroup(row: Record<string, unknown>): Homegroup {
  return {
    ...(row as unknown as Homegroup),
    quickfire_score: Number(row.quickfire_score ?? 0),
    battle_score: Number(row.battle_score ?? 0),
    total_score: Number(row.total_score ?? 0),
    member_count: Number(row.member_count ?? 0),
  }
}
