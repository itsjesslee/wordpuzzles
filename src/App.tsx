import React, { useEffect, useMemo, useState } from "react";

const WORD_LIST_URL =
  "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/c46f451920d5cf6326d550fb2d6abb1642717852/wordle-answers-alphabetical.txt";

const BASE_URL = (import.meta.env.BASE_URL || "/").trim();
function buildAssetUrl(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
  // Ensure absolute URL for the browser constructor
  const absoluteBase = base.startsWith("http")
    ? base
    : window.location.origin + base;
  return absoluteBase + path.replace(/^\/+/, "");
}

const BEE_DICT_URL = buildAssetUrl("bee-dict.txt");

const MIN_MATCHES = 3;
const MAX_MATCHES = 15;
const MAX_PATTERN_ATTEMPTS = 5000;

const BEE_MAX_WORDS = 100;

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

type Score = "correct" | "present" | "absent";

// ---------- Utility helpers ----------

function matchesPattern(word: string, patternArr: string[]): boolean {
  if (!patternArr) return false;
  if (word.length !== patternArr.length) return false;

  for (let i = 0; i < patternArr.length; i++) {
    const ch = patternArr[i];
    if (ch !== "_" && word[i] !== ch) return false;
  }

  return true;
}

function generateTwoLetterPattern(words: string[]) {
  if (!words || words.length === 0) {
    return { patternArr: [] as string[], matches: [] as string[] };
  }

  const wordLen = words[0].length;
  let fallbackPattern: string[] | null = null;
  let fallbackMatches: string[] | null = null;

  for (let attempt = 0; attempt < MAX_PATTERN_ATTEMPTS; attempt++) {
    const base = words[Math.floor(Math.random() * words.length)];

    const first = Math.floor(Math.random() * wordLen);

    // build list of valid non-consecutive seconds
    const candidates: number[] = [];
    for (let i = 0; i < wordLen; i++) {
      if (i === first) continue;
      if (Math.abs(i - first) <= 1) continue; // skip consecutive positions
      candidates.push(i);
    }

    if (candidates.length === 0) {
      continue;
    }

    const second = candidates[Math.floor(Math.random() * candidates.length)];

    const patternArr = Array<string>(wordLen).fill("_");
    patternArr[first] = base[first];
    patternArr[second] = base[second];

    const matches: string[] = [];
    for (const w of words) {
      if (matchesPattern(w, patternArr)) {
        matches.push(w);
      }
    }

    const count = matches.length;

    if (count >= MIN_MATCHES && count <= MAX_MATCHES) {
      return { patternArr, matches };
    }

    // Track a fallback closest to target
    if (count >= 2) {
      if (!fallbackMatches) {
        fallbackPattern = patternArr;
        fallbackMatches = matches;
      } else {
        const target = (MIN_MATCHES + MAX_MATCHES) / 2;
        const currentDiff = Math.abs(count - target);
        const bestDiff = Math.abs(fallbackMatches.length - target);
        if (currentDiff < bestDiff) {
          fallbackPattern = patternArr;
          fallbackMatches = matches;
        }
      }
    }
  }

  if (fallbackPattern && fallbackMatches) {
    return { patternArr: fallbackPattern, matches: fallbackMatches };
  }

  // Last resort: derive from first word with two far-apart letters
  const base = words[0];
  const patternArr = Array<string>(wordLen).fill("_");
  patternArr[0] = base[0];
  if (wordLen > 2) {
    patternArr[wordLen - 1] = base[wordLen - 1];
  }
  const matches = words.filter((w) => matchesPattern(w, patternArr));

  return { patternArr, matches };
}

// Wordle-style scoring
function scoreWordleGuess(guess: string, answer: string): Score[] {
  const len = answer.length;
  const result: Score[] = Array(len).fill("absent");
  const answerArr = answer.split("");
  const guessArr = guess.split("");

  const remainingCounts: Record<string, number> = {};

  // First pass: mark exact matches and count leftovers in the answer
  for (let i = 0; i < len; i++) {
    if (guessArr[i] === answerArr[i]) {
      result[i] = "correct";
    } else {
      const ch = answerArr[i];
      remainingCounts[ch] = (remainingCounts[ch] || 0) + 1;
    }
  }

  // Second pass: mark present vs absent
  for (let i = 0; i < len; i++) {
    if (result[i] === "correct") continue;
    const ch = guessArr[i];
    if (remainingCounts[ch] > 0) {
      result[i] = "present";
      remainingCounts[ch] -= 1;
    }
  }

  return result;
}

function computeStreakleResults(
  guesses: string[],
  targets: string[]
): Score[][][] {
  return targets.map((target) =>
    guesses.map((guess) => scoreWordleGuess(guess, target))
  );
}

function uniqueLetters(word: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const ch of word) {
    if (!seen.has(ch)) {
      seen.add(ch);
      order.push(ch);
    }
  }
  return order;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function extractDictionaryWords(text: string): string[] {
  const matches = text.match(/[A-Za-z]{4,}/g) || [];
  const words = matches
    .map((w) => w.toUpperCase())
    .filter((w) => w.length >= 4);
  return Array.from(new Set(words));
}

function isBeeWord(word: string, letters: Set<string>, center: string) {
  if (word.length < 4) return false;
  if (!word.includes(center)) return false;
  for (const ch of word) {
    if (!letters.has(ch)) return false;
  }
  return true;
}

function isPangram(word: string, letters: Set<string>) {
  for (const l of letters) {
    if (!word.includes(l)) return false;
  }
  return true;
}

function buildBeePuzzle(dictionary: string[]) {
  const pangramCandidates = dictionary.filter(
    (w) => uniqueLetters(w).length === 7 && w.length >= 7
  );

  let best:
    | {
        letters: string[];
        center: string;
        valid: string[];
        pangrams: string[];
      }
    | null = null;

  for (let attempt = 0; attempt < 600; attempt++) {
    const base =
      pangramCandidates[Math.floor(Math.random() * pangramCandidates.length)];
    if (!base) break;
    const letters = uniqueLetters(base).slice(0, 7);
    const shuffled = shuffleArray(letters);
    const center = shuffled[Math.floor(Math.random() * shuffled.length)];
    const letterSet = new Set(shuffled);

    const valid = dictionary.filter((w) => isBeeWord(w, letterSet, center));
    if (valid.length > BEE_MAX_WORDS) {
      continue; // skip overly dense hives
    }
    const pangrams = valid.filter((w) => isPangram(w, letterSet));

    const current = { letters: shuffled, center, valid, pangrams };
    if (!best || current.valid.length > best.valid.length) {
      best = current;
    }

    if (valid.length >= 12 && pangrams.length > 0) {
      return current;
    }
  }

  return best;
}

// Simple internal tests for helpers (runs once on module load)
(function runInternalTests() {
  // scoreWordleGuess tests
  const same = scoreWordleGuess("APPLE", "APPLE");
  console.assert(
    JSON.stringify(same) ===
      JSON.stringify(["correct", "correct", "correct", "correct", "correct"]),
    "scoreWordleGuess: exact match failed"
  );

  const mixed = scoreWordleGuess("ALERT", "LATER");
  console.assert(
    mixed[0] === "present" && mixed[1] === "present" && mixed[2] === "present",
    "scoreWordleGuess: present letters failed"
  );

  // matchesPattern tests
  console.assert(
    matchesPattern("APPLE", ["A", "_", "P", "L", "E"]),
    "matchesPattern: basic match failed"
  );
  console.assert(
    !matchesPattern("APPLE", ["B", "_", "P", "L", "E"]),
    "matchesPattern: mismatch not detected"
  );

  // generateTwoLetterPattern basic sanity test
  const demo = ["APPLE", "AMPLE", "AMPLE", "AXIOM"];
  const generated = generateTwoLetterPattern(demo);
  console.assert(
    generated.patternArr.length === 5,
    "generateTwoLetterPattern: pattern length incorrect"
  );
})();

