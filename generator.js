'use strict';
// Shared by the popup and the customization page.

const DEFAULTS = {
  count: 6, sep: '-', customSep: '', caps: 'none',
  digits: 0, symbols: 0, symbolSet: '!@#$%^&*?', place: 'spread',
  minLen: 1, maxLen: 20, source: 'eff', customWords: '', exclude: '',
  mode: 'passphrase', pwLength: 20,
  pwUpper: true, pwLower: true, pwDigits: true, pwSymbols: true, pwCustom: false,
  pwMinUpper: 1, pwMinLower: 1, pwMinDigits: 1, pwMinSymbols: 1, pwMinCustom: 1,
  pwSymbolSet: '!@#$%^&*?-_=+', pwCustomSet: '',
  pwNoSimilar: false, pwNoAmbiguousSymbols: false, pwNoRepeat: false, pwExcludeOn: false, pwExcludeSet: '',
  pwSepOn: false, pwSep: '-', pwSepEvery: 4,
  version: 2,
};

// Uniform random integer in [0, max) using rejection sampling (no modulo bias).
function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

// Split a textarea into unique lowercase words (whitespace or comma separated).
function parseWords(text) {
  return [...new Set(text.toLowerCase().split(/[\s,]+/).filter(Boolean))];
}

// Words allowed by the source, length range and exclude list.
// Hyphens don't count toward length, so "t-shirt" is 6 letters.
// Cached, since one render or batch asks for the same pool many times.
let poolCache = { key: '', pool: [] };
function wordPool(s) {
  const key = JSON.stringify([s.source, s.source === 'custom' ? s.customWords : '', s.exclude, s.minLen, s.maxLen]);
  if (poolCache.key === key) return poolCache.pool;
  const base = s.source === 'custom' ? parseWords(s.customWords) : WORDLIST;
  const excluded = new Set(parseWords(s.exclude));
  const pool = base.filter((w) => {
    const n = w.replace(/-/g, '').length;
    return n >= s.minLen && n <= s.maxLen && !excluded.has(w);
  });
  poolCache = { key, pool };
  return pool;
}

function symbolChars(s) {
  return [...new Set(s.symbolSet.replace(/\s/g, ''))];
}

function separator(s) {
  return s.sep === 'custom' ? s.customSep : s.sep;
}

// Returns a reason string when the settings can't produce a passphrase or password.
function problem(s) {
  if (s.mode === 'password') return passwordProblem(s);
  if (wordPool(s).length < 2) return 'Not enough words to pick from. Loosen the word filters.';
  if (s.symbols > 0 && symbolChars(s).length === 0) return 'Add at least one symbol to the symbol set.';
  return null;
}

function capitalize(word, mode) {
  const first = () => word[0].toUpperCase() + word.slice(1);
  switch (mode) {
    case 'first': return first();
    case 'upper': return word.toUpperCase();
    case 'random': return randomInt(2) ? first() : word;
    default: return word;
  }
}

// Adds chars after the words. "spread" gives every word an equal share and puts
// the leftovers after different random words; otherwise they stay together.
function attach(words, chars, place) {
  if (!chars.length) return;
  if (place !== 'spread') {
    words[place === 'end' ? words.length - 1 : randomInt(words.length)] += chars.join('');
    return;
  }
  const share = Math.floor(chars.length / words.length);
  const extra = new Set();
  while (extra.size < chars.length % words.length) extra.add(randomInt(words.length));
  let next = 0;
  words.forEach((w, i) => {
    const k = share + (extra.has(i) ? 1 : 0);
    words[i] += chars.slice(next, next + k).join('');
    next += k;
  });
}

function generatePassphrase(s) {
  const pool = wordPool(s);
  const words = Array.from({ length: s.count }, () => capitalize(pool[randomInt(pool.length)], s.caps));
  const symbols = symbolChars(s);
  attach(words, Array.from({ length: s.digits }, () => randomInt(10)), s.place);
  attach(words, Array.from({ length: s.symbols }, () => symbols[randomInt(symbols.length)]), s.place);
  return words.join(separator(s));
}

