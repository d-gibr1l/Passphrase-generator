'use strict';
// Generates passphrases for content.js, so web pages don't need the wordlist loaded.
importScripts('wordlist.js', 'generator.js');

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'passphrase') return false;
  loadSettings().then((saved) => {
    // The card on a page can ask for the other mode without changing the saved one.
    const s = { ...saved, mode: msg.mode || saved.mode };
    const issue = problem(s);
    reply({ mode: s.mode, ...(issue ? { error: issue } : { phrase: generate(s) }) });
  }).catch(() => reply({ mode: msg.mode, error: 'Couldn’t make a suggestion. Try again.' }));
  return true; // reply is async
});
