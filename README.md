# Falling Word Match

A Puyo Puyo-style falling-block word puzzle for people learning Japanese. Pairs of hiragana tiles fall onto a 7 x 12 board (set in `kanaSet.ts`). When 3 to 7 tiles in a straight line, in any of 8 directions (left or right, up or down, or diagonally, so a word also counts when written backwards), spell a word from the built-in dictionary, those tiles clear, the tiles above drop, and a new word formed by the fall is a **chain** (worth more points). Game over when the spawn spot is blocked.

Standalone app (Next.js App Router, React 19, TypeScript). No login, no database, no environment variables. Extracted from the Ikko!! project.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 . On a phone on the same Wi-Fi: `npx next dev -H <your-computer-ip>` and open `http://<your-computer-ip>:3000`.

## Controls

| | PC | Phone |
| --- | --- | --- |
| Move | Left / Right arrow | ◀ ▶ buttons (hold to repeat) |
| Rotate | Up arrow | Rotate button |
| Soft drop | Down arrow | (not available) |
| Hard drop | Space | Drop button |
| Word dictionary | Book button (top right) | Book button (top right) |

The book button pauses the game and lists every word in the dictionary (hiragana / kanji / meaning). Close resumes. The piece falls one row every `FALL_MS` (1300 ms) in `useWordMatch.ts`.

## Which tiles fall

Each new piece (two tiles) is decided by one random roll:

| Chance | What falls | Setting (`spawn.ts`) |
| --- | --- | --- |
| 33% | Two neighbouring kana cut from a dictionary word (あまい gives あま or まい) | `WORD_PART_CHANCE` |
| 33% | Two completely random kana, every allowed kana equally likely (ぢ, づ, ぺ can appear here) | `RANDOM_PAIR_CHANCE` |
| 34% | Two kana picked by how often they appear in the dictionary words, softened with a square root so rare kana are not swamped | `WEIGHT_EXPONENT` (0.5) |

## Scoring

Each cleared character is 10 points. A word is worth `characters x 10 x (1 + chain step)`; the first clear is step 0 (x1), the next step in the same chain is x2, and so on. If words overlap, all are cleared but only the longest counts. Change the numbers in `src/components/WordMatch/logic.ts` (`SCORE_PER_CHAR`, `CHAIN_BONUS_PER_STEP`).

## Where things are

| File (`src/components/WordMatch/`) | What it does |
| --- | --- |
| `kanaSet.ts` | Board size, `MIN_WORD_LENGTH`, allowed kana, shared types |
| `dictionary.ts` | About 300 hiragana words with kanji and English meaning. **AI-generated; needs human review.** Also `validateDictionary()` |
| `spawn.ts` | Spawn rates: word parts, random kana, dictionary-weighted kana |
| `logic.ts` | Pure game rules (find words, gravity, chains, score, piece moves) |
| `logic.test.ts` | Tests (plain `node:assert`, no test runner) |
| `useWordMatch.ts` | Game state, timers, keyboard input |
| `WordMatchGame.tsx` | The screen |
| `theme.ts` | Colours and border size |

## Checks

```bash
npm test            # logic tests + dictionary check
npm run typecheck   # TypeScript
```

To add words, edit `dictionary.ts` and run `npm test`: it rejects words that are too short or long, use small kana (ゃゅょっ), ー or を, or are duplicated.
