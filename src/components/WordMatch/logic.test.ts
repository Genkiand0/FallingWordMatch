// DEV
// Plain script tests for logic.ts. Run: npx tsx src/components/WordMatch/logic.test.ts
import assert from 'node:assert/strict'
import { BOARD_COLS, BOARD_ROWS } from './kanaSet'
import type { Board, Lookup } from './kanaSet'
import {
    SCORE_PER_CHAR, chainMultiplier, wordPoints, createBoard, cloneBoard, applyGravity,
    findWords, pickScoringWords, resolveChain, spawnPiece, pieceCells, canPlace, movePiece,
    rotatePiece, stepDown, hardDrop, lockPiece, isSpawnBlocked, SPAWN_ROW, SPAWN_COL,
    DIRECTIONS, findNearWords,
} from './logic'
import type { Direction } from './logic'
import { pickChar, pickPair, pickWordPart, relatedWords, WORD_PART_CHANCE } from './spawn'

// small fake dictionary, not the real one
const lookup: Lookup = new Map([
    ['さかな', { kana: 'さかな', kanji: '魚', meaning: 'fish' }],
    ['たまご', { kana: 'たまご', kanji: '卵', meaning: 'egg' }],
    ['さかなやさ', { kana: 'さかなやさ', kanji: '魚屋さ', meaning: 'fake five letter word' }],
])

// put a string into the board starting at (r,c), going in any direction (default right)
const put = (b: Board, r: number, c: number, text: string, dir: Direction = 'right'): Board => {
    const { dr, dc } = DIRECTIONS.find(d => d.dir === dir)!
    Array.from(text).forEach((ch, i) => { b[r + dr * i][c + dc * i] = ch })
    return b
}
const isEmpty = (b: Board): boolean => b.every(row => row.every(cell => cell === null))

let passed = 0
const test = (name: string, fn: () => void) => {
    fn()
    passed++
    console.log(`ok  ${name}`)
}

test('horizontal word is found and cleared', () => {
    const b = put(createBoard(), 11, 1, 'さかな')
    const found = findWords(b, lookup)
    assert.equal(found.length, 1)
    assert.equal(found[0].kana, 'さかな')
    assert.equal(found[0].dir, 'right')
    assert.deepEqual(found[0].cells, [{ r: 11, c: 1 }, { r: 11, c: 2 }, { r: 11, c: 3 }])
    const res = resolveChain(b, lookup)
    assert.equal(res.steps.length, 1)
    assert.equal(res.points, 30)
    assert.ok(isEmpty(res.board))
})

test('vertical word is found', () => {
    const b = put(createBoard(), 9, 3, 'たまご', 'down')
    const found = findWords(b, lookup)
    assert.equal(found.length, 1)
    assert.equal(found[0].kana, 'たまご')
    assert.equal(found[0].dir, 'down')
    assert.deepEqual(found[0].cells, [{ r: 9, c: 3 }, { r: 10, c: 3 }, { r: 11, c: 3 }])
})

test('any direction: reversed, upward and diagonal words are found', () => {
    const cases: [Direction, number, number][] = [
        ['left', 11, 4], // さかな written right to left, starting at (11,4)
        ['up', 11, 2], // bottom to top
        ['down-right', 8, 0],
        ['down-left', 8, 5],
        ['up-right', 11, 0],
        ['up-left', 11, 5],
    ]
    for (const [dir, r, c] of cases) {
        const found = findWords(put(createBoard(), r, c, 'さかな', dir), lookup)
        assert.equal(found.length, 1, dir)
        assert.equal(found[0].kana, 'さかな', dir)
        assert.equal(found[0].dir, dir)
        const res = resolveChain(put(createBoard(), r, c, 'さかな', dir), lookup)
        assert.equal(res.points, 30, dir)
    }
})

test('any direction: a palindrome is reported once, not once per end', () => {
    const pal: Lookup = new Map([['たけた', { kana: 'たけた', kanji: '', meaning: '' }]])
    assert.equal(findWords(put(createBoard(), 11, 0, 'たけた'), pal).length, 1)
})

test('near words: a line one kana short is reported with its missing cell and kana', () => {
    const near = findNearWords(put(createBoard(), 11, 0, 'さか'), lookup)
    assert.equal(near.length, 1)
    assert.equal(near[0].kana, 'さかな')
    assert.deepEqual(near[0].missing, { r: 11, c: 2 })
    assert.equal(near[0].char, 'な')
    assert.deepEqual(near[0].cells, [{ r: 11, c: 0 }, { r: 11, c: 1 }])
})

