# Passphrase Generator (Chrome extension)

Generates diceware-style passphrases offline, e.g. `surreal-never-extent-campus-coauthor-issue`.

![Popup screenshot](screenshot.png)

- Words are drawn from the EFF Large Wordlist (7,776 words, ~12.9 bits each).
- Randomness comes from `crypto.getRandomValues` with rejection sampling, so there is no modulo bias.
- Options: word count (3–12), separator, capitalization, add a digit. Settings persist via `chrome.storage`.
- There are no network requests or analytics, and the only permission is `storage`.

## Install (developer mode)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

## Credits
Wordlist: [EFF](https://www.eff.org/dice), CC BY 3.0 US.
