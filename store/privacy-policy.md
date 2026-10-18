# Privacy Policy — WordHarvest

_Last updated: October 18, 2026_

WordHarvest is a Chrome extension for learning vocabulary while you read. This policy explains what data the extension handles and where that data goes.

## Summary

- Your saved words, sentences and review history are stored **only in your browser**.
- When a word has to be translated online, **only the text being translated** is sent to the translation service.
- There are no accounts, analytics, ads or tracking. Nothing is sold or shared.

## Data stored on your device

When you save a word, the extension stores these items in your browser's extension storage (`chrome.storage.local`):

- the word, its translation and the detected language
- the sentence the word appeared in, and the translation of that sentence
- the title and address (URL) of the page where you saved it
- notes you add, and your flashcard review history (due dates, intervals)
- your settings (target language, auto-save, translation provider and, if you enter one, a MyMemory e-mail address)

This data never leaves your device unless you export it yourself. The extension has no servers. Uninstalling the extension, or using **Delete all cards** on the Import & export page, removes it.

## Data sent to translation services

1. **Chrome's built-in translator (default).** When it is available, translation and language detection run on your device through Chrome's built-in Translator and Language Detector APIs. The extension sends nothing over the network for these. Chrome may download language models from Google the first time a language pair is used.

2. **MyMemory (optional fallback).** If on-device translation is not available for a language pair, or you choose "Online only" in the settings, the extension sends these items to the MyMemory translation API (`api.mymemory.translated.net`, operated by Translated S.r.l.):
   - the word you double-clicked and, when you save it, the sentence around it
   - the source and target language codes
   - your e-mail address, only if you entered one in the settings to get a higher free quota

   The extension does **not** send the page URL, the page title, other page content, or your saved cards. MyMemory's own privacy policy applies to these requests: https://mymemory.translated.net/doc/privacy.php. To keep everything on your device, choose **On-device only** in the settings.

## What the extension does not do

- It does not collect analytics, telemetry or personal information.
- It does not read or transmit page content, except the selected word and its sentence when you double-click a word, as described above.
- It does not sell, rent, or share your data with third parties, and it does not use your data for advertising or creditworthiness.
- It does not use or transfer your data for any purpose unrelated to its single purpose: translating words and helping you learn them.

## Changes

If this policy changes, the new version will be published at this address, with a new "Last updated" date.

## Contact

Questions or requests: open an issue at https://github.com/talipturkmen/wordharvest/issues.
