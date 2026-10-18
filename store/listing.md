# Chrome Web Store listing

Copy these into the **Store listing** tab of the developer dashboard.

## Name (≤ 75 chars)

The name comes from `name` in `public/manifest.json`:

```
WordHarvest: Translate & Save Words as Flashcards
```

## Short description / summary (≤ 132 chars)

The summary comes from `description` in `public/manifest.json` (113 chars):

```
Double-click any word to translate it, save it with the sentence it came from, and review it later as flashcards.
```

## Detailed description

```
Learn vocabulary from what you actually read.

WordHarvest turns any web page into a language lesson. Double-click a word you don't know and a small popup shows its translation right next to it. Save it, and the word becomes a flashcard together with the sentence you found it in — so you remember what it means and how it is used.

HOW IT WORKS
• Double-click any word on any website to see its translation.
• Click Save (or turn on auto-save) to keep it. The full sentence, page title and link are saved with it.
• Found the same word on another page? Its new sentence is added as another example on the same card — no duplicates.
• Review your cards with spaced repetition. Rate each card Again, Hard, Good or Easy, and WordHarvest schedules it for the right moment (SM-2 algorithm).

FEATURES
• Translation popup that never breaks the page's layout.
• Automatic language detection; translate into English or 35+ other languages.
• Private by default: uses Chrome's built-in, on-device translator when available. Optional fallback to the free MyMemory service for other language pairs — or switch it off completely.
• Flashcards show the word in its original sentence, highlighted; the back shows the translation and the translated sentence.
• Browse, search, edit and delete your saved words.
• Export and import as JSON or CSV, or export an Anki-ready file.
• Keyboard shortcuts for fast reviews (Space to flip, 1–4 to grade).
• No account, no ads, no tracking. Your words are stored only in your browser.

Double-clicks inside text fields and editors are ignored, so it never gets in the way of typing.

Open source (MIT): https://github.com/talipturkmen/wordharvest
```

## Category

**Education** (in the current taxonomy: Productivity → Education)

## Language

**English**

## Graphic assets

| Asset | File |
| --- | --- |
| Store icon (128×128) | `store/icons/icon-128.png` |
| Screenshot 1 — translate popup | `store/screenshots/1-translate-popup.png` |
| Screenshot 2 — review | `store/screenshots/2-review.png` |
| Screenshot 3 — browse | `store/screenshots/3-browse.png` |
| Screenshot 4 — popup & settings | `store/screenshots/4-popup-and-settings.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |

Regenerate all of them with `npm run store-assets`.

## Additional fields

- **Homepage URL:** https://github.com/talipturkmen/wordharvest
- **Support URL:** https://github.com/talipturkmen/wordharvest/issues
- **Privacy policy URL** (Privacy tab): https://talipturkmen.github.io/wordharvest/privacy-policy/
