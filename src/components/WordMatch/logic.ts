// Pure game rules for the Word Match mini-game: board, gravity, word finding,
// chains, scoring and the falling two-kana piece. No React, no timers, no randomness.
import { BOARD_COLS, BOARD_ROWS, MIN_WORD_LENGTH, MAX_WORD_LENGTH } from './kanaSet'
import type { Board, DictEntry, Lookup } from './kanaSet'

// ---------- scoring ----------

export const SCORE_PER_CHAR = 10 // points per cleared character
export const CHAIN_BONUS_PER_STEP = 1 // multiplier = 1 + step * CHAIN_BONUS_PER_STEP

export const chainMultiplier = (step: number): number => 1 + step * CHAIN_BONUS_PER_STEP
export const wordPoints = (length: number, step: number): number =>
    length * SCORE_PER_CHAR * chainMultiplier(step)
// technical approach: the whole scoring rule is these two constants plus two
// one-line functions, so changing the rule never touches the board code

// ---------- board ----------

export type Pos = { r: number, c: number }
export type FoundWord = { kana: string, entry: DictEntry, dir: 'h' | 'v', cells: Pos[] }

export const createBoard = (): Board =>
    Array.from({ length: BOARD_ROWS }, () => Array<string | null>(BOARD_COLS).fill(null))

export const cloneBoard = (b: Board): Board => b.map(row => row.slice())
// technical approach: rows are copied one by one (cells are primitives), so a
// cloned board shares nothing with the original

export const applyGravity = (b: Board): Board => {
    const out = createBoard()
    for (let c = 0; c < BOARD_COLS; c++) {
        let write = BOARD_ROWS - 1
        for (let r = BOARD_ROWS - 1; r >= 0; r--) {
            const cell = b[r][c]
            if (cell !== null) {
                out[write][c] = cell
                write--
            }
        }
    }
    return out
}
// technical approach: per column, read bottom-up and write each non-null cell
// to the lowest free slot of a fresh board; order is kept, input is untouched

// ---------- word finding ----------

export const findWords = (b: Board, lookup: Lookup): FoundWord[] => {
    const found: FoundWord[] = []

    // scan one line (row or column) given as a list of positions
    const scanLine = (line: Pos[], dir: 'h' | 'v') => {
        let i = 0
        while (i < line.length) {
            if (b[line[i].r][line[i].c] === null) {
                i++
                continue
            }
            let end = i // end = index after the last cell of this run
            while (end < line.length && b[line[end].r][line[end].c] !== null) end++
            for (let start = i; start < end; start++) {
                const maxLen = Math.min(MAX_WORD_LENGTH, end - start)
                for (let len = maxLen; len >= MIN_WORD_LENGTH; len--) {
                    const cells = line.slice(start, start + len)
                    const kana = cells.map(p => b[p.r][p.c]).join('')
                    const entry = lookup.get(kana)
                    if (entry) found.push({ kana, entry, dir, cells })
                }
            }
            i = end
        }
    }

    for (let r = 0; r < BOARD_ROWS; r++) {
        const line: Pos[] = []
        for (let c = 0; c < BOARD_COLS; c++) line.push({ r, c })
        scanLine(line, 'h')
    }
    for (let c = 0; c < BOARD_COLS; c++) {
        const line: Pos[] = []
        for (let r = 0; r < BOARD_ROWS; r++) line.push({ r, c })
        scanLine(line, 'v')
    }
    return found
}
// technical approach: each row/column becomes a list of positions; a run of
// non-null cells is found, then every start index and every length from the
// longest down to MIN_WORD_LENGTH is looked up in the Map. Rows go first, then
// columns, which gives the deterministic order. Overlaps are all reported

const posKey = (p: Pos): number => p.r * BOARD_COLS + p.c

export const pickScoringWords = (found: FoundWord[]): FoundWord[] => {
    const sorted = found
        .map((w, i) => ({ w, i }))
        .sort((x, y) => y.w.kana.length - x.w.kana.length || x.i - y.i)
    const used = new Set<number>()
    const kept: FoundWord[] = []
    for (const { w } of sorted) {
        if (w.cells.some(p => used.has(posKey(p)))) continue
        kept.push(w)
        for (const p of w.cells) used.add(posKey(p))
    }
    return kept
}
// technical approach: sort by length descending with the scan index as the tie
// breaker (explicit, so it does not rely on sort stability), then greedily keep a
// word only if none of its cells is in the used set. The set is shared by
// horizontal and vertical words

export type ChainStep = {
    step: number // 0 for the first clear
    found: FoundWord[] // every dictionary word found this round (all of them get cleared)
    scored: FoundWord[] // longest-wins subset that counts for score
    cleared: Pos[] // union of all cells of `found`, no duplicates
    points: number // sum of wordPoints(word.kana.length, step) over `scored`
    boardBefore: Board // board when found (words still on it)
    boardCleared: Board // cleared cells set to null, before gravity
    boardAfter: Board // after applyGravity
}

