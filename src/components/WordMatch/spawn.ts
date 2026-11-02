import { ALLOWED_KANA } from './kanaSet'
import { DICTIONARY } from './dictionary'
import type { DictEntry } from './kanaSet'

export const computeWeights = (entries: readonly DictEntry[] = DICTIONARY): Map<string, number> => {
    const w = new Map<string, number>(ALLOWED_KANA.map(k => [k, 0]))
    for (const e of entries) for (const ch of Array.from(e.kana)) w.set(ch, (w.get(ch) ?? 0) + 1)
    return w
}
// technical approach: weight of a kana = how many times it appears across every
// dictionary word (a kana twice in one word counts twice). It is computed from
// DICTIONARY when this module loads, nothing is hard-coded, so editing the
// dictionary changes the spawn ratios by itself. Every allowed kana starts at 0
// so a kana missing from all words is visible (see zeroWeightKana)

export const CHAR_WEIGHTS = computeWeights()
export const zeroWeightKana = (): string[] => ALLOWED_KANA.filter(k => !CHAR_WEIGHTS.get(k))
// kana that never spawn because no dictionary word uses them

export const pickChar = (rng: () => number = Math.random, weights: ReadonlyMap<string, number> = CHAR_WEIGHTS): string => {
    let total = 0
    for (const n of weights.values()) total += n
    let roll = rng() * total
    for (const [k, n] of weights) {
        if (n <= 0) continue
        roll -= n
        if (roll < 0) return k
    }
    return ALLOWED_KANA[0] // only reached by rounding at the very end of the list
}
// technical approach: roulette-wheel pick. Roll a number in [0, total weight),
// walk the kana subtracting each weight, and the kana where the roll drops
// below 0 wins, so a kana is picked with probability weight / total. rng is a
// parameter so a test can pass a fixed sequence

export const pickPair = (rng: () => number = Math.random): [string, string] => [pickChar(rng), pickChar(rng)]
// the two characters of one falling piece, drawn independently
