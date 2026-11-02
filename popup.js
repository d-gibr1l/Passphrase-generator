'use strict';

const DEFAULTS = { count: 6, sep: '-', caps: false, digit: false };
const $ = (id) => document.getElementById(id);

// Uniform random integer in [0, max) using rejection sampling (no modulo bias).
function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

function generate({ count, sep, caps, digit }) {
  const words = Array.from({ length: count }, () => WORDLIST[randomInt(WORDLIST.length)]);
  if (caps) words.forEach((w, i) => { words[i] = w[0].toUpperCase() + w.slice(1); });
  if (digit) { const i = randomInt(count); words[i] += randomInt(10); }
  return words.join(sep);
}

// Entropy assumes an attacker knows the wordlist and settings.
function entropyBits({ count, digit }) {
  let bits = count * Math.log2(WORDLIST.length);
  if (digit) bits += Math.log2(10 * count);
  return bits;
}

function strength(bits) {
  if (bits < 50) return ['Weak', '#d93025', 0.25];
  if (bits < 65) return ['Fair', '#f29900', 0.5];
  if (bits < 80) return ['Strong', '#1e8e3e', 0.75];
  return ['Very strong', '#137333', 1];
}

function readSettings() {
  return { count: Number($('count').value), sep: $('sep').value, caps: $('caps').checked, digit: $('digit').checked };
}

function render() {
  const s = readSettings();
  $('count-val').textContent = s.count;
  $('phrase').textContent = generate(s);
  const bits = entropyBits(s);
  const [label, color, frac] = strength(bits);
  $('bits').textContent = `${label} · ${Math.round(bits)} bits`;
  $('bar-fill').style.width = `${frac * 100}%`;
  $('bar-fill').style.background = color;
}

function save() {
  try { chrome.storage?.local.set({ settings: readSettings() }); } catch (_) {}
}

async function load() {
  let s = DEFAULTS;
  try { s = { ...DEFAULTS, ...((await chrome.storage.local.get('settings')).settings || {}) }; } catch (_) {}
  $('count').value = s.count; $('sep').value = s.sep; $('caps').checked = s.caps; $('digit').checked = s.digit;
}

$('regen').addEventListener('click', render);
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('phrase').textContent);
  $('copy').textContent = 'Copied!';
  setTimeout(() => { $('copy').textContent = 'Copy'; }, 1200);
});
for (const id of ['count', 'sep', 'caps', 'digit']) {
  $(id).addEventListener('input', () => { save(); render(); });
}

load().then(render);
