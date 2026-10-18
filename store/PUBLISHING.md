# Publishing to the Chrome Web Store

This guide goes from no developer account to automatic releases on every `v*` tag.

The first upload must be done by hand: the Chrome Web Store API can update an existing item, but it cannot create one.

---

## 1. Register a developer account (one time)

1. Go to the **Chrome Web Store Developer Dashboard**: https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account that will own the extension. A dedicated account is a good idea, because you cannot move the account to another person later.
3. Accept the developer agreement and pay the **one-time US$5 registration fee**.
4. Turn on **2-step verification** for the Google account. Publishing requires it.
5. In **Account**:
   - Set a **contact e-mail** and verify it. You cannot publish until it is verified.
   - Fill in the **trader / non-trader** declaration, which is required for the EU Digital Services Act. For a free hobby project, "non-trader" is usually correct.
   - Optional: set a publisher display name.

## 2. Build the package

```bash
npm ci
npm run package         # typecheck + tests + build + zip
# → release/wordharvest-<version>.zip
```

The zip contains the contents of `dist/`, with `manifest.json` at the root.

## 3. First manual upload

1. In the dashboard, click **➕ New item** and upload `release/wordharvest-1.0.0.zip`.
2. The item opens as a draft. Copy the **Item ID** (32 letters, also in the URL). This is `CWS_EXTENSION_ID`.

## 4. Store listing tab

Use [`listing.md`](listing.md) for all text.

| Field | Value |
| --- | --- |
| Description | "Detailed description" in `listing.md` |
| Category | Education |
| Language | English |
| Store icon | `store/icons/icon-128.png` |
| Screenshots | everything in `store/screenshots/` (1280×800) |
| Small promo tile | `store/promo-small-440x280.png` |
| Homepage / support URL | the GitHub repo and its issues page |

The title and summary come from `public/manifest.json` and cannot be edited in the dashboard.

## 5. Privacy practices tab

Copy each answer from [`permissions-justification.md`](permissions-justification.md):

1. **Single purpose:** paste the description.
2. **Permission justification:** one text box per permission (`storage` and the host permissions).
3. **Remote code:** "No, I am not using remote code".
4. **Data usage:** check **Website content** only, then tick the three certifications.
5. **Privacy policy URL:** `https://talipturkmen.github.io/wordharvest/privacy-policy/`. The `pages.yml` workflow publishes this page from `store/privacy-policy.md`; check that it loads before you submit.

## 6. Distribution tab

- **Visibility:** Public. Use Unlisted if you want to test with a link first.
- **Regions:** all regions.
- The extension is free.

## 7. Submit for review

Click **Submit for review**. Optionally untick "Publish automatically after review" if you want to choose when it goes live.

The first review usually takes a few days. Extensions with host permissions on all sites can take longer. Clear permission justifications and a short privacy policy, as provided here, make the review faster. You get an e-mail when the review is done.

---

## 8. Credentials for automatic publishing (CI)

The release workflow (`.github/workflows/release.yml`) uses [`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli), which needs five values:

| GitHub secret | What it is |
| --- | --- |
| `CWS_EXTENSION_ID` | Item ID from step 3 |
| `CWS_PUBLISHER_ID` | Your publisher ID (see 8.5). Chrome Web Store API v2 requires it. |
| `CWS_CLIENT_ID` | OAuth client ID |
| `CWS_CLIENT_SECRET` | OAuth client secret |
| `CWS_REFRESH_TOKEN` | OAuth refresh token for the account that owns the item |

If any of these secrets is missing, the workflow still creates the GitHub Release and **skips** the store upload with a notice.

### 8.1 Create a Google Cloud project and enable the API

1. Open https://console.cloud.google.com/ and create a project, for example "wordharvest-publish".
2. Go to **APIs & Services → Library**, search for **Chrome Web Store API**, and click **Enable**.

### 8.2 Configure the OAuth consent screen

1. Go to **Google Auth Platform**, also called **OAuth consent screen**, and click **Get started**.
2. Enter an app name and your e-mail. For **Audience**, choose **External**.
3. **Publish the app** (Audience → *Publish app* → *In production*). If the app stays in "Testing", Google expires its refresh tokens after **7 days**, and CI will start failing. A personal app that only you use does not need Google verification. You will only see an "unverified app" warning once, when you authorize it.

### 8.3 Create an OAuth client

1. Go to **Clients → Create client**. For the application type, choose **Web application**.
2. Under **Authorized redirect URIs**, add `https://developers.google.com/oauthplayground`.
3. Create the client, then copy the **Client ID** (`CWS_CLIENT_ID`) and the **Client secret** (`CWS_CLIENT_SECRET`).

### 8.4 Get a refresh token

1. Open https://developers.google.com/oauthplayground
2. Click the ⚙️ gear (top right), tick **Use your own OAuth credentials**, and paste the client ID and secret.
3. In the left box **Input your own scopes**, enter `https://www.googleapis.com/auth/chromewebstore` and click **Authorize APIs**.
4. Sign in with the account that owns the extension, and allow access. You may need to click "Advanced → Go to … (unsafe)", because the app is unverified.
5. Click **Exchange authorization code for tokens**. Copy the **Refresh token** (`CWS_REFRESH_TOKEN`).

Shortcut: `npx chrome-webstore-upload-keys` walks you through the same steps interactively.

### 8.5 Find your publisher ID

In the developer dashboard, open **Account**. The **Publisher ID** is shown there and is also part of the dashboard URL. It is different from the extension's item ID.

### 8.6 Add the secrets to GitHub

```bash
gh secret set CWS_EXTENSION_ID    # paste the value when prompted
gh secret set CWS_PUBLISHER_ID
gh secret set CWS_CLIENT_ID
gh secret set CWS_CLIENT_SECRET
gh secret set CWS_REFRESH_TOKEN
```

Or add them under **Settings → Secrets and variables → Actions** in the repository.

---

## 9. Releasing a new version

```bash
# 1. bump "version" in public/manifest.json (e.g. 1.0.0 → 1.1.0) and commit
git commit -am "chore: release 1.1.0"
# 2. tag and push
git tag v1.1.0
git push origin main v1.1.0
```

The workflow then:

1. checks that the tag matches the manifest version
2. typechecks, tests, builds and zips
3. creates a GitHub Release with the zip attached
4. uploads the zip to the Chrome Web Store and submits it for review/publishing

The Chrome Web Store rejects an upload whose version is not higher than the published one, so always bump the version.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `invalid_grant` in the upload step | The refresh token expired or was revoked. If the consent screen is still in "Testing", publish it to production (8.2), then get a new token (8.4). |
| `403` / item not found | `CWS_EXTENSION_ID` or `CWS_PUBLISHER_ID` is wrong, or the token belongs to another Google account. |
| Upload OK but "publish" fails | The item has a pending review or a dashboard error, such as missing privacy fields. Fix it in the dashboard. |
| Version error | Bump `version` in `public/manifest.json`. |
