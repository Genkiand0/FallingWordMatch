// Shared constants and types for the Word Match mini-game.

export const BOARD_COLS = 6
export const BOARD_ROWS = 12
export const MIN_WORD_LENGTH = 3 // the one place to change how short a word may be
export const MAX_WORD_LENGTH = 5 // longest dictionary word (the dictionary check enforces it)

const BASIC = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん' // あ to ん, no を
const VOICED = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'
const SEMI_VOICED = 'ぱぴぷぺぽ'
export const ALLOWED_KANA: readonly string[] = Array.from(BASIC + VOICED + SEMI_VOICED)
export const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_KANA)
// technical approach: the kana are written as three plain strings and split with
// Array.from (one code point per kana), so adding or removing a kana is a text
// edit. No small kana (ゃゅょっぁぃぅぇぉ), no ー, no を, by omission

export type Cell = string | null
export type Board = Cell[][] // board[row][col], row 0 is the top
export type DictEntry = { kana: string, kanji: string, meaning: string }
export type Lookup = ReadonlyMap<string, DictEntry> // key = the word in hiragana
// technical approach: the types live here so logic.ts (pure functions), the hook
// and the UI agree on one shape without importing each other
