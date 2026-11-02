'use strict';
// Generates passphrases for content.js, so web pages don't need the wordlist loaded.
importScripts('wordlist.js', 'generator.js');

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'passphrase') return false;
  loadSettings().then((s) => {
    const issue = problem(s);
    reply(issue ? { error: issue } : { phrase: generate(s) });
  });
  return true; // reply is async
});
