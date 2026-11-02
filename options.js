'use strict';

const $ = (id) => document.getElementById(id);
let saved = { ...DEFAULTS };
let presets = [];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.round(v) : lo));
const num = (id) => clamp(Number($(id).value), Number($(id).min), Number($(id).max));

function readForm() {
  const minLen = num('min-len');
  return {
    count: num('count'),
    sep: $('sep').value,
    customSep: $('custom-sep').value,
    caps: $('caps').value,
    digits: num('digits'),
    symbols: num('symbols'),
    symbolSet: $('symbol-set').value,
    place: $('place').value,
    minLen,
    maxLen: Math.max(minLen, num('max-len')),
    source: document.querySelector('input[name=source]:checked').value,
    customWords: $('custom-words').value,
    exclude: $('exclude').value,
    version: DEFAULTS.version,
  };
}

function applyForm(s) {
  $('count').value = s.count; $('sep').value = s.sep; $('custom-sep').value = s.customSep;
  $('caps').value = s.caps; $('digits').value = s.digits; $('symbols').value = s.symbols;
  $('symbol-set').value = s.symbolSet; $('place').value = s.place;
  $('min-len').value = s.minLen; $('max-len').value = s.maxLen;
  document.querySelector(`input[name=source][value=${s.source}]`).checked = true;
  $('custom-words').value = s.customWords; $('exclude').value = s.exclude;
  render();
}

const isDirty = () => settingsKey(readForm()) !== settingsKey(saved);

function render() {
  const s = readForm();
  const issue = problem(s);
  $('count-val').textContent = s.count;
  $('custom-sep').hidden = s.sep !== 'custom';
  $('custom-words-field').hidden = s.source !== 'custom';
  $('custom-count').textContent = `${parseWords(s.customWords).length.toLocaleString()} unique words`;
  $('place').disabled = !s.digits && !s.symbols;
  $('symbol-set').disabled = !s.symbols;
  $('pool').textContent = `${wordPool(s).length.toLocaleString()} words to pick from with these filters.`;
  showResult(s, $);
  $('copy').disabled = $('regen').disabled = Boolean(issue);

  const dirty = isDirty();
  $('save').disabled = !dirty || Boolean(issue);
  $('discard').disabled = !dirty;
  $('status').classList.toggle('dirty', dirty);
  $('status').textContent = issue && dirty ? 'Fix the problem above to save.' : dirty ? 'Unsaved changes' : 'All changes saved';
  renderPresets(s);
}

function renderPresets(current) {
  const list = $('preset-list');
  list.replaceChildren();
  if (!presets.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No presets yet.';
    list.append(li);
    return;
  }
  presets.forEach((p, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    li.append(name);
    if (settingsKey(p.settings) === settingsKey(current)) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'In use above';
      li.append(tag);
    }
    const button = (label, onClick, extra = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `link ${extra}`;
      b.textContent = label;
      b.addEventListener('click', onClick);
      li.append(b);
    };
    button('Load', () => applyForm(p.settings));
    button('Overwrite', () => {
      if (problem(readForm())) return;
      if (confirm(`Replace "${p.name}" with the current settings?`)) {
        presets[i] = { name: p.name, settings: readForm() };
        savePresets();
      }
    });
    button('Delete', () => {
      if (confirm(`Delete the preset "${p.name}"?`)) { presets.splice(i, 1); savePresets(); }
    }, 'danger');
    list.append(li);
  });
}

function savePresets() {
  store.set({ presets });
  render();
}

$('preset-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('preset-name').value.trim();
  if (!name || problem(readForm())) return;
  const i = presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
  if (i >= 0 && !confirm(`A preset called "${presets[i].name}" already exists. Replace it?`)) return;
  const preset = { name, settings: readForm() };
  if (i >= 0) presets[i] = preset; else presets.push(preset);
  $('preset-name').value = '';
  savePresets();
});

$('save').addEventListener('click', async () => {
  const s = readForm();
  if (problem(s)) return;
  await store.set({ settings: s });
  saved = s;
  applyForm(s); // shows clamped numbers
});
$('discard').addEventListener('click', () => applyForm(saved));
$('reset').addEventListener('click', () => applyForm(DEFAULTS));
$('regen').addEventListener('click', render);
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('phrase').textContent);
  $('copy').textContent = 'Copied!';
  setTimeout(() => { $('copy').textContent = 'Copy'; }, 1200);
});

document.querySelector('main').addEventListener('input', (e) => {
  if (!e.target.closest('#preset-form, #field-helper')) render();
});
// Not part of the passphrase settings, so it saves on its own.
$('field-helper').addEventListener('change', () => store.set({ fieldHelper: $('field-helper').checked }));
// Tidy number fields once the user leaves them.
document.querySelector('main').addEventListener('change', (e) => {
  if (e.target.type === 'number') applyForm(readForm());
});

window.addEventListener('beforeunload', (e) => { if (isDirty()) e.preventDefault(); });

// Pick up changes made in the popup while this page is open, unless they'd overwrite edits here.
store.onChange(async (keys) => {
  if (keys.includes('presets')) { presets = await loadPresets(); render(); }
  if (keys.includes('settings') && !isDirty()) { saved = await loadSettings(); applyForm(saved); }
  if (keys.includes('fieldHelper')) loadFieldHelper();
});

async function loadFieldHelper() {
  const { fieldHelper } = await store.get(['fieldHelper']);
  $('field-helper').checked = fieldHelper !== false;
}

(async () => {
  loadFieldHelper();
  [saved, presets] = await Promise.all([loadSettings(), loadPresets()]);
  applyForm(saved);
})();
