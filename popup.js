'use strict';

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
let presets = [];

// The popup edits only these; everything else comes from the customization page.
function readQuick() {
  return { count: Number($('count').value), sep: $('sep').value, customSep: $('custom-sep').value, caps: $('caps').value };
}

function applyQuick(s) {
  $('count').value = s.count; $('sep').value = s.sep; $('custom-sep').value = s.customSep; $('caps').value = s.caps;
}

// One line listing the settings that are only visible on the customization page.
function extrasSummary(s) {
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
  $('count-val').textContent = settings.count;
  $('custom-sep').hidden = settings.sep !== 'custom';
  $('extras').textContent = extrasSummary(settings);
  showResult(settings, $);
  $('copy').disabled = Boolean(problem(settings));
  renderPresets();
}

function save() {
  store.set({ settings }).catch(() => {});
}

$('regen').addEventListener('click', render);
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('phrase').textContent);
  $('copy').textContent = 'Copied!';
  setTimeout(() => { $('copy').textContent = 'Copy'; }, 1200);
});
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
for (const id of ['count', 'sep', 'custom-sep', 'caps']) {
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
