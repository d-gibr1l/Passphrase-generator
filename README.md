# Passphrase Generator

A Chrome extension that creates strong, memorable passphrases such as
`gents3-limelight-stucco1-machinist8-hamstring-support`. Everything runs in your
browser: nothing is sent anywhere.

![Popup screenshot](screenshot.png)

## Features

### Popup
Click the toolbar icon to get a passphrase straight away.

- **Copy** copies it and **New** makes another.
- A strength meter shows how hard the passphrase is to guess, in bits.
- Quick options: number of words (3–12), separator (hyphen, space, period,
  underscore, none or your own), and capitalization (lowercase, First Letter,
  ALL CAPS or random words).
- A **Preset** picker appears once you've saved a preset.
- **More customization ↗** opens the full settings page.

### Settings page
A page that opens in a tab, with a live preview at the top. Changes apply only after
you click **Save**.

| Section | What you can change |
| --- | --- |
| Basics | Words, separator and capitalization |
| Numbers & symbols | 0–8 digits, 0–5 symbols, which symbols to use, and where they go: spread out after different words (default), together after a random word, or together at the end |
| Words | The EFF list or your own words, a word length range, and words to never use |
| On websites | Turn the new-password card on or off (saves right away) |
| Presets | Save the current settings under a name, then load, overwrite or delete presets |

If a combination can't work, for example fewer than 2 words left after filtering,
the preview explains why and **Save** stays off until you fix it.

### On websites
When you click into a **new password** field, for example on a sign-up or
change-password form, a small card appears under it:

- **Use passphrase** fills the password field and its "confirm password" field,
  then copies the passphrase to your clipboard so you can save it.
- **↻** suggests another passphrase, and **✕** or Esc closes the card for that field.
- Log-in fields and "current password" fields are left alone.
- If you start typing your own password, the card goes away.

Passphrases made here use your saved settings.

## Install

The extension isn't in the Chrome Web Store, so you load it in developer mode:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the repository folder.
4. Pin the extension from the puzzle-piece menu so the icon stays in the toolbar.

To update after pulling new changes, click the reload button on the extension's
card in `chrome://extensions`, then refresh any pages that were already open.

## How strong is it?

The strength meter assumes an attacker knows exactly how your passphrase was made:
which word list and which settings. It counts only the randomness, never the length.

- Each word from the EFF list adds about 12.9 bits, since there are 7,776 words to
  pick from. 6 words give about 78 bits.
- Digits add about 3.3 bits each and symbols add bits based on how many symbols you
  allow. Spreading them out adds a little more, because where they land is random too.
- Random capitalization adds 1 bit per word. The other capitalization styles add
  nothing, because they're predictable.
- A small custom word list or tight filters lower the strength, and the meter shows it.

| Bits | Rating |
| --- | --- |
| Under 50 | Weak |
| 50–64 | Fair |
| 65–79 | Strong |
| 80 or more | Very strong |

Randomness comes from `crypto.getRandomValues` with rejection sampling, so every
word, digit and symbol is equally likely.

## Privacy and permissions

- No network requests, analytics or tracking.
- Settings and presets are stored with `chrome.storage` on your computer.
- **Permissions:** `storage`, plus a content script that runs on http and https pages
  so the new-password card can appear. Because of that script, Chrome warns that the
  extension can "read and change all your data on all websites". The script only
  checks password fields when you click into them, and sends nothing anywhere. You
  can turn the card off on the settings page.

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension setup: popup, settings page, background worker, content script |
| `generator.js` | Shared code: settings, word filtering, generation, strength, storage |
| `wordlist.js` | The EFF Large Wordlist |
| `popup.html` / `.css` / `.js` | The toolbar popup |
| `options.html` / `.css` / `.js` | The settings page |
| `content.js` | The new-password card on websites |
| `background.js` | Creates passphrases for `content.js`, so web pages don't load the word list |
| `icons/` | Toolbar and store icons |

There's no build step. Edit the files, then reload the extension.

## Credits

Word list: [EFF Large Wordlist](https://www.eff.org/dice), CC BY 3.0 US.