function choose(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// Bits from where n extra characters land among the words.
function placementBits(s, n) {
  if (!n || s.place === 'end') return 0;
  if (s.place === 'word') return Math.log2(s.count);
  return Math.log2(choose(s.count, n % s.count));
}

// ---- Regular passwords ----

const PW_KINDS = [
  { key: 'Upper', label: 'uppercase letters', chars: () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { key: 'Lower', label: 'lowercase letters', chars: () => 'abcdefghijklmnopqrstuvwxyz' },
  { key: 'Digits', label: 'numbers', chars: () => '0123456789' },
  { key: 'Symbols', label: 'symbols', chars: (s) => s.pwSymbolSet },
  { key: 'Custom', label: 'custom characters', chars: (s) => s.pwCustomSet },
];
const SIMILAR = 'iIlL1|oO0';
const AMBIGUOUS_SYMBOLS = '{}[]()/\\\'"`~,;:.<>';

// The ticked kinds of character, each with its characters and minimum count.
// A character belongs to only one kind, so overlapping sets can't skew things.
function passwordClasses(s) {
  // The separator is left out too, so groups stay easy to read.
  const excluded = new Set((s.pwNoSimilar ? SIMILAR : '') + (s.pwNoAmbiguousSymbols ? AMBIGUOUS_SYMBOLS : '')
    + (s.pwExcludeOn ? s.pwExcludeSet : '') + (s.pwSepOn ? s.pwSep : ''));
  const seen = new Set();
  const classes = PW_KINDS.filter((k) => s[`pw${k.key}`]).map((k) => {
    const chars = [...new Set(k.chars(s).replace(/\s/g, ''))].filter((c) => !excluded.has(c) && !seen.has(c));
    chars.forEach((c) => seen.add(c));
    return { label: k.label, chars, min: s[`pwMin${k.key}`] };
  });
  // Too short for the saved minimums: ignore them, but still use each ticked kind
  // once when there's room (kinds set to 0 stay optional).
  if (minimumsIgnored(s)) {
    const floor = classes.length <= s.pwLength ? 1 : 0;
    for (const c of classes) c.min = Math.min(c.min, floor);
  }
  return classes;
}

// True when the ticked kinds' minimums add up to more than the length.
function minimumsIgnored(s) {
  return PW_KINDS.filter((k) => s[`pw${k.key}`]).reduce((sum, k) => sum + s[`pwMin${k.key}`], 0) > s.pwLength;
}

const LOG2_FACT = [0];
function log2Fact(n) {
  for (let i = LOG2_FACT.length; i <= n; i++) LOG2_FACT[i] = LOG2_FACT[i - 1] + Math.log2(i);
  return LOG2_FACT[n];
}
const log2Choose = (n, k) => log2Fact(n) - log2Fact(k) - log2Fact(n - k);

// log2 of the ways to fill c chosen positions from n characters.
function log2Fill(n, c, noRepeat) {
  if (!noRepeat) return c ? c * Math.log2(n) : 0;
  return c > n ? -Infinity : log2Fact(n) - log2Fact(n - c);
}

function log2Sum(values) {
  const max = Math.max(...values);
  if (max === -Infinity) return -Infinity;
  return max + Math.log2(values.reduce((sum, v) => sum + 2 ** (v - max), 0));
}

// counts[i][k] is log2 of how many ways kinds i.. can fill k positions while meeting
// their minimums. counts[0][length] is the number of possible passwords, which makes
// the strength exact and lets generation pick every valid password equally often.
let planCache = { key: '', plan: null };
function passwordPlan(s) {
  const key = settingsKey(s);
  if (planCache.key === key) return planCache.plan;
  const classes = passwordClasses(s);
  const L = s.pwLength;
  const counts = Array.from({ length: classes.length + 1 }, () => new Array(L + 1).fill(-Infinity));
  counts[classes.length][0] = 0;
  for (let i = classes.length - 1; i >= 0; i--) {
    const { chars, min } = classes[i];
    for (let k = 0; k <= L; k++) {
      const terms = [];
      for (let c = min; c <= k; c++) {
        terms.push(log2Choose(k, c) + log2Fill(chars.length, c, s.pwNoRepeat) + counts[i + 1][k - c]);
      }
      counts[i][k] = terms.length ? log2Sum(terms) : -Infinity;
    }
  }
  planCache = { key, plan: { classes, counts } };
  return planCache.plan;
}

function passwordProblem(s) {
  const classes = passwordClasses(s);
  if (!classes.length) return 'Pick at least one kind of character.';
  const empty = classes.find((c) => !c.chars.length);
  if (empty) return `No ${empty.label} left to use. Check the character sets and exclusions.`;
  if (s.pwSepOn && !s.pwSep) return 'Type a separator or untick "Add separator".';
  if (passwordPlan(s).counts[0][s.pwLength] === -Infinity) {
    return 'Not enough different characters to avoid repeats. Shorten the password or allow repeats.';
  }
  return null;
}

// Uniform random number in [0, 1) with 53 bits of precision.
function randomFraction() {
  return (randomInt(2 ** 26) * 2 ** 27 + randomInt(2 ** 27)) / 2 ** 53;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function generatePassword(s) {
  const { classes, counts } = passwordPlan(s);
  // How many characters of each kind, weighted by how many passwords have that mix.
  let left = s.pwLength;
  const take = classes.map(({ chars, min }, i) => {
    let r = randomFraction();
    let pick = min;
    for (let c = min; c <= left; c++) {
      const p = 2 ** (log2Choose(left, c) + log2Fill(chars.length, c, s.pwNoRepeat) + counts[i + 1][left - c] - counts[i][left]);
      if (p > 0) pick = c; // if rounding leaves r just above 0, fall back to the last possible count
      r -= p;
      if (r < 0 && p > 0) break;
    }
    left -= pick;
    return pick;
  });
  // Pick the characters, then shuffle which position gets which kind.
  const picks = classes.map(({ chars }, i) => (s.pwNoRepeat
    ? shuffle([...chars]).slice(0, take[i])
    : Array.from({ length: take[i] }, () => chars[randomInt(chars.length)])));
  const slots = shuffle(take.flatMap((c, i) => new Array(c).fill(i)));
  const chars = slots.map((i) => picks[i].pop());
  if (!s.pwSepOn || !s.pwSepEvery) return chars.join('');
  const groups = [];
  for (let i = 0; i < chars.length; i += s.pwSepEvery) groups.push(chars.slice(i, i + s.pwSepEvery).join(''));
  return groups.join(s.pwSep);
}

function passwordBits(s) {
  return passwordPlan(s).counts[0][s.pwLength];
}

function generate(s) {
  return s.mode === 'password' ? generatePassword(s) : generatePassphrase(s);
}

// Entropy assumes an attacker knows the wordlist and settings.
function entropyBits(s) {
  if (s.mode === 'password') return passwordBits(s);
  const pool = wordPool(s);
  // Random caps doubles the choices only for words whose first letter has a capital.
  const choices = s.caps === 'random'
    ? pool.reduce((n, w) => n + (w[0].toUpperCase() === w[0] ? 1 : 2), 0)
    : pool.length;
  let bits = s.count * Math.log2(choices);
  if (s.digits > 0) bits += s.digits * Math.log2(10) + placementBits(s, s.digits);
  if (s.symbols > 0) bits += s.symbols * Math.log2(symbolChars(s).length) + placementBits(s, s.symbols);
  return bits;
}

function strength(bits) {
  if (bits < 50) return ['Weak', '#d93025', 0.25];
  if (bits < 65) return ['Fair', '#f29900', 0.5];
  if (bits < 80) return ['Strong', '#1e8e3e', 0.75];
  return ['Very strong', '#137333', 1];
}

// Bring settings saved by older versions up to date.
function migrate(s) {
  s = { ...s };
  if (typeof s.caps === 'boolean') s.caps = s.caps ? 'first' : 'none';
  if ('digit' in s) { if (s.digit && !s.digits) s.digits = 1; delete s.digit; }
  if ('symbol' in s) { if (s.symbol && !s.symbols) s.symbols = 1; delete s.symbol; }
  // Early password settings had one look-alike switch.
  if ('pwNoAmbiguous' in s) { s.pwNoSimilar ??= s.pwNoAmbiguous; delete s.pwNoAmbiguous; }
  // Before version 2, "after a random word" was the default; spread out is now.
  if (!(s.version >= 2)) { if (s.place === 'word') s.place = 'spread'; s.version = 2; }
  return { ...DEFAULTS, ...s };
}

// Settings in a fixed key order, so two of them can be compared as strings.
function settingsKey(s) {
  return JSON.stringify(Object.keys(DEFAULTS).map((k) => s[k]));
}

// chrome.storage inside the extension; localStorage when the pages are opened directly.
const store = {
  async get(keys) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.get(keys);
    const out = {};
    try {
      for (const k of keys) { const v = localStorage.getItem(k); if (v !== null) out[k] = JSON.parse(v); }
    } catch (_) {}
    return out;
  },
  async set(obj) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.set(obj);
    try { for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  },
  onChange(cb) {
    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') cb(Object.keys(changes)); });
    } else {
      window.addEventListener('storage', (e) => cb([e.key]));
    }
  },
};

async function loadSettings() {
  const { settings } = await store.get(['settings']);
  return migrate(settings || {});
}

async function loadPresets() {
  const { presets } = await store.get(['presets']);
  return Array.isArray(presets) ? presets.map((p) => ({ name: p.name, settings: migrate(p.settings) })) : [];
}

// Copies text and briefly shows how it went on the button.
async function copyWithFeedback(button, text) {
  button.dataset.label ??= button.textContent;
  let ok = true;
  try { await navigator.clipboard.writeText(text); } catch (_) { ok = false; }
  button.textContent = ok ? 'Copied!' : 'Copy failed';
  clearTimeout(button.resetTimer);
  button.resetTimer = setTimeout(() => { button.textContent = button.dataset.label; }, 1200);
}

// Puts a passphrase or password and its strength into a page that has #phrase, #bits and #bar-fill.
function showResult(s, $) {
  const issue = problem(s);
  $('phrase').textContent = issue || generate(s);
  $('phrase').classList.toggle('error', Boolean(issue));
  const bits = issue ? 0 : entropyBits(s);
  const [label, color, frac] = strength(bits);
  $('bits').textContent = issue ? '' : `${label} · ${Math.round(bits)} bits`;
  $('bar-fill').style.width = issue ? '0' : `${frac * 100}%`;
  $('bar-fill').style.background = color;
}