export const resolveChain = (
    b: Board,
    lookup: Lookup,
): { steps: ChainStep[], board: Board, points: number } => {
    const steps: ChainStep[] = []
    let board = cloneBoard(b)
    let total = 0
    for (let step = 0; ; step++) {
        const found = findWords(board, lookup)
        if (found.length === 0) break

        const seen = new Set<number>()
        const cleared: Pos[] = []
        for (const w of found) {
            for (const p of w.cells) {
                if (seen.has(posKey(p))) continue
                seen.add(posKey(p))
                cleared.push({ r: p.r, c: p.c })
            }
        }

        const scored = pickScoringWords(found)
        const points = scored.reduce((sum, w) => sum + wordPoints(w.kana.length, step), 0)
        const boardBefore = board
        const boardCleared = cloneBoard(board)
        for (const p of cleared) boardCleared[p.r][p.c] = null
        const boardAfter = applyGravity(boardCleared)

        steps.push({ step, found, scored, cleared, points, boardBefore, boardCleared, boardAfter })
        total += points
        board = boardAfter
    }
    return { steps, board, points: total }
}
// technical approach: a loop of find -> clear the union of cells -> gravity,
// where each round is one chain step. It stops when a scan finds nothing. Every
// board stored in a step is its own copy, so the UI can replay the steps and the
// input board is never mutated

// ---------- falling piece ----------

export type Piece = { a: string, b: string, r: number, c: number, rot: 0 | 1 | 2 | 3 }
// a = pivot char at (r,c). b = satellite at pivot + offset:
// rot 0 = above (r-1,c), 1 = right (r,c+1), 2 = below (r+1,c), 3 = left (r,c-1)

export const SPAWN_ROW = 1
export const SPAWN_COL = 2

const SAT_OFFSET: Record<0 | 1 | 2 | 3, { dr: number, dc: number }> = {
    0: { dr: -1, dc: 0 },
    1: { dr: 0, dc: 1 },
    2: { dr: 1, dc: 0 },
    3: { dr: 0, dc: -1 },
}

export const spawnPiece = (chars: [string, string]): Piece =>
    ({ a: chars[0], b: chars[1], r: SPAWN_ROW, c: SPAWN_COL, rot: 0 })

export const pieceCells = (p: Piece): { r: number, c: number, ch: string }[] => {
    const o = SAT_OFFSET[p.rot]
    return [
        { r: p.r, c: p.c, ch: p.a },
        { r: p.r + o.dr, c: p.c + o.dc, ch: p.b },
    ]
}
// technical approach: the satellite position is a lookup of the rotation in an
// offset table, so movement, rotation and locking all share one geometry

export const canPlace = (b: Board, p: Piece): boolean =>
    pieceCells(p).every(({ r, c }) =>
        r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS && b[r][c] === null)

export const isSpawnBlocked = (b: Board, p: Piece): boolean => !canPlace(b, p)

export const movePiece = (b: Board, p: Piece, dc: -1 | 1): Piece => {
    const moved: Piece = { ...p, c: p.c + dc }
    return canPlace(b, moved) ? moved : p
}

export const rotatePiece = (b: Board, p: Piece): Piece => {
    const rot = ((p.rot + 1) % 4) as 0 | 1 | 2 | 3
    // kick candidates as [row shift, column shift], tried in order
    let kicks: [number, number][]
    if (rot === 1) kicks = [[0, 0], [0, -1]] // satellite now on the right: push left
    else if (rot === 3) kicks = [[0, 0], [0, 1]] // satellite now on the left: push right
    else if (rot === 2) kicks = [[0, 0], [-1, 0]] // satellite now below: push up off floor or stack
    else kicks = [[0, 0], [0, -1], [0, 1]]
    for (const [dr, dc] of kicks) {
        const next: Piece = { ...p, rot, r: p.r + dr, c: p.c + dc }
        if (canPlace(b, next)) return next
    }
    return p
}
// technical approach: build the rotated piece and try it in place first, then
// shift it away from whatever blocked it (wall or stack to the side, floor or
// stack below). The first placement that fits wins; if none fits the piece is
// returned unchanged

export const stepDown = (b: Board, p: Piece): Piece | null => {
    const next: Piece = { ...p, r: p.r + 1 }
    return canPlace(b, next) ? next : null
}

export const hardDrop = (b: Board, p: Piece): Piece => {
    let cur = p
    for (;;) {
        const next = stepDown(b, cur)
        if (next === null) return cur
        cur = next
    }
}
// technical approach: hardDrop is just stepDown repeated until it returns null,
// so it can never disagree with the normal one-row fall

export const lockPiece = (b: Board, p: Piece): Board => {
    const out = cloneBoard(b)
    for (const { r, c, ch } of pieceCells(p)) {
        if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) out[r][c] = ch
    }
    return applyGravity(out)
}
// technical approach: write both chars into a copy, then run gravity, so a
// half that hangs over a gap falls on its own (Puyo style)
