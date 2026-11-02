'use strict';
// Offers a passphrase when you click into a "new password" field on a website.

(() => {
  const NEW_HINT = /new|create|choose|confirm|repeat|retype|re-?enter|again|verify|sign.?up|register/i;
  const CURRENT_HINT = /current|old|existing/i;
  const PAGE_HINT = /sign.?up|register|join|create|reset|change/i;

  let enabled = true;
  let field = null; // the input the card is showing for
  let phrase = '';
  let mode = null; // null until the first suggestion, which uses the saved mode
  const dismissed = new WeakSet();

  chrome.storage.local.get('fieldHelper').then(({ fieldHelper }) => { enabled = fieldHelper !== false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.fieldHelper) return;
    enabled = changes.fieldHelper.newValue !== false;
    if (!enabled) hide();
  });

  const describe = (el) =>
    [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.labels?.[0]?.textContent].join(' ');
  const visible = (el) => el.offsetWidth > 0 && el.offsetHeight > 0;
  const passwordFields = (el) =>
    [...(el.form || el.getRootNode()).querySelectorAll('input[type=password]')].filter(visible);

  function isCurrentPassword(el) {
    const ac = (el.autocomplete || '').toLowerCase();
    return ac.includes('current-password') || (!ac.includes('new-password') && CURRENT_HINT.test(describe(el)));
  }

  function isNewPassword(el) {
    if (!(el instanceof HTMLInputElement) || el.type !== 'password' || el.readOnly || el.disabled) return false;
    if ((el.autocomplete || '').toLowerCase().includes('new-password')) return true;
    if (isCurrentPassword(el)) return false;
    // A lone password box is usually a login form, unless the page or field says otherwise.
    return NEW_HINT.test(describe(el)) || passwordFields(el).length >= 2 || PAGE_HINT.test(location.pathname);
  }

  // ---- The card, kept in a closed shadow root so page styles and scripts stay out ----

  const host = document.createElement('passphrase-generator-card');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; z-index: 2147483647; }
      .card { --bg:#fff; --fg:#1d1d1f; --muted:#6e6e73; --line:#d2d2d7; --accent:#2f6fed; --field:#f5f5f7;
        width: 300px; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--fg);
        box-shadow: 0 6px 24px rgba(0,0,0,.18); font: 13px/1.4 system-ui, sans-serif; }
      @media (prefers-color-scheme: dark) {
        .card { --bg:#1c1c1e; --fg:#f5f5f7; --muted:#98989d; --line:#3a3a3c; --accent:#5b8cff; --field:#2c2c2e; }
      }
      .title { font-weight: 600; margin-bottom: 6px; }
      .phrase { padding: 6px 8px; border-radius: 6px; background: var(--field); word-break: break-all;
        font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .phrase.error { font-family: system-ui, sans-serif; color: #d93025; }
      .row { display: flex; gap: 6px; margin-top: 8px; }
      button { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg);
        font: inherit; cursor: pointer; }
      button.use { flex: 1; background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
      button:disabled { opacity: .5; cursor: default; }
      .done { color: var(--muted); }
      .swap { display: block; margin-top: 6px; padding: 0; border: 0; background: none; color: var(--accent); font-size: 12px; }
      [hidden] { display: none !important; }
    </style>
    <div class="card" role="dialog" aria-label="Suggested passphrase">
      <div class="title">Use a strong passphrase?</div>
      <div class="phrase"></div>
      <button class="swap" type="button"></button>
      <div class="row">
        <button class="use" type="button">Use passphrase</button>
        <button class="new" type="button" title="Suggest another">↻</button>
        <button class="close" type="button" title="Not now">✕</button>
      </div>
      <div class="done" hidden></div>
    </div>`;
  const $ = (sel) => root.querySelector(sel);

  // Clicking the card shouldn't take focus away from the password field.
  root.addEventListener('mousedown', (e) => e.preventDefault());

  async function suggest() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'passphrase', mode });
      mode = res.mode;
      phrase = res.phrase || '';
      const password = mode === 'password';
      $('.title').textContent = password ? 'Use a strong password?' : 'Use a strong passphrase?';
      $('.use').textContent = password ? 'Use password' : 'Use passphrase';
      $('.swap').textContent = password ? 'Switch to passphrase' : 'Switch to password';
      $('.phrase').textContent = res.error || phrase;
      $('.phrase').classList.toggle('error', !phrase);
      $('.use').disabled = !phrase;
    } catch (_) {
      hide(); // the extension was reloaded or removed; this page's copy can't reach it any more
    }
  }

  function place() {
    if (!field) return;
    const r = field.getBoundingClientRect();
    const below = r.bottom + 6;
    const height = host.offsetHeight || 130;
    host.style.top = `${below + height > innerHeight && r.top > height ? r.top - height - 6 : below}px`;
    host.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 316))}px`;
  }

  function show(el) {
    field = el;
    mode = null;
    $('.title').hidden = $('.row').hidden = $('.swap').hidden = false;
    $('.done').hidden = true;
    if (!host.isConnected) document.documentElement.append(host);
    place();
    suggest();
  }

  function hide() {
    field = null;
    phrase = '';
    host.remove();
  }

  // Sets a value the way typing would, so frameworks like React notice it.
  function fill(input, value) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  $('.use').addEventListener('click', async () => {
    if (!field || !phrase) return;
    // Fill this field and its "confirm password" partners, but never the current password.
    const targets = new Set([field, ...passwordFields(field).filter((el) => !isCurrentPassword(el))]);
    for (const el of targets) fill(el, phrase);
    let copied = true;
    try { await navigator.clipboard.writeText(phrase); } catch (_) { copied = false; }
    $('.title').hidden = $('.row').hidden = $('.swap').hidden = true;
    $('.done').hidden = false;
    $('.done').textContent = copied
      ? 'Filled in and copied to your clipboard. Save it somewhere safe.'
      : 'Filled in. Copy it from the field or save it in your password manager.';
    const done = field;
    dismissed.add(done);
    setTimeout(() => { if (field === done) hide(); }, 3000);
  });
  $('.new').addEventListener('click', suggest);
  $('.swap').addEventListener('click', () => { mode = mode === 'password' ? 'passphrase' : 'password'; suggest(); });
  $('.close').addEventListener('click', () => { dismissed.add(field); hide(); });

  function consider(el) {
    if (enabled && el !== field && !dismissed.has(el) && !el.value && isNewPassword(el)) show(el);
  }

  // composedPath finds inputs inside web components too.
  document.addEventListener('focusin', (e) => consider(e.composedPath()[0]), true);
  document.addEventListener('focusout', (e) => {
    if (e.composedPath()[0] === field) setTimeout(() => { if (field && !field.matches(':focus')) hide(); }, 150);
  }, true);
  // Typing your own password puts the card away.
  document.addEventListener('input', (e) => { if (e.isTrusted && e.composedPath()[0] === field) hide(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && field) { dismissed.add(field); hide(); } }, true);
  addEventListener('scroll', place, true);
  addEventListener('resize', place);

  if (document.activeElement) consider(document.activeElement);
})();