test('near words: the gap may be in the middle, and the word may run backwards', () => {
    const mid = createBoard()
    mid[11][0] = 'さ'; mid[11][2] = 'な'
    const m = findNearWords(mid, lookup)
    assert.equal(m.length, 1)
    assert.deepEqual([m[0].missing, m[0].char], [{ r: 11, c: 1 }, 'か'])
    const back = findNearWords(put(createBoard(), 11, 3, 'かな', 'left'), lookup) // か col 3, な col 2
    assert.equal(back.length, 1)
    assert.deepEqual([back[0].dir, back[0].missing, back[0].char], ['left', { r: 11, c: 4 }, 'さ'])
})

test('near words: a gap in mid air is not a hint, a finished word is not near', () => {
    assert.equal(findNearWords(put(createBoard(), 10, 0, 'さか'), lookup).length, 0) // nothing under (10,2)
    assert.equal(findNearWords(put(createBoard(), 11, 0, 'さかな'), lookup).length, 0)
})

test('any direction: letters that are not in a straight line do not make a word', () => {
    const b = put(createBoard(), 11, 0, 'さか')
    b[10][2] = 'な' // knight-move away from か, not in line
    assert.equal(findWords(b, lookup).length, 0)
})

test('words separated by a gap are not joined', () => {
    const b = put(put(createBoard(), 11, 0, 'さか'), 11, 3, 'な')
    assert.equal(findWords(b, lookup).length, 0)
})

test('overlap: longer word containing a shorter one, both cleared, only longest scores', () => {
    const b = put(createBoard(), 11, 0, 'さかなやさ')
    const found = findWords(b, lookup)
    assert.deepEqual(found.map(w => w.kana), ['さかなやさ', 'さかな']) // start index, then length descending
    const picked = pickScoringWords(found)
    assert.deepEqual(picked.map(w => w.kana), ['さかなやさ'])
    const res = resolveChain(b, lookup)
    assert.equal(res.steps.length, 1)
    assert.equal(res.steps[0].found.length, 2)
    assert.equal(res.steps[0].scored.length, 1)
    assert.equal(res.steps[0].cleared.length, 5) // union, no duplicates
    assert.equal(res.steps[0].points, 50)
    assert.equal(res.points, 50)
    assert.ok(isEmpty(res.board))
})

test('overlap across directions: shared cell means only one scores', () => {
    // さかな across row 11 (cols 0-2) and たまご down column 2 sharing the cell (11,2)? 'な' != 'ご'
    // so build たまご ending at the shared cell using a fake word that ends with the same char
    const l2: Lookup = new Map([
        ['さかな', { kana: 'さかな', kanji: '', meaning: '' }],
        ['たまな', { kana: 'たまな', kanji: '', meaning: '' }],
    ])
    const b = put(put(createBoard(), 11, 0, 'さかな'), 9, 2, 'たまな', 'down')
    const found = findWords(b, l2)
    assert.equal(found.length, 2)
    assert.equal(pickScoringWords(found).length, 1)
    assert.equal(pickScoringWords(found)[0].kana, 'たまな') // tie on length: scan order, topmost start cell first
    assert.equal(resolveChain(b, l2).steps[0].cleared.length, 5)
})

test('chain: second word forms after gravity, step 1 pays double', () => {
    const b = createBoard()
    put(b, 11, 0, 'さかな') // clears first
    put(b, 10, 0, 'たま') // falls to row 11, cols 0-1
    b[9][2] = 'ご' // floating, falls to row 11, col 2
    assert.equal(findWords(b, lookup).length, 1)
    const res = resolveChain(b, lookup)
    assert.equal(res.steps.length, 2)
    assert.equal(res.steps[0].step, 0)
    assert.equal(res.steps[0].points, 30)
    assert.equal(res.steps[1].step, 1)
    assert.equal(res.steps[1].scored[0].kana, 'たまご')
    assert.equal(res.steps[1].points, 60)
    assert.equal(res.points, 90)
    assert.ok(isEmpty(res.board))
    assert.equal(findWords(res.board, lookup).length, 0)
    // step boards: before has the word, cleared has nulls without gravity, after is settled
    assert.equal(res.steps[0].boardBefore[11][0], 'さ')
    assert.equal(res.steps[0].boardCleared[11][0], null)
    assert.equal(res.steps[0].boardCleared[10][0], 'た')
    assert.equal(res.steps[0].boardAfter[11][0], 'た')
})

test('resolveChain does not mutate its input', () => {
    const b = put(createBoard(), 11, 0, 'さかな')
    const copy = cloneBoard(b)
    resolveChain(b, lookup)
    assert.deepEqual(b, copy)
})

