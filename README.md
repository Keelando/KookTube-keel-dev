# KookTube Key Detector

On-device key detection for YouTube and YouTube Music. Audio stays in the browser. The badge appears at the bottom-right of a watch page.

Install it from this folder. The folder you select must contain `manifest.json`.

After you install or update it, reload the extension on the browser’s extensions page, then refresh any YouTube tab that was already open. An open tab keeps the previous audio connection until that refresh.

## Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Microsoft Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Opera

1. Open `opera://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Vivaldi

1. Open `vivaldi://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

Other Chromium browsers use the same steps. Open the browser’s extensions page, turn on developer mode, and load this folder.

## Firefox

Firefox loads this as a temporary add-on. It is removed when Firefox quits, and you load it again the next time.

1. Open `about:debugging`.
2. Click **This Firefox**.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` inside this folder.

A copy that stays installed after Firefox quits has to be signed through [addons.mozilla.org](https://addons.mozilla.org/).

## Confirm it is running

The extensions page should list **KookTube Key Detector**. Open a YouTube video and refresh that tab. Click the page once. The badge starts in **Western**. Use **−** and **+** to transpose what you hear. The video speed does not change.
