'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import Button from '@/components/button'
import { BUBBLE_BG, BUBBLE_BOARDER, BUBBLE_BORDER_W, BUBBLE_SHADOW } from './theme'
import useWordMatch from './useWordMatch'
import type { Action, ClearedWord } from './useWordMatch'
import { BOARD_COLS, BOARD_ROWS } from './kanaSet'
import { pieceCells, findNearWords } from './logic'
import { DICTIONARY, DICTIONARY_LOOKUP } from './dictionary'
import { relatedWords } from './spawn'

const PAD = 12 // side padding around the whole screen content (px)
const HUD_H = 56 // height of the score / next / back row (px)
const BTN_H = 64 // height of each control button (px)
const CONTROLS_H = BTN_H // height of the controls row (px)
const GAPS = 40 // vertical breathing room: top padding + gaps between HUD, board and controls (px)
const MIN_CELL = 16 // smallest tile size (px)
const MAX_CELL = 56 // largest tile size, caps big desktop screens (px)
const BTN_GAP = 6 // gap between control buttons (px)
const REPEAT_DELAY_MS = 300 // hold a left/right button this long before it starts repeating
const REPEAT_MS = 110 // repeat interval while a left/right button is held
const WORDS_PREVIEW = 5 // cleared words shown on the game over panel before "Show more"
const PIECE_FILL = '#ffe9a8' // fill of the falling (controllable) tiles
const FLASH_FILL = '#ffd24d' // blink color of the tiles about to clear
const BOARD_FILL = '#f3ecc8' // slightly darker cream behind the tiles
const GRID_LINE = 'rgba(0,0,0,0.06)' // faint grid lines on the board
const START_W = 375 // initial viewport guess before the first measure (px)
const START_H = 667 // initial viewport guess before the first measure (px)

const BUTTONS: { id: string, label: string, hold: boolean, action: Action }[] = [
    { id: 'left', label: '◀', hold: true, action: 'left' },
    { id: 'right', label: '▶', hold: true, action: 'right' },
    { id: 'rotate', label: 'Rotate', hold: false, action: 'rotate' },
    { id: 'drop', label: 'Drop', hold: false, action: 'hard' },
]
// technical approach: the four controls are data, so the row is one map and
// "hold" decides which ones auto-repeat

