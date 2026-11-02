'use strict';
// Shared by the popup and the customization page.

const DEFAULTS = {
  count: 6, sep: '-', customSep: '', caps: 'none',
  digits: 0, symbols: 0, symbolSet: '!@#$%^&*?', place: 'spread',
  minLen: 1, maxLen: 20, source: 'eff', customWords: '', exclude: '',
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
function wordPool(s) {
  const base = s.source === 'custom' ? parseWords(s.customWords) : WORDLIST;
  const excluded = new Set(parseWords(s.exclude));
  return base.filter((w) => {
    const n = w.replace(/-/g, '').length;
    return n >= s.minLen && n <= s.maxLen && !excluded.has(w);
  });
}

function symbolChars(s) {
  return [...new Set(s.symbolSet.replace(/\s/g, ''))];
}

function separator(s) {
  return s.sep === 'custom' ? s.customSep : s.sep;
}

// Returns a reason string when the settings can't produce a passphrase.
function problem(s) {
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

function generate(s) {
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

// Entropy assumes an attacker knows the wordlist and settings.
function entropyBits(s) {
  let bits = s.count * Math.log2(wordPool(s).length);
  if (s.caps === 'random') bits += s.count;
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

// Puts a passphrase and its strength into a page that has #phrase, #bits and #bar-fill.
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
