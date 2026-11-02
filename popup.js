'use strict';

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
let presets = [];

// The popup edits only these; everything else comes from the customization page.
function readQuick() {
  return {
    count: Number($('count').value), sep: $('sep').value, customSep: $('custom-sep').value, caps: $('caps').value,
    pwLength: Number($('pw-length').value), pwUpper: $('pw-upper').checked, pwLower: $('pw-lower').checked,
    pwDigits: $('pw-digits').checked, pwSymbols: $('pw-symbols').checked,
  };
}

function applyQuick(s) {
  $('count').value = s.count; $('sep').value = s.sep; $('custom-sep').value = s.customSep; $('caps').value = s.caps;
  $('pw-length').value = s.pwLength; $('pw-upper').checked = s.pwUpper; $('pw-lower').checked = s.pwLower;
  $('pw-digits').checked = s.pwDigits; $('pw-symbols').checked = s.pwSymbols;
}

// One line listing the settings that are only visible on the customization page.
function extrasSummary(s) {
  if (s.mode === 'password') {
    const parts = [];
    const mins = ['Upper', 'Lower', 'Digits', 'Symbols'].filter((k) => s[`pw${k}`] && s[`pwMin${k}`] !== 1);
    if (mins.length) parts.push('custom minimums');
    if (s.pwCustom) parts.push('your own characters');
    if (s.pwNoSimilar) parts.push('no similar');
    if (s.pwNoAmbiguousSymbols) parts.push('no ambiguous');
    if (s.pwNoRepeat) parts.push('no repeats');
    if (s.pwExcludeOn && s.pwExcludeSet.trim()) parts.push('custom exclusions');
    if (s.pwSepOn) parts.push(`"${s.pwSep}" every ${s.pwSepEvery}`);
    return parts.length ? `Also using: ${parts.join(', ')}` : '';
  }
  const parts = [];
  if (s.digits) parts.push(`${s.digits} digit${s.digits > 1 ? 's' : ''}`);
  if (s.symbols) parts.push(`${s.symbols} symbol${s.symbols > 1 ? 's' : ''}`);
  if (s.source === 'custom') parts.push('your own words');
  if (s.minLen !== DEFAULTS.minLen || s.maxLen !== DEFAULTS.maxLen) parts.push(`${s.minLen}–${s.maxLen} letters`);
  if (parseWords(s.exclude).length) parts.push(`${parseWords(s.exclude).length} excluded`);
  return parts.length ? `Also using: ${parts.join(', ')}` : '';
}

function renderPresets() {
  $('preset-row').hidden = !presets.length;
  const match = presets.findIndex((p) => settingsKey(p.settings) === settingsKey(settings));
  $('preset').replaceChildren(
    new Option('Custom', '', false, match < 0),
    ...presets.map((p, i) => new Option(p.name, i, false, i === match)),
  );
}

function render() {
  const password = settings.mode === 'password';
  for (const b of document.querySelectorAll('.switch button')) b.setAttribute('aria-checked', b.dataset.mode === settings.mode);
  $('passphrase-opts').hidden = password;
  $('password-opts').hidden = !password;
  $('pw-length-val').textContent = settings.pwLength;
  $('count-val').textContent = settings.count;
  $('custom-sep').hidden = settings.sep !== 'custom';
  $('extras').textContent = $('extras').title = extrasSummary(settings);
  showResult(settings, $);
  $('copy').disabled = Boolean(problem(settings));
  renderPresets();
}

function save() {
  store.set({ settings }).catch(() => {});
}

$('regen').addEventListener('click', render);
$('copy').addEventListener('click', () => copyWithFeedback($('copy'), $('phrase').textContent));
$('customize').addEventListener('click', () => {
  if (globalThis.chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open('options.html');
});
$('preset').addEventListener('input', () => {
  const p = presets[$('preset').value];
  if (!p) return;
  settings = { ...p.settings };
  applyQuick(settings);
  save(); render();
});
for (const b of document.querySelectorAll('.switch button')) {
  b.addEventListener('click', () => {
    settings = { ...settings, mode: b.dataset.mode };
    save(); render();
  });
}
for (const id of ['count', 'sep', 'custom-sep', 'caps', 'pw-length', 'pw-upper', 'pw-lower', 'pw-digits', 'pw-symbols']) {
  $(id).addEventListener('input', () => {
    settings = { ...settings, ...readQuick() };
    save(); render();
  });
}

(async () => {
  try { [settings, presets] = await Promise.all([loadSettings(), loadPresets()]); } catch (_) {}
  applyQuick(settings);
  render();
})();