// ---------- React App ----------

type GameMode = "home" | "pattern" | "wordle" | "quordle" | "streakle" | "bee";

export default function App() {
  const [timedMode, setTimedMode] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);

  const [words, setWords] = useState<string[]>([]);
  const [wordSet, setWordSet] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Global game mode
  const [gameMode, setGameMode] = useState<GameMode>("home");

  // Pattern hunt state
  const [pattern, setPattern] = useState<string[] | null>(null);
  const [solutions, setSolutions] = useState<string[]>([]);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [patternGuess, setPatternGuess] = useState("");
  const [patternMessage, setPatternMessage] = useState("");
  const [revealSolutions, setRevealSolutions] = useState(false);
  const sortedSolutions = useMemo(() => [...solutions].sort(), [solutions]);

  // Wordle state
  const [wordleAnswer, setWordleAnswer] = useState<string | null>(null);
  const [wordleGuesses, setWordleGuesses] = useState<string[]>([]);
  const [wordleResults, setWordleResults] = useState<Score[][]>([]);
  const [wordleGuess, setWordleGuess] = useState("");
  const [wordleMessage, setWordleMessage] = useState("");
  const [wordleDone, setWordleDone] = useState(false);
  const [wordleReveal, setWordleReveal] = useState(false);

  // Quordle state (4 boards, shared guesses)
  const [quordleAnswers, setQuordleAnswers] = useState<string[] | null>(null);
  const [quordleGuesses, setQuordleGuesses] = useState<string[]>([]);
  const [quordleResults, setQuordleResults] = useState<Score[][][]>([]);
  const [quordleGuess, setQuordleGuess] = useState("");
  const [quordleMessage, setQuordleMessage] = useState("");
  const [quordleDone, setQuordleDone] = useState(false);
  const [quordleWins, setQuordleWins] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [quordleReveal, setQuordleReveal] = useState(false);

  // Streakle (3 sequential targets, 8 total guesses, locked greens)
  const [streakleTargets, setStreakleTargets] = useState<string[] | null>(null);
  const [streakleCurrentIndex, setStreakleCurrentIndex] = useState(0);
  const [streakleGuesses, setStreakleGuesses] = useState<string[]>([]);
  const [streakleResults, setStreakleResults] = useState<Score[][][]>([]);
  const [streakleGuess, setStreakleGuess] = useState("");
  const [streakleMessage, setStreakleMessage] = useState("");
  const [streakleDone, setStreakleDone] = useState(false);
  const [streakleSolved, setStreakleSolved] = useState<boolean[]>([
    false,
    false,
    false,
  ]);
  const [streakleStartWord, setStreakleStartWord] = useState<string | null>(
    null
  );
  const [streakleReveal, setStreakleReveal] = useState(false);

  // Spelling Bee
  const [beeDict, setBeeDict] = useState<string[]>([]);
  const [beeDictLoading, setBeeDictLoading] = useState(false);
  const [beeDictError, setBeeDictError] = useState("");
  const [beeLetters, setBeeLetters] = useState<string[] | null>(null);
  const [beeCenterLetter, setBeeCenterLetter] = useState<string | null>(null);
  const [beeValidWords, setBeeValidWords] = useState<string[]>([]);
  const [beePangrams, setBeePangrams] = useState<string[]>([]);
  const [beeFoundWords, setBeeFoundWords] = useState<string[]>([]);
  const [beeGuess, setBeeGuess] = useState("");
  const [beeMessage, setBeeMessage] = useState("");
  const [beeRevealAnswers, setBeeRevealAnswers] = useState(false);

  const wordleLetterStates = useMemo(() => {
    const states: Record<string, Score> = {};
    wordleGuesses.forEach((guess, rowIndex) => {
      const resultRow = wordleResults[rowIndex] || [];
      for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const status = resultRow[i];
        if (!letter || !status) continue;
        const prev = states[letter];
        if (status === "correct") {
          states[letter] = "correct";
        } else if (status === "present") {
          if (prev !== "correct") {
            states[letter] = "present";
          }
        } else if (status === "absent") {
          if (!prev) {
            states[letter] = "absent";
          }
        }
      }
    });
    return states;
  }, [wordleGuesses, wordleResults]);

  const quordleLetterStates = useMemo(() => {
    const states: Record<string, (Score | undefined)[]> = {};
    quordleGuesses.forEach((guess, guessIndex) => {
      for (let boardIndex = 0; boardIndex < 4; boardIndex++) {
        const boardRows = quordleResults[boardIndex] || [];
        const resultRow = boardRows[guessIndex] || [];
        for (let i = 0; i < guess.length; i++) {
          const letter = guess[i];
          const status = resultRow[i];
          if (!letter || !status) continue;
          if (!states[letter]) {
            states[letter] = [undefined, undefined, undefined, undefined];
          }
          const prev = states[letter][boardIndex];
          if (status === "correct") {
            states[letter][boardIndex] = "correct";
          } else if (status === "present") {
            if (prev !== "correct") {
              states[letter][boardIndex] = "present";
            }
          } else if (status === "absent") {
            if (!prev) {
              states[letter][boardIndex] = "absent";
            }
          }
        }
      }
    });
    return states;
  }, [quordleGuesses, quordleResults]);

  const streakleLetterStates = useMemo(() => {
    if (!streakleTargets || streakleTargets.length === 0) return {};
    const targetIndex = streakleCurrentIndex;
    const boardResults = streakleResults[targetIndex] || [];
    const states: Record<string, Score> = {};

    streakleGuesses.forEach((guess, rowIndex) => {
      const resultRow = boardResults[rowIndex] || [];
      for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const status = resultRow[i];
        if (!letter || !status) continue;
        const prev = states[letter];
        if (status === "correct") {
          states[letter] = "correct";
        } else if (status === "present") {
          if (prev !== "correct") {
            states[letter] = "present";
          }
        } else if (status === "absent") {
          if (!prev) {
            states[letter] = "absent";
          }
        }
      }
    });

    return states;
  }, [streakleCurrentIndex, streakleGuesses, streakleResults, streakleTargets]);

  const streakleLockedPattern = useMemo(() => {
    if (!streakleTargets || streakleTargets.length === 0) return [];
    const boardResults = streakleResults[streakleCurrentIndex] || [];
    const pattern = Array<string>(5).fill("_");

    for (let row = 0; row < boardResults.length; row++) {
      const resultRow = boardResults[row] || [];
      for (let col = 0; col < resultRow.length; col++) {
        if (resultRow[col] === "correct" && streakleGuesses[row]) {
          pattern[col] = streakleGuesses[row][col];
        }
      }
    }

    return pattern;
  }, [streakleCurrentIndex, streakleGuesses, streakleResults, streakleTargets]);

  const beeOuterLetters = useMemo(() => {
    if (!beeLetters || !beeCenterLetter) return [];
    return beeLetters.filter((l) => l !== beeCenterLetter);
  }, [beeCenterLetter, beeLetters]);

  const beeLetterSet = useMemo(() => new Set(beeLetters || []), [beeLetters]);

  const beeValidSet = useMemo(() => new Set(beeValidWords), [beeValidWords]);
  const beePangramSet = useMemo(
    () => new Set(beePangrams),
    [beePangrams]
  );

  const sortedBeeFound = useMemo(
    () => [...beeFoundWords].sort(),
    [beeFoundWords]
  );

  function activateMode(nextMode: GameMode) {
    if (nextMode === "home") {
      setGameMode("home");
      stopTimer();
      setTimerElapsed(0);
      return;
    }
    setGameMode(nextMode);
    if (loading || error) return;
    if (nextMode === "pattern") startNewPatternGame();
    if (nextMode === "wordle") startNewWordleGame();
    if (nextMode === "quordle") startNewQuordleGame();
    if (nextMode === "streakle") startNewStreakleGame();
    if (nextMode === "bee" && beeDict.length > 0) startNewBeeGame();
  }

  // Timer helpers
  function startTimer() {
    setTimerStart(Date.now());
    setTimerElapsed(0);
  }

  function stopTimer() {
    setTimerStart(null);
  }

  function resetTimerForRound() {
    if (timedMode) {
      startTimer();
    } else {
      stopTimer();
      setTimerElapsed(0);
    }
  }

  useEffect(() => {
    if (!timedMode || timerStart === null) return;
    const id = window.setInterval(() => {
      setTimerElapsed(Date.now() - timerStart);
    }, 200);
    return () => window.clearInterval(id);
  }, [timedMode, timerStart]);

  function formatTime(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  // Fetch word list on mount
  useEffect(() => {
    async function loadWords() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(WORD_LIST_URL);
        if (!res.ok) {
          throw new Error("Network error: " + res.status);
        }
        const text = await res.text();
        const list = text
          .split(/\r?\n/)
          .map((w) => w.trim())
          .filter(Boolean)
          .map((w) => w.toUpperCase());

        setWords(list);
        setWordSet(new Set(list));
      } catch (err: unknown) {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load word list.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadWords();
  }, []);

  // Start an initial game once words are loaded
  useEffect(() => {
    if (!loading && !error && words.length > 0 && gameMode !== "home") {
      if (gameMode === "pattern") {
        startNewPatternGame();
      } else if (gameMode === "wordle") {
        startNewWordleGame();
      } else if (gameMode === "quordle") {
        startNewQuordleGame();
      } else if (gameMode === "streakle") {
        startNewStreakleGame();
      } else if (gameMode === "bee") {
        if (beeDict.length > 0) {
          startNewBeeGame();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, words.length, beeDict.length]);

  // Lazy-load Spelling Bee dictionary when needed
  useEffect(() => {
    async function loadBeeDict() {
      try {
        setBeeDictLoading(true);
        setBeeDictError("");
        const res = await fetch(BEE_DICT_URL);
        if (!res.ok) {
          throw new Error("Dictionary download failed: " + res.status);
        }
        const text = await res.text();
        const words = extractDictionaryWords(text);
        setBeeDict(words);
      } catch (err: unknown) {
        console.error(err);
        if (err instanceof Error) {
          setBeeDictError(err.message);
        } else {
          setBeeDictError("Failed to load dictionary.");
        }
      } finally {
        setBeeDictLoading(false);
      }
    }

    if (gameMode === "bee" && beeDict.length === 0 && !beeDictLoading) {
      loadBeeDict();
    }
  }, [beeDict.length, beeDictLoading, gameMode]);

  function startNewPatternGame() {
    if (!words || words.length === 0) return;

    const { patternArr, matches } = generateTwoLetterPattern(words);

    setPattern(patternArr);
    setSolutions(matches);
    setFoundWords([]);
    setRevealSolutions(false);
    setPatternGuess("");
    setPatternMessage("");
    resetTimerForRound();
  }

  function startNewWordleGame() {
    if (!words || words.length === 0) return;
    const answer = words[Math.floor(Math.random() * words.length)];
    setWordleAnswer(answer);
    setWordleGuesses([]);
    setWordleResults([]);
    setWordleGuess("");
    setWordleMessage("");
    setWordleDone(false);
    setWordleReveal(false);
    resetTimerForRound();
  }

  function startNewQuordleGame() {
    if (!words || words.length === 0) return;
    const picked: string[] = [];
    while (picked.length < 4) {
      const candidate = words[Math.floor(Math.random() * words.length)];
      if (!picked.includes(candidate)) {
        picked.push(candidate);
      }
    }
    setQuordleAnswers(picked);
    setQuordleGuesses([]);
    setQuordleResults(Array.from({ length: 4 }, () => []));
    setQuordleGuess("");
    setQuordleMessage("");
    setQuordleDone(false);
    setQuordleWins([false, false, false, false]);
    setQuordleReveal(false);
    resetTimerForRound();
  }

  function startNewStreakleGame() {
    if (!words || words.length === 0) return;

    const startWord = words[Math.floor(Math.random() * words.length)];
    const targets: string[] = [];

    while (targets.length < 3) {
      const candidate = words[Math.floor(Math.random() * words.length)];
      if (candidate !== startWord && !targets.includes(candidate)) {
        targets.push(candidate);
      }
    }

    const initialGuesses = [startWord];
    const initialResults = computeStreakleResults(initialGuesses, targets);
    const solved = targets.map((t) => t === startWord);
    const nextIndex = solved.findIndex((v) => !v);
    const activeIndex = nextIndex === -1 ? 0 : nextIndex;
    const remaining = 8 - initialGuesses.length;

    setStreakleTargets(targets);
    setStreakleStartWord(startWord);
    setStreakleGuesses(initialGuesses);
    setStreakleResults(initialResults);
    setStreakleSolved(solved);
    setStreakleCurrentIndex(activeIndex);
    setStreakleGuess("");
    setStreakleDone(solved.every(Boolean) || remaining <= 0);
    setStreakleReveal(false);
    setStreakleMessage(
      "Starting word auto-played: " +
        startWord +
        ". " +
        (remaining === 1 ? "1 guess left." : remaining + " guesses left.")
    );
    resetTimerForRound();
  }

  function startNewBeeGame() {
    if (beeDictLoading) {
      setBeeMessage("Loading dictionary...");
      return;
    }
    if (beeDictError) {
      setBeeMessage("Dictionary error: " + beeDictError);
      return;
    }
    if (beeDict.length === 0) {
      setBeeMessage("Dictionary not ready yet.");
      return;
    }

    const puzzle = buildBeePuzzle(beeDict);
    if (!puzzle) {
      setBeeMessage("Could not build a Spelling Bee puzzle. Try again.");
      return;
    }

    const outerShuffled = shuffleArray(
      puzzle.letters.filter((l) => l !== puzzle.center)
    );

    setBeeLetters([puzzle.center, ...outerShuffled]);
    setBeeCenterLetter(puzzle.center);
    setBeeValidWords(puzzle.valid);
    setBeePangrams(puzzle.pangrams);
    setBeeFoundWords([]);
    setBeeGuess("");
    setBeeRevealAnswers(false);
    setBeeMessage(
      "Found 0/" +
        puzzle.valid.length +
        " words. " +
        (puzzle.pangrams.length > 0
          ? puzzle.pangrams.length +
            " pangram" +
            (puzzle.pangrams.length === 1 ? "" : "s") +
            " hidden."
          : "Find a pangram using all 7 letters.")
    );
    resetTimerForRound();
  }

  function handlePatternSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern) return;

    const raw = patternGuess.trim().toUpperCase();

    if (raw.length !== pattern.length) {
      setPatternMessage(
        "Your guess must be " + pattern.length + " letters long."
      );
      return;
    }

    if (!matchesPattern(raw, pattern)) {
      setPatternMessage("That word does not match the pattern.");
      return;
    }

    if (!wordSet || !wordSet.has(raw)) {
      setPatternMessage("That word is not in the allowed word list.");
      return;
    }

    if (foundWords.includes(raw)) {
      setPatternMessage("You already found that word.");
      return;
    }

    const updated = [...foundWords, raw].sort();
    setFoundWords(updated);

    const remaining = solutions.length - updated.length;
    if (remaining === 0) {
      setPatternMessage("Perfect! You found all the words!");
      stopTimer();
    } else if (remaining === 1) {
      setPatternMessage("Nice! Just 1 word left.");
    } else {
      setPatternMessage("Nice! " + remaining + " words still hidden.");
    }

    setPatternGuess("");
  }

  function handleWordleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wordleAnswer) return;
    if (wordleDone) return;

    const raw = wordleGuess.trim().toUpperCase();

    if (raw.length !== 5) {
      setWordleMessage("Your guess must be 5 letters.");
      return;
    }

    if (!wordSet || !wordSet.has(raw)) {
      setWordleMessage("That word is not in the allowed word list.");
      return;
    }

    if (wordleGuesses.length >= 6) {
      setWordleMessage("No guesses left. Start a new game.");
      return;
    }

    const score = scoreWordleGuess(raw, wordleAnswer);
    const newGuesses = [...wordleGuesses, raw];
    const newResults = [...wordleResults, score];

    setWordleGuesses(newGuesses);
    setWordleResults(newResults);
    setWordleGuess("");

    if (raw === wordleAnswer) {
      setWordleDone(true);
      setWordleMessage(
        "Nice! You solved it in " +
          newGuesses.length +
          " guess" +
          (newGuesses.length > 1 ? "es." : ".")
      );
      stopTimer();
    } else if (newGuesses.length >= 6) {
      setWordleDone(true);
      setWordleMessage("Out of guesses! The word was " + wordleAnswer + ".");
      stopTimer();
    } else {
      const remaining = 6 - newGuesses.length;
      setWordleMessage(
        remaining + " guess" + (remaining === 1 ? "" : "es") + " left."
      );
    }
  }

  function handleQuordleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quordleAnswers) return;
    if (quordleDone) return;

    const raw = quordleGuess.trim().toUpperCase();

    if (raw.length !== 5) {
      setQuordleMessage("Your guess must be 5 letters.");
      return;
    }

    if (!wordSet || !wordSet.has(raw)) {
      setQuordleMessage("That word is not in the allowed word list.");
      return;
    }

    if (quordleGuesses.length >= 9) {
      setQuordleMessage("No guesses left. Start a new game.");
      return;
    }

    const newGuesses = [...quordleGuesses, raw];
    const newResults: Score[][][] =
      quordleResults.length === 4
        ? quordleResults.map((boardRows) => [...boardRows])
        : Array.from({ length: 4 }, () => []);

    let newWins = [...quordleWins];

    for (let boardIndex = 0; boardIndex < 4; boardIndex++) {
      const answer = quordleAnswers[boardIndex];
      const score = scoreWordleGuess(raw, answer);
      if (!newResults[boardIndex]) {
        newResults[boardIndex] = [];
      }
      newResults[boardIndex].push(score);
      if (!newWins[boardIndex] && raw === answer) {
        newWins[boardIndex] = true;
      }
    }

    setQuordleGuesses(newGuesses);
    setQuordleResults(newResults);
    setQuordleWins(newWins);
    setQuordleGuess("");

    const allSolved = newWins.every(Boolean);

    if (allSolved) {
      setQuordleDone(true);
      setQuordleMessage(
        "Incredible! You solved all 4 in " +
          newGuesses.length +
          " guess" +
          (newGuesses.length > 1 ? "es." : ".")
      );
      stopTimer();
    } else if (newGuesses.length >= 9) {
      setQuordleDone(true);
      setQuordleMessage(
        "Out of guesses! The words were " + quordleAnswers.join(", ") + "."
      );
      stopTimer();
    } else {
      const remaining = 9 - newGuesses.length;
      setQuordleMessage(
        remaining + " guess" + (remaining === 1 ? "" : "es") + " left."
      );
    }
  }

  function handleStreakleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!streakleTargets) return;
    if (streakleDone) return;

    const raw = streakleGuess.trim().toUpperCase();

    if (raw.length !== 5) {
      setStreakleMessage("Your guess must be 5 letters.");
      return;
    }

    if (!wordSet || !wordSet.has(raw)) {
      setStreakleMessage("That word is not in the allowed word list.");
      return;
    }

    if (streakleGuesses.length >= 8) {
      setStreakleMessage("No guesses left. Start a new streak.");
      setStreakleDone(true);
      return;
    }

    // Enforce locked greens
    if (streakleLockedPattern.length === 5) {
      for (let i = 0; i < streakleLockedPattern.length; i++) {
        const lock = streakleLockedPattern[i];
        if (lock !== "_" && raw[i] !== lock) {
          setStreakleMessage(
            "Keep green letters locked: " + streakleLockedPattern.join("")
          );
          return;
        }
      }
    }

    const newGuesses = [...streakleGuesses, raw];
    const newResults = computeStreakleResults(newGuesses, streakleTargets);
    const solved = streakleTargets.map((t) => newGuesses.includes(t));
    const remaining = 8 - newGuesses.length;

    let message =
      remaining + " guess" + (remaining === 1 ? "" : "es") + " left.";
    let done = false;
    let nextTargetIndex = streakleCurrentIndex;

    if (solved.every(Boolean)) {
      message =
        "Streak complete! You solved all 3 in " +
        newGuesses.length +
        " guess" +
        (newGuesses.length === 1 ? "" : "es") +
        ".";
      done = true;
      stopTimer();
    } else if (solved[streakleCurrentIndex]) {
      const nextIdx = solved.findIndex((v) => !v);
      nextTargetIndex = nextIdx === -1 ? streakleCurrentIndex : nextIdx;
      message =
        "Nice! Target " +
        (streakleCurrentIndex + 1) +
        " solved. " +
        (remaining === 1 ? "1 guess left." : remaining + " guesses left.");
    }

    if (newGuesses.length >= 8 && !solved.every(Boolean)) {
      done = true;
      message =
        "Out of guesses! You solved " +
        solved.filter(Boolean).length +
        "/3 targets.";
      stopTimer();
    }

    setStreakleGuesses(newGuesses);
    setStreakleResults(newResults);
    setStreakleSolved(solved);
    setStreakleCurrentIndex(nextTargetIndex);
    setStreakleGuess("");
    setStreakleMessage(message);
    setStreakleDone(done);
  }

  function shuffleBeeLetters() {
    if (!beeLetters || !beeCenterLetter) return;
    const outer = beeLetters.filter((l) => l !== beeCenterLetter);
    const reshuffled = shuffleArray(outer);
    setBeeLetters([beeCenterLetter, ...reshuffled]);
  }

  function handleBeeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!beeLetters || !beeCenterLetter) return;
    if (beeDictLoading) return;

    const raw = beeGuess.trim().toUpperCase();

    if (raw.length < 4) {
      setBeeMessage("Words must be at least 4 letters.");
      return;
    }

    if (!raw.includes(beeCenterLetter)) {
      setBeeMessage("Every word must include the center letter.");
      return;
    }

    for (const ch of raw) {
      if (!beeLetterSet.has(ch)) {
        setBeeMessage("Use only the 7 hive letters.");
        return;
      }
    }

    if (!beeValidSet.has(raw)) {
      setBeeMessage("That word is not in the dictionary for this hive.");
      return;
    }

    if (beeFoundWords.includes(raw)) {
      setBeeMessage("Already found that one!");
      return;
    }

    const newFound = [...beeFoundWords, raw];
    setBeeFoundWords(newFound);
    setBeeGuess("");

    const remaining = beeValidWords.length - newFound.length;
    const pangramHit = beePangramSet.has(raw);

    let msg =
      "Nice! " +
      newFound.length +
      "/" +
      beeValidWords.length +
      " found. " +
      (remaining === 0
        ? "You found them all!"
        : remaining + " word" + (remaining === 1 ? "" : "s") + " left.");

    if (pangramHit) {
      msg =
        "Pangram! " +
        msg +
        " Pangrams found: " +
        newFound.filter((w) => beePangramSet.has(w)).length +
        "/" +
        beePangrams.length +
        ".";
    }

    if (remaining === 0) {
      stopTimer();
    }

    setBeeMessage(msg);
  }

  const remainingCount = Math.max(solutions.length - foundWords.length, 0);

  const boardLabels = ["Top-left", "Top-right", "Bottom-left", "Bottom-right"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-amber-50 text-rose-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white/90 border border-pink-200 rounded-3xl shadow-xl p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-rose-900">
            Word Puzzles Lab
          </h1>
          {gameMode !== "home" && (
            <button
              onClick={() => {
                if (gameMode === "pattern") {
                  startNewPatternGame();
                } else if (gameMode === "wordle") {
                  startNewWordleGame();
                } else if (gameMode === "quordle") {
                  startNewQuordleGame();
                } else if (gameMode === "streakle") {
                  startNewStreakleGame();
                } else if (gameMode === "bee") {
                  startNewBeeGame();
                }
              }}
              className="text-sm px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 transition"
              type="button"
            >
              New round
            </button>
          )}
        </div>
        {gameMode !== "home" && (
          <div className="flex items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-2 text-sm text-rose-700">
              <input
                type="checkbox"
                className="accent-rose-500"
                checked={timedMode}
                onChange={() => {
                  setTimedMode((prev) => {
                    const next = !prev;
                    if (next) {
                      startTimer();
                    } else {
                      stopTimer();
                      setTimerElapsed(0);
                    }
                    return next;
                  });
                }}
              />
              Timed mode
            </label>
            {timedMode && (
              <span className="text-xs px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                Time: {formatTime(timerElapsed)}
              </span>
            )}
          </div>
        )}

        {gameMode === "home" ? (
          <>
            <p className="text-sm text-rose-700 mb-4 leading-relaxed">
              Choose a game mode to jump in. Play casually or toggle Timed Mode
              for an extra challenge. Each game lets you reveal answers if you
              ever get stuck — experiment, practice, and have fun leveling up
              your puzzle instincts.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl border border-pink-200 bg-white shadow-sm">
                <h3 className="text-base font-semibold text-rose-800 mb-1">
                  Pattern Hunt
                </h3>
                <p className="text-sm text-rose-700 mb-2 leading-relaxed">
                  Crack a two-letter blueprint hiding 3–15 real words. Spot
                  every match before you run out of ideas.
                </p>
                <button
                  className="text-sm px-3 py-1.5 rounded-full bg-rose-400 text-rose-50 hover:bg-rose-300 transition"
                  onClick={() => activateMode("pattern")}
                  disabled={loading}
                >
                  Start Pattern Hunt
                </button>
              </div>
              <div className="p-4 rounded-2xl border border-pink-200 bg-white shadow-sm">
                <h3 className="text-base font-semibold text-rose-800 mb-1">
                Wordle
                </h3>
                <p className="text-sm text-rose-700 mb-2 leading-relaxed">
                  Classic 5-letter sleuthing in 6 guesses. Read the colors, zero
                  in, nail the answer.
                </p>
                <button
                  className="text-sm px-3 py-1.5 rounded-full bg-rose-400 text-rose-50 hover:bg-rose-300 transition"
                  onClick={() => activateMode("wordle")}
                  disabled={loading}
                >
                  Start Wordle
                </button>
              </div>
              <div className="p-4 rounded-2xl border border-pink-200 bg-white shadow-sm">
                <h3 className="text-base font-semibold text-rose-800 mb-1">
                  Quordle
                </h3>
                <p className="text-sm text-rose-700 mb-2 leading-relaxed">
                  Four Wordles at once, 9 shared guesses. One guess, four
                  boards—can you juggle all the clues?
                </p>
                <button
                  className="text-sm px-3 py-1.5 rounded-full bg-rose-400 text-rose-50 hover:bg-rose-300 transition"
                  onClick={() => activateMode("quordle")}
                  disabled={loading}
                >
                  Start Quordle
                </button>
              </div>
              <div className="p-4 rounded-2xl border border-pink-200 bg-white shadow-sm">
                <h3 className="text-base font-semibold text-rose-800 mb-1">
                  Streakle
                </h3>
                <p className="text-sm text-rose-700 mb-2 leading-relaxed">
                  Guess 3 secret words in 8 tries. Greens lock in place; each
                  solve recolors your past guesses for the next target.
                </p>
                <button
                  className="text-sm px-3 py-1.5 rounded-full bg-rose-400 text-rose-50 hover:bg-rose-300 transition"
                  onClick={() => activateMode("streakle")}
                  disabled={loading}
                >
                  Start Streakle
                </button>
              </div>
              <div className="p-4 rounded-2xl border border-pink-200 bg-white shadow-sm md:col-span-2">
                <h3 className="text-base font-semibold text-rose-800 mb-1">
                  Spelling Bee
                </h3>
                <p className="text-sm text-rose-700 mb-2 leading-relaxed">
                  Build as many words as you can from 7 hive letters (center
                  required). Hunt pangrams and clear the list.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="text-sm px-3 py-1.5 rounded-full bg-rose-400 text-rose-50 hover:bg-rose-300 transition"
                    onClick={() => activateMode("bee")}
                    disabled={loading}
                  >
                    Start Spelling Bee
                  </button>
                  {beeDictLoading && (
                    <span className="text-xs text-rose-700">
                      Loading dictionary…
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1 rounded-full bg-pink-100 border border-pink-200 p-1 text-xs text-rose-800">
              <button
                type="button"
                onClick={() => activateMode("home")}
                className={
                  "px-3 py-1 rounded-full transition font-semibold " +
                  (gameMode === "home"
                    ? "bg-rose-400 text-rose-50 shadow"
                    : "text-rose-700 hover:text-rose-500")
                }
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => activateMode("pattern")}
                className={
                  "px-3 py-1 rounded-full transition font-semibold " +
                  (gameMode === "pattern"
                    ? "bg-rose-400 text-rose-50 shadow"
                    : "text-rose-700 hover:text-rose-500")
                }
              >
                Pattern hunt
              </button>
              <button
                type="button"
                onClick={() => activateMode("wordle")}
                className={
                  "px-3 py-1 rounded-full transition font-semibold " +
                  (gameMode === "wordle"
                    ? "bg-rose-400 text-rose-50 shadow"
                    : "text-rose-700 hover:text-rose-500")
                }
              >
                Wordle
              </button>
              <button
                type="button"
                onClick={() => activateMode("quordle")}
                className={
                  "px-3 py-1 rounded-full transition font-semibold " +
                  (gameMode === "quordle"
                    ? "bg-rose-400 text-rose-50 shadow"
                    : "text-rose-700 hover:text-rose-500")
                }
              >
                Quordle
              </button>
              <button
                type="button"
                onClick={() => activateMode("streakle")}
                className={
                  "px-3 py-1 rounded-full transition font-semibold " +
                  (gameMode === "streakle"
                    ? "bg-rose-400 text-rose-50 shadow"
                    : "text-rose-700 hover:text-rose-500")
                }
              >
                Streakle
              </button>
              <button
                type="button"
                onClick={() => activateMode("bee")}
                className={
                  "px-3 py-1 rounded-full transition font-semibold " +
                  (gameMode === "bee"
                    ? "bg-rose-400 text-rose-50 shadow"
                    : "text-rose-700 hover:text-rose-500")
                }
              >
                Spelling Bee
              </button>
            </div>
          </div>
        )}

        {gameMode !== "home" && (
          <p className="text-sm text-rose-700 mb-3">
            {gameMode === "pattern" ? (
              <>
                A pattern is chosen from the Wordle answers list so that roughly
                <span className="font-semibold"> 3-15 </span>
                words match. Guess any valid word that fits the pattern.
              </>
            ) : gameMode === "wordle" ? (
              <>
                Practice classic Wordle using the same answer list. You have
                <span className="font-semibold"> 6 </span>
                guesses to find the hidden word. Green = correct spot, yellow =
                wrong spot, grey = not in the word.
              </>
            ) : gameMode === "quordle" ? (
              <>
                Play four Wordles at once. You have
                <span className="font-semibold"> 9 </span>
                guesses, and each guess is applied to all four boards. The
                keyboard shows colors in quadrants for each board (top-left,
                top-right, bottom-left, bottom-right).
              </>
            ) : gameMode === "bee" ? (
              <>
                Spelling Bee: make as many words as possible from
                <span className="font-semibold"> 7 </span>
                letters. Every word must be at least 4 letters, include the center
                letter, and use only the hive letters (repeats allowed). Find the
                pangram(s) that use all 7.
              </>
            ) : (
              <>
                Streakle: solve
                <span className="font-semibold"> 3 </span>
                target words within
                <span className="font-semibold"> 8 </span>
                total guesses. A starting word is auto-played; greens lock in
                place for future guesses. After you crack a word, the board
                recolors your past guesses for the next target.
              </>
            )}
          </p>
        )}

        {loading && <p className="text-rose-700 mt-4">Loading word list...</p>}
        {error && !loading && (
          <p className="text-red-400 mt-4">Could not load word list: {error}</p>
        )}
        {gameMode === "bee" && beeDictLoading && (
          <p className="text-rose-700 mt-4">Loading Spelling Bee dictionary…</p>
        )}
        {gameMode === "bee" && beeDictError && (
          <p className="text-red-400 mt-4">
            Could not load dictionary: {beeDictError}
          </p>
        )}

        {/* Pattern Hunt Mode */}
        {!loading && !error && gameMode === "pattern" && pattern && (
          <>
            <section className="mt-4 mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Pattern
              </h2>
              <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="flex gap-2">
                  {pattern.map((ch, idx) => (
                    <div
                      key={idx}
                      className="w-12 h-12 md:w-14 md:h-14 rounded-xl border border-rose-200 bg-rose-100 flex items-center justify-center text-2xl md:text-3xl font-mono text-rose-900"
                    >
                      {ch === "_" ? "_" : ch}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col items-start gap-2 text-sm text-rose-700">
                  <div>
                    <span className="font-semibold">{solutions.length}</span>{" "}
                    total matching words
                  </div>
                  <div>
                    <span className="font-semibold">{remainingCount}</span>{" "}
                    still to find
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRevealSolutions((prev) => {
                        const next = !prev;
                        if (next) stopTimer();
                        return next;
                      });
                    }}
                    className="mt-1 inline-flex items-center px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 text-xs uppercase tracking-wide"
                  >
                    {revealSolutions ? "Hide answers" : "Reveal all words"}
                  </button>
                </div>
              </div>
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Your guess
              </h2>
              <form
                onSubmit={handlePatternSubmit}
                className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
              >
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={pattern.length}
                  value={patternGuess}
                  onChange={(e) =>
                    setPatternGuess(e.target.value.toUpperCase())
                  }
                  className="flex-1 rounded-2xl border border-pink-200 bg-white px-4 py-2.5 font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
                  placeholder="TYPE A WORD"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-2xl bg-rose-400 font-semibold text-rose-50 hover:bg-rose-300 active:bg-rose-200 transition"
                >
                  Guess
                </button>
              </form>
              {patternMessage && (
                <p className="mt-2 text-sm text-rose-600">{patternMessage}</p>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Found words ({foundWords.length})
              </h2>
              {foundWords.length === 0 ? (
                <p className="text-sm text-rose-600">
                  Nothing yet - start guessing words that match the pattern.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {foundWords.map((w) => (
                    <div
                      key={w}
                      className="px-2 py-1.5 rounded-xl bg-rose-100 border border-rose-200 text-center font-mono text-sm text-rose-900"
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {revealSolutions && (
                <section className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase">
                      All matching words
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-rose-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                        Found
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-rose-300/80" />
                        Missed
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {sortedSolutions.map((w) => {
                      const isFound = foundWords.includes(w);
                      return (
                        <div
                          key={w}
                          className={
                            "px-2 py-1.5 rounded-xl border text-center font-mono text-sm " +
                            (isFound
                              ? "bg-white border-emerald-300 text-emerald-700"
                              : "bg-rose-50 border-rose-200 text-rose-700")
                          }
                        >
                          {w}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>
          </>
        )}

        {/* Single Wordle Mode */}
        {!loading && !error && gameMode === "wordle" && wordleAnswer && (
          <>
            <section className="mt-4 mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Board
              </h2>
              <div className="grid grid-rows-6 gap-2">
                {Array.from({ length: 6 }).map((_, row) => {
                  const guess = wordleGuesses[row] || "";
                  const result = wordleResults[row] || [];
                  return (
                    <div key={row} className="flex gap-2">
                      {Array.from({ length: 5 }).map((__, col) => {
                        const letter = guess[col] || "";
                        const status = result[col] || "empty";
                        let cellClasses =
                          "w-12 h-12 md:w-14 md:h-14 rounded-xl border flex items-center justify-center font-mono text-xl";
                        if (status === "correct") {
                          cellClasses +=
                            " bg-emerald-500 border-emerald-500 text-slate-950";
                        } else if (status === "present") {
                          cellClasses +=
                            " bg-amber-400 border-amber-400 text-slate-950";
                        } else if (status === "absent") {
                          cellClasses +=
                            " bg-rose-100 border-rose-200 text-rose-500";
                        } else {
                          cellClasses +=
                            " bg-rose-50 border-rose-200 text-rose-300";
                        }
                        return (
                          <div key={col} className={cellClasses}>
                            {letter}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Your guess
              </h2>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() =>
                    setWordleReveal((v) => {
                      const next = !v;
                      if (next) stopTimer();
                      return next;
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 transition"
                >
                  {wordleReveal ? "Hide answer" : "Reveal answer"}
                </button>
                {wordleReveal && wordleAnswer && (
                  <span className="text-xs text-rose-700 font-mono">
                    Answer: {wordleAnswer}
                  </span>
                )}
              </div>
              <form
                onSubmit={handleWordleSubmit}
                className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
              >
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={5}
                  value={wordleGuess}
                  onChange={(e) => setWordleGuess(e.target.value.toUpperCase())}
                  disabled={wordleDone}
                  className="flex-1 rounded-2xl border border-pink-200 bg-white px-4 py-2.5 font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-60"
                  placeholder="GUESS THE WORD"
                />
                <button
                  type="submit"
                  disabled={wordleDone}
                  className="px-4 py-2.5 rounded-2xl bg-rose-400 font-semibold text-rose-50 hover:bg-rose-300 active:bg-rose-200 transition disabled:opacity-60"
                >
                  Guess
                </button>
              </form>
              {wordleMessage && (
                <p className="mt-2 text-sm text-rose-600">{wordleMessage}</p>
              )}
              <p className="mt-1 text-xs text-rose-600">
                Guesses used: {wordleGuesses.length}/6
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Keyboard
              </h2>
              <div className="space-y-1.5">
                {KEYBOARD_ROWS.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex justify-center gap-1 sm:gap-1.5"
                  >
                    {row.map((keyLetter) => {
                      const status = wordleLetterStates[keyLetter] || "empty";
                      let keyClasses =
                        "w-8 sm:w-9 md:w-10 h-10 rounded-md border text-sm font-mono flex items-center justify-center";
                      if (status === "correct") {
                        keyClasses +=
                          " bg-emerald-500 border-emerald-500 text-slate-950";
                      } else if (status === "present") {
                        keyClasses +=
                          " bg-amber-400 border-amber-400 text-slate-950";
                      } else if (status === "absent") {
                        keyClasses +=
                          " bg-rose-200 border-rose-200 text-rose-700";
                      } else {
                        keyClasses +=
                          " bg-rose-100 border-rose-200 text-rose-700";
                      }
                      return (
                        <div key={keyLetter} className={keyClasses}>
                          {keyLetter}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Spelling Bee Mode */}
        {!beeDictLoading &&
          !beeDictError &&
          gameMode === "bee" &&
          beeLetters &&
          beeCenterLetter && (
            <>
              <section className="mt-4 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-1">
                      Hive
                    </h2>
                    <p className="text-sm text-rose-700">
                      Found {beeFoundWords.length}/{beeValidWords.length} words •
                      Pangrams {beeFoundWords.filter((w) =>
                        beePangramSet.has(w)
                      ).length}
                      /{beePangrams.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={shuffleBeeLetters}
                    className="text-xs px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 transition"
                  >
                    Shuffle outer letters
                  </button>
                </div>

                <div className="flex flex-col items-center gap-2 mt-3">
                  <div className="flex gap-2">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-rose-200 bg-rose-100 text-rose-900 flex items-center justify-center font-bold text-lg">
                      {beeOuterLetters[0] || ""}
                    </div>
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-rose-200 bg-rose-100 text-rose-900 flex items-center justify-center font-bold text-lg">
                      {beeOuterLetters[1] || ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-rose-200 bg-rose-100 text-rose-900 flex items-center justify-center font-bold text-lg">
                      {beeOuterLetters[2] || ""}
                    </div>
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-amber-300 bg-amber-300 text-slate-950 shadow-lg flex items-center justify-center font-extrabold text-xl">
                      {beeCenterLetter}
                    </div>
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-rose-200 bg-rose-100 text-rose-900 flex items-center justify-center font-bold text-lg">
                      {beeOuterLetters[3] || ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-rose-200 bg-rose-100 text-rose-900 flex items-center justify-center font-bold text-lg">
                      {beeOuterLetters[4] || ""}
                    </div>
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-rose-200 bg-rose-100 text-rose-900 flex items-center justify-center font-bold text-lg">
                      {beeOuterLetters[5] || ""}
                    </div>
                  </div>
                </div>
              </section>

              <section className="mb-4">
                <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                  Your word
                </h2>
                <form
                  onSubmit={handleBeeSubmit}
                  className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
                >
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    value={beeGuess}
                    onChange={(e) => setBeeGuess(e.target.value.toUpperCase())}
                    className="flex-1 rounded-2xl border border-pink-200 bg-white px-4 py-2.5 font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
                    placeholder="TYPE A WORD"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-2xl bg-rose-400 font-semibold text-rose-50 hover:bg-rose-300 active:bg-rose-200 transition"
                  >
                    Submit
                  </button>
                </form>
                {beeMessage && (
                  <p className="mt-2 text-sm text-rose-600">{beeMessage}</p>
                )}
                <p className="mt-1 text-xs text-rose-600">
                  Must use the center letter; repeats allowed; 4+ letters only.
                </p>
              </section>

              <section className="mb-6">
                <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                  Found words ({beeFoundWords.length})
                </h2>
                {beeFoundWords.length === 0 ? (
                  <p className="text-sm text-rose-600">
                    Start typing words that use the center letter.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {sortedBeeFound.map((w) => {
                      const isPangram = beePangramSet.has(w);
                      return (
                        <div
                          key={w}
                          className={
                            "px-2 py-1.5 rounded-xl border text-center font-mono text-sm " +
                            (isPangram
                              ? "bg-amber-200/40 border-amber-300 text-amber-900"
                              : "bg-rose-100 border-rose-200 text-rose-700")
                          }
                        >
                          {w}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-xs text-rose-600">
                  Total possible: {beeValidWords.length}. Pangrams:{" "}
                  {beePangrams.length}
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setBeeRevealAnswers((v) => {
                        const next = !v;
                        if (next) stopTimer();
                        return next;
                      })
                    }
                    className="text-xs px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 transition"
                  >
                    {beeRevealAnswers ? "Hide all answers" : "Show all answers"}
                  </button>
                </div>
                {beeRevealAnswers && (
                  <div className="mt-3">
                    <h3 className="text-xs uppercase tracking-wide text-rose-500 mb-1">
                      All valid words ({beeValidWords.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[...beeValidWords].sort().map((w) => {
                        const isPangram = beePangramSet.has(w);
                        return (
                          <div
                            key={w}
                            className={
                              "px-2 py-1.5 rounded-xl border text-center font-mono text-sm " +
                              (isPangram
                                ? "bg-amber-200/40 border-amber-300 text-amber-900"
                                : "bg-rose-100 border-rose-200 text-rose-700")
                            }
                          >
                            {w}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

        {/* Streakle Mode */}
        {!loading && !error && gameMode === "streakle" && streakleTargets && (
          <>
            <section className="mt-4 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-1">
                    Streak progress
                  </h2>
                  <p className="text-sm text-rose-700">
                    Target {streakleCurrentIndex + 1}/3 • Guesses used{" "}
                    {streakleGuesses.length}/8
                  </p>
                </div>
                {streakleStartWord && (
                  <div className="text-xs text-rose-500">
                    Start word:{" "}
                    <span className="font-mono text-rose-700">
                      {streakleStartWord}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-rose-500">
                {streakleSolved.map((solved, idx) => (
                  <span
                    key={idx}
                    className={
                      "px-2 py-1 rounded-full border " +
                      (solved
                        ? "border-emerald-400/70 text-emerald-700 bg-emerald-50"
                        : "border-rose-200 text-rose-700 bg-rose-50")
                    }
                  >
                    Target {idx + 1}: {solved ? "Solved" : "Unsolved"}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-2 mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Board (Target {streakleCurrentIndex + 1})
              </h2>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() =>
                    setStreakleReveal((v) => {
                      const next = !v;
                      if (next) stopTimer();
                      return next;
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 transition"
                >
                  {streakleReveal ? "Hide answers" : "Reveal answers"}
                </button>
                {streakleReveal && streakleTargets && (
                  <span className="text-xs text-rose-700 font-mono">
                    {streakleTargets.join(", ")}
                  </span>
                )}
              </div>
              <div className="grid grid-rows-8 gap-2">
                {Array.from({ length: 8 }).map((_, row) => {
                  const guess = streakleGuesses[row] || "";
                  const boardRows = streakleResults[streakleCurrentIndex] || [];
                  const result = boardRows[row] || [];
                  return (
                    <div key={row} className="flex gap-2">
                      {Array.from({ length: 5 }).map((__, col) => {
                        const letter = guess[col] || "";
                        const status = result[col] || "empty";
                        let cellClasses =
                          "w-12 h-12 md:w-14 md:h-14 rounded-xl border flex items-center justify-center font-mono text-xl";
                        if (status === "correct") {
                          cellClasses +=
                            " bg-emerald-500 border-emerald-500 text-slate-950";
                        } else if (status === "present") {
                          cellClasses +=
                            " bg-amber-400 border-amber-400 text-slate-950";
                        } else if (status === "absent") {
                          cellClasses +=
                            " bg-rose-100 border-rose-200 text-rose-500";
                        } else {
                          cellClasses +=
                            " bg-rose-50 border-rose-200 text-rose-300";
                        }
                        return (
                          <div key={col} className={cellClasses}>
                            {letter}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Your guess
              </h2>
              <form
                onSubmit={handleStreakleSubmit}
                className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
              >
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={5}
                  value={streakleGuess}
                  onChange={(e) =>
                    setStreakleGuess(e.target.value.toUpperCase())
                  }
                  disabled={streakleDone || streakleGuesses.length >= 8}
                  className="flex-1 rounded-2xl border border-pink-200 bg-white px-4 py-2.5 font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-60"
                  placeholder="KEEP THE STREAK"
                />
                <button
                  type="submit"
                  disabled={streakleDone || streakleGuesses.length >= 8}
                  className="px-4 py-2.5 rounded-2xl bg-rose-400 font-semibold text-rose-50 hover:bg-rose-300 active:bg-rose-200 transition disabled:opacity-60"
                >
                  Guess
                </button>
              </form>
              {streakleLockedPattern.length === 5 &&
                streakleLockedPattern.some((ch) => ch !== "_") && (
                  <p className="mt-1 text-xs text-rose-500">
                    Locked greens: {streakleLockedPattern.join("")}
                  </p>
                )}
              {streakleMessage && (
                <p className="mt-2 text-sm text-sky-200">{streakleMessage}</p>
              )}
              <p className="mt-1 text-xs text-rose-500">
                Targets solved: {streakleSolved.filter(Boolean).length}/3 •
                Guesses used: {streakleGuesses.length}/8
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Keyboard
              </h2>
              <div className="space-y-1.5">
                {KEYBOARD_ROWS.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex justify-center gap-1 sm:gap-1.5"
                  >
                    {row.map((keyLetter) => {
                      const status = streakleLetterStates[keyLetter] || "empty";
                      let keyClasses =
                        "w-8 sm:w-9 md:w-10 h-10 rounded-md border text-sm font-mono flex items-center justify-center";
                      if (status === "correct") {
                        keyClasses +=
                          " bg-emerald-500 border-emerald-500 text-slate-950";
                      } else if (status === "present") {
                        keyClasses +=
                          " bg-amber-400 border-amber-400 text-slate-950";
                      } else if (status === "absent") {
                        keyClasses +=
                          " bg-rose-200 border-rose-200 text-rose-700";
                      } else {
                        keyClasses +=
                          " bg-rose-100 border-rose-200 text-rose-700";
                      }
                      return (
                        <div key={keyLetter} className={keyClasses}>
                          {keyLetter}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Quordle Mode */}
        {!loading && !error && gameMode === "quordle" && quordleAnswers && (
          <>
            <section className="mt-4 mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Boards
              </h2>
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() =>
                    setQuordleReveal((v) => {
                      const next = !v;
                      if (next) stopTimer();
                      return next;
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded-full border border-pink-300 bg-pink-100 text-rose-900 hover:border-rose-400 hover:bg-rose-100 transition"
                >
                  {quordleReveal ? "Hide answers" : "Reveal answers"}
                </button>
                {quordleReveal && quordleAnswers && (
                  <span className="text-xs text-rose-700 font-mono">
                    {quordleAnswers.join(", ")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quordleAnswers.map((answer, boardIndex) => {
                  const solved = quordleWins[boardIndex];
                  return (
                    <div
                      key={boardIndex}
                      className={
                        "rounded-2xl border p-3 bg-white/80 " +
                        (solved
                          ? "border-emerald-300"
                          : "border-rose-200")
                      }
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs uppercase tracking-wide text-rose-500">
                          {boardLabels[boardIndex]}
                        </div>
                        <div className="text-xs text-rose-500">
                          {solved ? "Solved" : "Unsolved"}
                        </div>
                      </div>
                      <div className="grid grid-rows-9 gap-1.5">
                        {Array.from({ length: 9 }).map((_, row) => {
                          const guess = quordleGuesses[row] || "";
                          const boardRows = quordleResults[boardIndex] || [];
                          const result = boardRows[row] || [];
                          return (
                            <div key={row} className="flex gap-1.5">
                              {Array.from({ length: 5 }).map((__, col) => {
                                const letter = guess[col] || "";
                                const status = result[col] || "empty";
                                let cellClasses =
                                  "w-8 h-8 md:w-9 md:h-9 rounded-lg border flex items-center justify-center font-mono text-base";
                                if (status === "correct") {
                                  cellClasses +=
                                    " bg-emerald-500 border-emerald-500 text-slate-950";
                                } else if (status === "present") {
                                  cellClasses +=
                                    " bg-amber-400 border-amber-400 text-slate-950";
                                } else if (status === "absent") {
                                  cellClasses +=
                                    " bg-rose-100 border-rose-200 text-rose-500";
                                } else {
                                  cellClasses +=
                                    " bg-rose-50 border-rose-200 text-rose-300";
                                }
                                return (
                                  <div key={col} className={cellClasses}>
                                    {letter}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Your guess
              </h2>
              <form
                onSubmit={handleQuordleSubmit}
                className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
              >
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  maxLength={5}
                  value={quordleGuess}
                  onChange={(e) =>
                    setQuordleGuess(e.target.value.toUpperCase())
                  }
                  disabled={quordleDone}
                  className="flex-1 rounded-2xl border border-pink-200 bg-white px-4 py-2.5 font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-60"
                  placeholder="GUESS THE WORD"
                />
                <button
                  type="submit"
                  disabled={quordleDone}
                  className="px-4 py-2.5 rounded-2xl bg-rose-400 font-semibold text-rose-50 hover:bg-rose-300 active:bg-rose-200 transition disabled:opacity-60"
                >
                  Guess
                </button>
              </form>
              {quordleMessage && (
                <p className="mt-2 text-sm text-sky-200">{quordleMessage}</p>
              )}
              <p className="mt-1 text-xs text-rose-500">
                Guesses used: {quordleGuesses.length}/9
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold tracking-wide text-rose-500 uppercase mb-2">
                Keyboard
              </h2>
              <div className="space-y-1.5">
                {KEYBOARD_ROWS.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex justify-center gap-1 sm:gap-1.5"
                  >
                    {row.map((keyLetter) => {
                      const states =
                        quordleLetterStates[keyLetter] || [
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                        ];
                    return (
                      <div
                        key={keyLetter}
                        className="relative w-8 sm:w-9 md:w-10 h-10 rounded-md border border-rose-200 bg-rose-50 overflow-hidden"
                      >
                        <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                          {states.map((state, idx) => {
                            let squareClasses = "w-full h-full";
                            if (state === "correct") {
                              squareClasses += " bg-emerald-500";
                            } else if (state === "present") {
                              squareClasses += " bg-amber-400";
                            } else if (state === "absent") {
                              squareClasses += " bg-rose-200";
                            } else {
                              squareClasses += " bg-rose-100";
                            }
                            return (
                              <div key={idx} className={squareClasses} />
                            );
                          })}
                        </div>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-rose-800">
                          {keyLetter}
                        </span>
                      </div>
                    );
                  })}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="mt-6 text-xs text-rose-600">
          Word list: Wordle answers (alphabetical) by cfreshman on GitHub.
        </footer>
      </div>
    </div>
  );
}
