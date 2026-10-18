# Privacy practices tab — answers

Paste these into the **Privacy practices** tab of the Chrome Web Store developer dashboard.

## Single purpose description

```
WordHarvest helps users learn vocabulary while reading: double-click a word on a web page to see its translation, save it with the sentence it appeared in, and review saved words as spaced-repetition flashcards.
```

## Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Stores the user's saved words, example sentences, review schedule and settings locally on the device with chrome.storage.local. |
| Host permission: content script on `http://*/*` and `https://*/*` | The core feature is double-clicking any word on any web page to translate it, so the content script that detects the double-click, reads the surrounding sentence and shows the translation popup must run on all http/https pages. |
| Host permission: `https://api.mymemory.translated.net/*` | When Chrome's on-device translator does not support a language pair, the background service worker sends the selected word or sentence to the MyMemory translation API, and only to that domain. |

### Note for reviewers: Tatoeba requests

Lesson pages fetch example sentences from `https://api.tatoeba.org` (JSON only). That API sends `Access-Control-Allow-Origin: *`, so no host permission is requested for it. The request is disclosed in the privacy policy and can be turned off in the settings.

## Remote code

**No, I am not using remote code.** All JavaScript is included in the extension package. The only network request is to a JSON translation API.

## Data usage

Check this data type:

- **Website content.** The selected word and its sentence are sent to the MyMemory translation API, only when the online fallback is used. When the "More example sentences" setting is on, saved words are also sent to Tatoeba's public sentence API to fetch example sentences.

Leave all other types unchecked. Page URLs and titles are stored only on the device and are never transmitted.

Check all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL

```
https://talipturkmen.github.io/wordharvest/privacy-policy/
```