const tileStyle = (r: number, c: number, cell: number, fill: string): CSSProperties => ({
    position: 'absolute',
    left: c * cell,
    top: r * cell,
    width: cell,
    height: cell,
    boxSizing: 'border-box',
    border: `${BUBBLE_BORDER_W}px solid ${BUBBLE_BOARDER}`,
    background: fill,
    boxShadow: `2px 2px 0 ${BUBBLE_SHADOW}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: cell * 0.6,
    lineHeight: 1,
})
// technical approach: a tile is just an absolutely placed square at (c*cell, r*cell),
// styled like CharBlock (border, fill, flat shadow), so it stays glued to the grid

const panelStyle: CSSProperties = {
    border: `${BUBBLE_BORDER_W}px solid ${BUBBLE_BOARDER}`,
    background: BUBBLE_BG,
    boxShadow: `3px 3px 0 ${BUBBLE_SHADOW}`,
    color: 'black',
}
// technical approach: one shared look for the popup and game over panel, same as the dialog bubble

const wordLine = (w: ClearedWord) => `${w.kana} / ${w.kanji} / ${w.meaning}`

const PASTELS = ['#ffc9d9', '#bfe3ff', '#c8f2c2', '#dcd0ff', '#ffd2b0'] // pink, sky, mint, lavender, peach: one per hinted word
const GHOST_OPACITY = 0.4 // how see-through the landmark block for the missing kana is
const HL_RED ='#d62828' // colour of the upper falling kana (the piece's satellite)
const HL_BLUE = '#1d4ed8' // colour of the lower falling kana (the piece's pivot)
const DICT_FONT = 'calc(12px + 4pt)' // dictionary list text: the old 12px made 4pt bigger
const DICT_NOTE_FONT = 'calc(10px + 4pt)' // dictionary subtitle: the old 10px made 4pt bigger
const BOOK_BTN = 44// size of the dictionary book button (px), above the 44px minimum touch target
const BOOK_COVER = '#c9573f' // red cover of the book icon
const BOOK_PAGES = '#fffdf0' // page edge of the book icon
const SORTED_DICTIONARY = [...DICTIONARY].sort((a, b) => a.kana.localeCompare(b.kana, 'ja'))
// technical approach: sorted once when the module loads (not on every render), in Japanese order, so the book reads like a real word list

function BookIcon() {
    return (
        <svg width={30} height={30} viewBox="0 0 30 30" shapeRendering="crispEdges" aria-hidden>
            <rect x={5} y={3} width={21} height={25} fill={BOOK_PAGES} stroke={BUBBLE_BOARDER} strokeWidth={2} />
            <rect x={4} y={2} width={21} height={24} fill={BOOK_COVER} stroke={BUBBLE_BOARDER} strokeWidth={2} />
            <rect x={4} y={2} width={4} height={24} fill="#8f3a29" stroke={BUBBLE_BOARDER} strokeWidth={2} />
            <text x={17} y={19} textAnchor="middle" fontSize={11} fill="#fffff2">あ</text>
        </svg>
    )
}
// technical approach: the book is a small inline SVG, so it needs no image file: pages behind, a red
// cover with a darker spine, and あ on the front. crispEdges keeps the pixel-art look

export default function WordMatchGame({ onLeave }: { onLeave?: () => void }) {
    const g = useWordMatch()
    const [size, setSize] = useState({ w: START_W, h: START_H })
    const [expanded, setExpanded] = useState(false)
    const [showAllWords, setShowAllWords] = useState(false)
    const dictListRef = useRef<HTMLDivElement | null>(null)
    const dictScrollRef = useRef(0)
    // technical approach: the dictionary panel unmounts when closed, so the list's scrollTop is saved on
    // close and put back by this stable callback ref when the list mounts again. Not reset between
    // openings; the Related / All words choice is also kept so the saved position still matches the list
    const setDictList = useCallback((el: HTMLDivElement | null) => {
        dictListRef.current = el
        if (el) el.scrollTop = dictScrollRef.current
    }, [])
    const closeDictionary = () => {
        dictScrollRef.current = dictListRef.current?.scrollTop ?? 0
        g.setPaused(false)
    }
    const toggleAllWords = () => {
        dictScrollRef.current = 0
        if (dictListRef.current) dictListRef.current.scrollTop = 0
        setShowAllWords(v => !v)
    }
    const actRef = useRef(g.act)
    const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => { actRef.current = g.act }, [g.act])
    // technical approach: the hold timers call the latest act through a ref, so they never use a stale one

    useEffect(() => {
        const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight })
        measure()
        window.addEventListener('resize', measure)
        window.addEventListener('orientationchange', measure)
        return () => {
            window.removeEventListener('resize', measure)
            window.removeEventListener('orientationchange', measure)
        }
    }, [])
    // technical approach: measure on mount and on resize / rotation, so the board always refits the viewport

    const stopHold = useCallback(() => {
        if (delayRef.current) clearTimeout(delayRef.current)
        if (repeatRef.current) clearInterval(repeatRef.current)
        delayRef.current = null
        repeatRef.current = null
    }, [])
    useEffect(() => stopHold, [stopHold])
    // technical approach: stopHold clears both timers; it also runs on unmount

    const press = (b: typeof BUTTONS[number]) => (e: PointerEvent<HTMLDivElement>) => {
        e.preventDefault()
        stopHold()
        actRef.current(b.action)
        if (!b.hold) return
        delayRef.current = setTimeout(() => {
            repeatRef.current = setInterval(() => actRef.current(b.action), REPEAT_MS)
        }, REPEAT_DELAY_MS)
    }
    // technical approach: act once on pointer down; for held buttons a 300ms timer
    // starts a 110ms interval, which any release / leave / cancel clears

    const cell = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(Math.min(
        (size.w - 2 * PAD - 2 * BUBBLE_BORDER_W) / BOARD_COLS,
        (size.h - HUD_H - CONTROLS_H - GAPS) / BOARD_ROWS,
    ))))
    const boardW = cell * BOARD_COLS
    const boardH = cell * BOARD_ROWS
    const outerW = boardW + 2 * BUBBLE_BORDER_W
    // technical approach: the cell is the largest square that fits both the width
    // and the height left after HUD, controls and gaps, clamped to 16..56; the board is then cell*6 by cell*12

    const flashSet = new Set(g.flash.map(p => `${p.r},${p.c}`))
    const falling = g.piece ? pieceCells(g.piece) : []
    const miniSize = Math.round(cell * 0.7)

    const back = onLeave
        ? <Button size={14} action={onLeave}>Back</Button>
        : null
    // technical approach: Back is a Button only when the parent passes onLeave; this standalone app has nowhere to go back to, so the page passes none

    const shown = expanded ? g.words : g.words.slice(0, WORDS_PREVIEW)

    const fallingChars = g.piece ? [g.piece.b, g.piece.a] : [...g.next].reverse()
    const related = relatedWords(fallingChars)
    const hints = useMemo(() => {
        const fill = new Map<string, string>()
        const ghosts = new Map<string, { r: number, c: number, char: string, color: string }>()
        if (g.phase === 'playing') {
            findNearWords(g.board, DICTIONARY_LOOKUP).forEach((w, i) => {
                const color = PASTELS[i % PASTELS.length]
                for (const p of w.cells) if (!fill.has(`${p.r},${p.c}`)) fill.set(`${p.r},${p.c}`, color)
                const key = `${w.missing.r},${w.missing.c}`
                if (!ghosts.has(key)) ghosts.set(key, { r: w.missing.r, c: w.missing.c, char: w.char, color })
            })
        }
        return { fill, ghosts: [...ghosts.values()] }
    }, [g.board, g.phase])
    // technical approach: while playing, every line that is one kana short of a word gives its tiles a pastel
    // colour (one per word, cycling through PASTELS; a tile in several words keeps the first) and its missing
    // cell a ghost. A cell wanted by several words gets one ghost. Recomputed only when the board or phase changes
    const hlColor = (ch: string) => ch === fallingChars[0] ? HL_RED : ch === fallingChars[1] ? HL_BLUE : undefined
    const hl = (text: string) => Array.from(text).map((ch, i) => {
        const color = hlColor(ch)
        return color ? <span key={i} style={{ color, fontWeight: 'bold' }}>{ch}</span> : ch
    })
    // technical approach: fallingChars is [upper, lower] = [piece.b, piece.a], and rotating swaps only their
    // positions, not which is which, so red / blue stay with the same kana. If both kana are equal it is red.
    // hl() paints each matching kana of a word (red upper, blue lower, others plain). Colour is used only
    // inside the dictionary panel (subtitle and word list); the board tiles stay plain black
    const dictRows =showAllWords || related.length === 0 ? SORTED_DICTIONARY : related
    // technical approach: the book shows only words that contain the falling kana (both-kana words first),
    // with no cap, so every related word is listed. fallingChars is in top-to-bottom order; during a
    // chain there is no piece, so it uses the next piece. "Show all words" switches to the full list

    return (
        <div
            data-phase={g.phase}
            style={{
                position: 'fixed',
                inset: 0,
                background: BUBBLE_BG,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: 'black',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                overscrollBehavior: 'none',
            }}
        >
            <style>{`@keyframes wmBlink { 0%, 100% { background: ${FLASH_FILL} } 50% { background: #fff } }`}</style>

            <div style={{ width: outerW, height: HUD_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ whiteSpace: 'nowrap', lineHeight: 1.1 }}>
                    <div style={{ fontSize: 10 }}>SCORE</div>
                    <div data-testid="wm-score" style={{ fontSize: 16 }}>{g.score}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10 }}>NEXT</span>
                    {[...g.next].reverse().map((ch, i) => (
                        <div key={i} style={{
                            width: miniSize, height: miniSize, boxSizing: 'border-box',
                            border: `${BUBBLE_BORDER_W}px solid ${BUBBLE_BOARDER}`, background: PIECE_FILL,
                            boxShadow: `2px 2px 0 ${BUBBLE_SHADOW}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: miniSize * 0.6, lineHeight: 1,
                        }}>{ch}</div>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                        data-testid="wm-btn-dict"
                        role="button"
                        aria-label="Open word dictionary"
                        onClick={() => g.setPaused(true)}
                        style={{
                            width: BOOK_BTN, height: BOOK_BTN, boxSizing: 'border-box',
                            border: `${BUBBLE_BORDER_W}px solid ${BUBBLE_BOARDER}`, background: BUBBLE_BG,
                            boxShadow: `2px 2px 0 ${BUBBLE_SHADOW}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                        }}
                    ><BookIcon /></div>
                    {back}
                </div>
            </div>
            {/* technical approach: HUD is one flex row as wide as the board: score (label over number, so it stays narrow) left, preview middle, book button (and Back, if any) right. The book pauses the game and opens the dictionary */}

            <div
                data-testid="wm-board"
                style={{
                    position: 'relative',
                    width: boardW,
                    height: boardH,
                    border: `${BUBBLE_BORDER_W}px solid ${BUBBLE_BOARDER}`,
                    background: BOARD_FILL,
                    backgroundImage: `linear-gradient(${GRID_LINE} 1px, transparent 1px), linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
                    backgroundSize: `${cell}px ${cell}px`,
                    touchAction: 'none',
                    overscrollBehavior: 'none',
                    overflow: 'hidden',
                }}
            >
                {g.board.map((row, r) => row.map((ch, c) => ch === null ? null : (
                    <div
                        key={`b${r}-${c}`}
                        style={{
                            ...tileStyle(r, c, cell, flashSet.has(`${r},${c}`) ? FLASH_FILL : hints.fill.get(`${r},${c}`) ?? BUBBLE_BG),
                            animation: flashSet.has(`${r},${c}`) ? 'wmBlink 0.2s steps(1) infinite' : undefined,
                        }}
                    >{ch}</div>
                )))}
                {hints.ghosts.map(gh => (
                    <div
                        key={`g${gh.r}-${gh.c}`}
                        data-testid="wm-ghost"
                        style={{ ...tileStyle(gh.r, gh.c, cell, gh.color), opacity: GHOST_OPACITY, borderStyle: 'dashed', boxShadow: 'none', pointerEvents: 'none' }}
                    >{gh.char}</div>
                ))}
                {falling.map((p, i) => (
                    p.r >= 0 && <div key={`p${i}`} style={tileStyle(p.r, p.c, cell, PIECE_FILL)}>{p.ch}</div>
                ))}

                {g.popup && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <div style={{ ...panelStyle, maxWidth: '92%', padding: '4px 8px', fontSize: 11, lineHeight: 1.4, textAlign: 'center', overflowWrap: 'anywhere' }}>
                            {g.popup.words.map((w, i) => <div key={i}>{wordLine(w)}</div>)}
                            <div style={{ fontSize: 14 }}>+{g.popup.points}</div>
                            {g.popup.step > 0 && <div style={{ fontSize: 14 }}>CHAIN x{g.popup.step + 1}</div>}
                        </div>
                    </div>
                )}
                {/* technical approach: the popup is a click-through overlay centered on the board; each cleared word is a line, then points and the chain count */}
            </div>
            {/* technical approach: tiles are absolutely placed in a relative board; board cells first, then the falling piece on top with a different fill; flash cells use a CSS blink */}

            <div style={{ width: outerW, display: 'flex', gap: BTN_GAP }}>
                {BUTTONS.map(b => (
                    <div
                        key={b.id}
                        data-testid={`wm-btn-${b.id}`}
                        onPointerDown={press(b)}
                        onPointerUp={stopHold}
                        onPointerLeave={stopHold}
                        onPointerCancel={stopHold}
                        onContextMenu={e => e.preventDefault()}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            height: BTN_H,
                            boxSizing: 'border-box',
                            border: `${BUBBLE_BORDER_W}px solid ${BUBBLE_BOARDER}`,
                            background: BUBBLE_BG,
                            boxShadow: `2px 2px 0 ${BUBBLE_SHADOW}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            touchAction: 'none',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ pointerEvents: 'none' }}>
                            <Button size={14} brackets={false} shadowOff>{b.label}</Button>
                        </div>
                    </div>
                ))}
            </div>
            {/* technical approach: each control is a plain div reacting on pointer down (instant, no click delay); the Button inside only draws the label and ignores the pointer */}

            {g.paused && g.phase !== 'over' && (
                <div
                    data-testid="wm-dict-backdrop"
                    onClick={closeDictionary}
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6, background: 'rgba(0,0,0,0.25)' }}
                >
                    <div
                        data-testid="wm-dictionary"
                        onClick={e => e.stopPropagation()}
                        style={{
                            ...panelStyle,
                            cursor: 'default',
                            boxSizing: 'border-box',
                            width: Math.min(outerW + 24, size.w - 24),
                            maxHeight: size.h - 48,
                            display: 'flex',
                            flexDirection: 'column',
                            padding: 12,
                            fontSize: 14,
                        }}
                    >
                        <div style={{ textAlign: 'center', fontSize: 20, lineHeight: 1.3 }}>DICTIONARY</div>
                        <div style={{ textAlign: 'center', fontSize: DICT_NOTE_FONT, lineHeight: 1.3, marginBottom: 6 }}>
                            {dictRows === SORTED_DICTIONARY
                                ? `all ${SORTED_DICTIONARY.length} words`
                                : <>words with <span style={{ color: HL_RED, fontWeight: 'bold' }}>{fallingChars[0]}</span> <span style={{ color: HL_BLUE, fontWeight: 'bold' }}>{fallingChars[1]}</span></>}
                        </div>
                        <div ref={setDictList} style={{ overflowY: 'auto', touchAction: 'pan-y', flex: 1, minHeight: 0, fontSize: DICT_FONT, lineHeight: 1.5, overflowWrap: 'anywhere', borderTop: `1px solid ${BUBBLE_BOARDER}`, borderBottom: `1px solid ${BUBBLE_BOARDER}`, padding: '4px 0' }}>
                            {dictRows.map(e => <div key={e.kana}>{hl(e.kana)} / {e.kanji} / {e.meaning}</div>)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
                            {related.length > 0 && (
                                <div data-testid="wm-dict-toggle">
                                    <Button size={12} action={toggleAllWords}>{showAllWords ? 'Related' : 'All words'}</Button>
                                </div>
                            )}
                            <div data-testid="wm-dict-close">
                                <Button size={16} action={closeDictionary}>Close</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* technical approach: while paused the dictionary is an overlay above the board (zIndex 6): a title, the whole word list in a scrollable area (pan-y, so touch scrolls the list, not the page) and a Close button that resumes. The overlay is also a full-screen dimmed backdrop: tapping it closes the dictionary (same as Close), while the panel stops the click from reaching it, so taps and scrolling inside the panel do not close it. The backdrop also catches taps meant for the controls underneath, which would be ignored while paused anyway */}

            {g.phase === 'over' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
                    <div style={{
                        ...panelStyle,
                        pointerEvents: 'auto',
                        boxSizing: 'border-box',
                        width: Math.min(outerW + 24, size.w - 24),
                        maxHeight: size.h - 48,
                        overflowY: 'auto',
                        touchAction: 'pan-y',
                        padding: 12,
                        fontSize: 14,
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 22 }}>GAME OVER</div>
                        <div>Words: {g.words.length}</div>
                        <div>Score: {g.score}</div>
                        <div data-testid="wm-words" style={{ margin: '8px 0', fontSize: 12, lineHeight: 1.5, textAlign: 'left', overflowWrap: 'anywhere' }}>
                            {g.words.length === 0
                                ? <div style={{ textAlign: 'center' }}>No words this time</div>
                                : shown.map((w, i) => <div key={i}>{wordLine(w)}</div>)}
                        </div>
                        {g.words.length > WORDS_PREVIEW && (
                            <div style={{ marginBottom: 8 }}>
                                {expanded
                                    ? <div data-testid="wm-show-less"><Button size={12} action={() => setExpanded(false)}>Show less</Button></div>
                                    : <div data-testid="wm-show-more"><Button size={12} action={() => setExpanded(true)}>Show more</Button></div>}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                            <div data-testid="wm-retry">
                                <Button size={16} action={() => { setExpanded(false); g.restart() }}>Retry</Button>
                            </div>
                            {back}
                        </div>
                    </div>
                </div>
            )}
            {/* technical approach: an overlay holds a scrollable panel (pan-y) capped to the viewport; the list shows 5 words, and a toggle button swaps between that slice and the full list; Retry also resets the toggle */}
        </div>
    )
}
