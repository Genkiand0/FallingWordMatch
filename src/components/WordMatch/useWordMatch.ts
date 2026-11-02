'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Board } from './kanaSet'
import { DICTIONARY_LOOKUP } from './dictionary'
import { pickPair } from './spawn'
import {
    createBoard, hardDrop, isSpawnBlocked, lockPiece, movePiece, resolveChain, rotatePiece, spawnPiece, stepDown,
    type FoundWord, type Piece, type Pos,
} from './logic'

export const FALL_MS = 650 // time between automatic one-row drops
export const FLASH_MS = 450 // words blink before they vanish
export const CLEAR_MS = 350 // pause on the board with the words gone, before gravity
export const GRAVITY_MS = 350 // pause after the blocks above have dropped, before the next scan
export const POPUP_TAIL_MS = 500 // how long the last word popup stays after the chain ends

export type Phase = 'ready' | 'playing' | 'resolving' | 'over'
export type Action = 'left' | 'right' | 'rotate' | 'soft' | 'hard'
export type ClearedWord = { kana: string, kanji: string, meaning: string }
export type Popup = { step: number, points: number, words: ClearedWord[] }

export type WordMatchState = {
    board: Board // what to draw: during a chain this is the board of the current animation frame
    piece: Piece | null // the falling piece; null while a chain runs or the game is over
    next: [string, string] // 1-piece preview
    phase: Phase
    score: number
    words: ClearedWord[] // every scored word in the order it was cleared
    popup: Popup | null // the words just cleared, shown as hiragana / kanji / meaning
    flash: Pos[] // cells about to clear (to blink)
}
// technical approach: one plain object holds everything the UI draws. The hook
// keeps the same object in a ref (always the latest) and in React state (to
// re-render), so timers and key handlers never read a stale copy

const toCleared = (w: FoundWord): ClearedWord => ({ kana: w.kana, kanji: w.entry.kanji, meaning: w.entry.meaning })

const INITIAL: WordMatchState = {
    board: createBoard(), piece: null, next: ['あ', 'い'], phase: 'ready', score: 0, words: [], popup: null, flash: [],
}
// the first render is empty and non-random; the real game starts in an effect
// after mount, so the server HTML and the first client render match (no hydration mismatch)

export default function useWordMatch() {
    const [state, setState] = useState<WordMatchState>(INITIAL)
    const ref = useRef<WordMatchState>(INITIAL)
    const runId = useRef(0)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    const commit = useCallback((patch: Partial<WordMatchState>) => {
        ref.current = { ...ref.current, ...patch }
        setState(ref.current)
    }, [])

    const cancelRun = useCallback(() => {
        runId.current++
        timers.current.forEach(clearTimeout)
        timers.current = []
    }, [])
    // technical approach: every chain animation captures runId when it starts and
    // checks it after each wait. Restart or unmount bumps runId and clears the
    // timers, so an old chain can never write into a new game

    const wait = useCallback((ms: number) => new Promise<void>(res => { timers.current.push(setTimeout(res, ms)) }), [])

    const spawnNext = useCallback((board: Board) => {
        const piece = spawnPiece(ref.current.next)
        if (isSpawnBlocked(board, piece)) { commit({ board, piece: null, phase: 'over' }); return }
        commit({ board, piece, next: pickPair(), phase: 'playing' })
    }, [commit])
    // game over = the spawn cells (column 3, rows 1 and 2 from the top) are occupied

    const land = useCallback(async (p: Piece) => {
        const id = ++runId.current
        const locked = lockPiece(ref.current.board, p)
        commit({ board: locked, piece: null, phase: 'resolving', flash: [], popup: null }) // phase 'resolving' from here: act() ignores all input
        const res = resolveChain(locked, DICTIONARY_LOOKUP)
        for (const s of res.steps) {
            commit({ board: s.boardBefore, flash: s.cleared, popup: null })
            await wait(FLASH_MS); if (id !== runId.current) return
            commit({
                board: s.boardCleared, flash: [], score: ref.current.score + s.points,
                words: [...ref.current.words, ...s.scored.map(toCleared)],
                popup: { step: s.step, points: s.points, words: s.scored.map(toCleared) },
            })
            await wait(CLEAR_MS); if (id !== runId.current) return
            commit({ board: s.boardAfter })
            await wait(GRAVITY_MS); if (id !== runId.current) return
        }
        if (res.steps.length) {
            await wait(POPUP_TAIL_MS); if (id !== runId.current) return
            commit({ popup: null })
        }
        spawnNext(res.board)
    }, [commit, wait, spawnNext])
    // technical approach: lockPiece puts the piece down (each half falls alone),
    // resolveChain computes the whole chain at once (pure), and this plays it back
    // frame by frame: blink the words, show them gone with the popup and the
    // points, drop the blocks above, then the next step. The piece is null and
    // phase is 'resolving' for the whole time, so input is ignored and the next
    // piece spawns only after the last step. Only scored words (longest wins)
    // go to the score and the word list; overlapped shorter words just vanish

    const act = useCallback((a: Action) => {
        const g = ref.current
        if (g.phase !== 'playing' || !g.piece) return // chain / game over / not started: input ignored
        if (a === 'left') commit({ piece: movePiece(g.board, g.piece, -1) })
        else if (a === 'right') commit({ piece: movePiece(g.board, g.piece, 1) })
        else if (a === 'rotate') commit({ piece: rotatePiece(g.board, g.piece) })
        else if (a === 'hard') void land(hardDrop(g.board, g.piece))
        else { // 'soft'
            const down = stepDown(g.board, g.piece)
            if (down) commit({ piece: down }); else void land(g.piece)
        }
    }, [commit, land])
    // technical approach: the single entry point for keyboard, on-screen buttons
    // and the fall timer. The phase check at the top is the input lock

    const start = useCallback(() => {
        cancelRun()
        const first = pickPair()
        ref.current = { ...INITIAL, board: createBoard(), piece: spawnPiece(first), next: pickPair(), phase: 'playing' }
        setState(ref.current)
    }, [cancelRun])

    useEffect(() => {
        start()
        return cancelRun
    }, [start, cancelRun])
    // starts on mount, and stops any running chain on unmount

    useEffect(() => {
        if (state.phase !== 'playing') return
        const t = setInterval(() => act('soft'), FALL_MS)
        return () => clearInterval(t)
    }, [state.phase, act])
    // gravity tick: while playing, the piece falls one row every FALL_MS (landing
    // when it cannot). The interval exists only in the 'playing' phase, so it is
    // gone during a chain and restarts fresh for each new piece

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const map: Record<string, Action> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'soft', ' ': 'hard' }
            const a = map[e.key]
            if (!a) return
            e.preventDefault() // arrows and Space would scroll the page
            if (a === 'hard' && e.repeat) return // holding Space must not drop the next piece too
            act(a)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [act])
    // PC controls: left / right arrows move, up rotates, down soft-drops, Space hard-drops

    return { ...state, act, restart: start }
}
