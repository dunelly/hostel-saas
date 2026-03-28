# Chrome Extension: OAuth Key Setup for Local Development

## Why this matters

Chrome assigns a **random Extension ID** every time you reload an unpacked extension from disk. The Gmail API OAuth flow requires a fixed redirect URI that includes the extension ID:

```
https://<extension-id>.chromiumapp.org/
```

If the ID changes on every reload, `chrome.identity.getAuthToken()` will fail silently or return an error because the registered redirect URI no longer matches.

**Fix:** pin the Extension ID by adding a `"key"` field to `manifest.json`.

---

## Step 1 — Find your Extension ID (current, before the fix)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extensions/chrome` folder (or find the already-loaded extension)
4. Note the current **ID** shown under the extension name (e.g. `abcdefghijklmnopabcdefghijklmnop`)

---

## Step 2 — Get the public key from Chrome

Chrome stores the key material in your profile directory.

### macOS
```
~/Library/Application Support/Google/Chrome/Default/Extensions/<extension-id>/
```

Inside that folder, open the `manifest.json` Chrome generated. It will contain a `"key"` field — copy its value (a long base64 string).

**Alternative (recommended):** use the Chrome Extension source viewer approach:

1. Go to `chrome://extensions`, click **Details** on your extension
2. Click **Pack extension…**
3. Leave the private key field blank and click **Pack extension**
4. Chrome creates a `.crx` and a `.pem` file alongside your extension folder
5. Open the `.pem` file — it contains your private key
6. To derive the public key string for `manifest.json`, run:

```bash
# Install crx tool if needed: npm install -g crx3
openssl rsa -in my_extension.pem -pubout -outform DER | openssl base64 -A
```

This outputs the base64 key to paste into `manifest.json`.

---

## Step 3 — Add the key to manifest.json

Open `extensions/chrome/manifest.json` and add the `"key"` field at the top level:

```json
{
  "manifest_version": 3,
  "name": "Hostel Reservation Importer",
  "version": "1.0.0",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...(your key here)...",
  ...
}
```

> **Security note:** The `"key"` field contains only your **public** key. It is safe to commit to source control. The `.pem` private key file should NOT be committed — add it to `.gitignore`.

---

## Step 4 — Verify the Extension ID is now stable

1. Reload the unpacked extension in `chrome://extensions`
2. Confirm the Extension ID matches what was registered in the Google Cloud Console
3. The ID should remain the same across reloads

---

## Step 5 — Ensure the Extension ID is registered in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Find the OAuth 2.0 Client ID: `224459923893-rtprf94dk4n52kdrmrqtabnk5one65r6.apps.googleusercontent.com`
3. Under **Authorized redirect URIs**, confirm this entry exists:
   ```
   https://<your-extension-id>.chromiumapp.org/
   ```
   Replace `<your-extension-id>` with the now-stable ID from Step 4.
4. Save.

---

## Testing the fix

1. Reload the extension
2. Click the extension popup → **Gmail Sync**
3. You should be prompted to authorize Gmail access (first time only)
4. Subsequent syncs will use the cached token without re-prompting

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `OAuth2 not granted or revoked` | Extension ID changed | Redo Steps 3–5 |
| `No cached token` | First run after install | Click Sync manually from popup (interactive auth) |
| `Gmail search failed: 401` | Token expired or scope mismatch | Remove cached token in `chrome://extensions` → extension storage, then re-auth |
| Emails found but 0 imported | Parser regex mismatch | Check service worker console for `could not parse Hostelworld format` warnings |