test('gravity: floating chars fall, order kept, input not mutated', () => {
    const b = createBoard()
    b[2][1] = 'あ'
    b[5][1] = 'い'
    b[7][1] = 'う'
    b[0][4] = 'え'
    const copy = cloneBoard(b)
    const g = applyGravity(b)
    assert.deepEqual(b, copy)
    assert.equal(g.length, BOARD_ROWS)
    assert.equal(g[0].length, BOARD_COLS)
    assert.equal(g[9][1], 'あ')
    assert.equal(g[10][1], 'い')
    assert.equal(g[11][1], 'う')
    assert.equal(g[11][4], 'え')
    assert.equal(g[2][1], null)
    assert.equal(g[0][4], null)
})

test('createBoard is BOARD_ROWS x BOARD_COLS of null; cloneBoard is independent', () => {
    const b = createBoard()
    assert.equal(b.length, BOARD_ROWS)
    assert.ok(b.every(row => row.length === BOARD_COLS))
    assert.ok(isEmpty(b))
    const c = cloneBoard(b)
    c[0][0] = 'あ'
    assert.equal(b[0][0], null)
})

test('piece: spawn position and cells', () => {
    const p = spawnPiece(['あ', 'い'])
    assert.equal(p.r, SPAWN_ROW)
    assert.equal(p.c, SPAWN_COL)
    assert.equal(p.rot, 0)
    assert.deepEqual(pieceCells(p), [
        { r: 1, c: 2, ch: 'あ' },
        { r: 0, c: 2, ch: 'い' },
    ])
    assert.ok(canPlace(createBoard(), p))
})

test('piece: movePiece is blocked at the wall and by stacks', () => {
    const b = createBoard()
    let p = spawnPiece(['あ', 'い'])
    for (let i = 0; i < 10; i++) p = movePiece(b, p, -1)
    assert.equal(p.c, 0)
    assert.equal(movePiece(b, p, -1), p) // unchanged, same object
    for (let i = 0; i < 10; i++) p = movePiece(b, p, 1)
    assert.equal(p.c, BOARD_COLS - 1)
    const blocked = createBoard()
    blocked[1][3] = 'う'
    const q = spawnPiece(['あ', 'い']) // pivot (1,2)
    assert.equal(movePiece(blocked, q, 1), q)
})

test('piece: rotatePiece cycles through four orientations', () => {
    const b = createBoard()
    const p0 = spawnPiece(['あ', 'い'])
    const p1 = rotatePiece(b, p0)
    const p2 = rotatePiece(b, p1)
    const p3 = rotatePiece(b, p2)
    const p4 = rotatePiece(b, p3)
    assert.deepEqual([p1.rot, p2.rot, p3.rot, p4.rot], [1, 2, 3, 0])
    assert.deepEqual(pieceCells(p1)[1], { r: 1, c: 3, ch: 'い' }) // right
    assert.deepEqual(pieceCells(p2)[1], { r: 2, c: 2, ch: 'い' }) // below
    assert.deepEqual(pieceCells(p3)[1], { r: 1, c: 1, ch: 'い' }) // left
    assert.deepEqual(p4, p0)
})

test('piece: rotatePiece kicks off walls, floor and stacks', () => {
    const b = createBoard()
    // right wall: rotating to the right would leave the board, so pivot shifts left
    const atWall = { ...spawnPiece(['あ', 'い']), c: BOARD_COLS - 1 }
    const r1 = rotatePiece(b, atWall)
    assert.equal(r1.rot, 1)
    assert.equal(r1.c, BOARD_COLS - 2)
    // left wall: rotating to the left kicks right
    const left = { ...spawnPiece(['あ', 'い']), c: 0, rot: 2 as const }
    const r3 = rotatePiece(b, left)
    assert.equal(r3.rot, 3)
    assert.equal(r3.c, 1)
    // floor: rotating to "below" on the bottom row kicks up
    const onFloor = { ...spawnPiece(['あ', 'い']), r: BOARD_ROWS - 1, rot: 1 as const }
    const r2 = rotatePiece(b, onFloor)
    assert.equal(r2.rot, 2)
    assert.equal(r2.r, BOARD_ROWS - 2)
    // boxed in: nothing fits, piece is returned unchanged
    const stuck = { ...spawnPiece(['あ', 'い']), r: 0, c: 2, rot: 0 as const }
    // rows 0-2 full except the pivot cell, so every rotation and kick is blocked
    const full = createBoard()
    for (let r = 0; r < 3; r++) for (let c = 0; c < BOARD_COLS; c++) if (!(r === 0 && c === 2)) full[r][c] = 'う'
    assert.equal(rotatePiece(full, stuck), stuck)
})

test('piece: stepDown, hardDrop lands on the floor and on a stack', () => {
    const b = createBoard()
    const p = spawnPiece(['あ', 'い'])
    const s = stepDown(b, p)
    assert.ok(s !== null && s.r === p.r + 1)
    const d = hardDrop(b, p)
    assert.equal(d.r, BOARD_ROWS - 1) // pivot on the floor, satellite above it
    assert.equal(stepDown(b, d), null)
    const flat = hardDrop(b, { ...p, rot: 2 }) // satellite below pivot
    assert.equal(flat.r, BOARD_ROWS - 2)
    const stack = createBoard()
    stack[11][2] = 'う'
    stack[10][2] = 'え'
    assert.equal(hardDrop(stack, p).r, 9)
})

test('piece: lockPiece places both chars and each half falls on its own', () => {
    const b = createBoard()
    b[11][3] = 'う' // stack under the satellite column only
    const dropped = hardDrop(b, { ...spawnPiece(['あ', 'い']), rot: 1 }) // pivot col 2, satellite col 3
    assert.equal(dropped.r, 10)
    const locked = lockPiece(b, dropped)
    assert.equal(locked[11][2], 'あ') // pivot fell to the floor
    assert.equal(locked[10][3], 'い') // satellite rests on the stack
    assert.equal(locked[11][3], 'う')
    assert.equal(b[10][3], null) // input untouched
})

test('piece: isSpawnBlocked when a spawn cell is occupied', () => {
    const p = spawnPiece(['あ', 'い'])
    assert.equal(isSpawnBlocked(createBoard(), p), false)
    const b1 = createBoard()
    b1[SPAWN_ROW][SPAWN_COL] = 'う'
    assert.equal(isSpawnBlocked(b1, p), true)
    const b2 = createBoard()
    b2[0][SPAWN_COL] = 'う' // satellite cell
    assert.equal(isSpawnBlocked(b2, p), true)
})

test('scoring: wordPoints and chainMultiplier', () => {
    assert.equal(SCORE_PER_CHAR, 10)
    assert.equal(chainMultiplier(0), 1)
    assert.equal(chainMultiplier(1), 2)
    assert.equal(chainMultiplier(2), 3)
    assert.equal(wordPoints(3, 0), 30)
    assert.equal(wordPoints(3, 1), 60)
    assert.equal(wordPoints(5, 2), 150)
})

const fakeEntries = [...lookup.values()]
const seq = (...n: number[]) => { let i = 0; return () => n[i++ % n.length] }

test('spawn: a word part is two neighbouring kana, satellite (top) reads first', () => {
    // word index 0 = さかな; start 0 -> さか, start 1 -> かな. Returned [pivot, satellite]
    assert.deepEqual(pickWordPart(seq(0, 0), fakeEntries), ['か', 'さ'])
    assert.deepEqual(pickWordPart(seq(0, 0.99), fakeEntries), ['な', 'か'])
})

test('spawn: pickPair uses a word part below WORD_PART_CHANCE, random kana above it', () => {
    assert.deepEqual(pickPair(seq(0.1, 0, 0)), pickWordPart(seq(0, 0)))
    assert.deepEqual(pickPair(seq(0.329, 0, 0)), pickWordPart(seq(0, 0)))
    assert.deepEqual(pickPair(seq(0.331, 0, 0)), [pickChar(seq(0)), pickChar(seq(0))])
    assert.equal(WORD_PART_CHANCE, 0.33)
})
// technical approach: the 33% is tested at its exact edge with a fixed random sequence. A statistical
// count would not work: random pairs also match real word parts by chance (about half the time here)

test('relatedWords: words with both kana first, then one, none unrelated', () => {
    const r = relatedWords(['さ', 'か'], fakeEntries).map(e => e.kana)
    assert.deepEqual(r, ['さかな', 'さかなやさ'])
    assert.deepEqual(relatedWords(['た', 'ご'], fakeEntries).map(e => e.kana), ['たまご'])
    assert.deepEqual(relatedWords(['ぬ', 'ね'], fakeEntries), [])
})

const main = async () => {
    // optional: only runs when dictionary.ts exists
    const path = './dictionary'
    const mod = await import(path).catch(() => null) as {
        validateDictionary?: () => unknown[]
        DICTIONARY?: { size?: number, length?: number }
    } | null
    if (mod && typeof mod.validateDictionary === 'function') {
        const problems = mod.validateDictionary()
        const count = mod.DICTIONARY?.size ?? mod.DICTIONARY?.length ?? 'unknown'
        console.log(`dictionary entries: ${count}`)
        if (problems.length > 0) console.log('dictionary problems:', problems)
        assert.deepEqual(problems, [])
        passed++
        console.log('ok  dictionary validates')
    } else {
        console.log('dictionary check skipped (file not present)')
    }
    console.log(`\n${passed} tests passed`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
