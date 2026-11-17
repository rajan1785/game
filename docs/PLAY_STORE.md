# Releasing Lumina Blocks on Google Play

The game is a self-contained web app (`web/`), so it ships to Android inside a
native WebView shell using [Capacitor](https://capacitorjs.com). No game code
changes are needed. These steps have **not** been run in the environment the
game was built in (it had no Android SDK or network), so treat them as a
checklist to follow, not a verified script.

## Before you start

- A Google Play Console developer account.
- Android Studio (which brings the Android SDK and a JDK).
- Node.js 20 or newer.

## 1. Choose your identity

Edit `capacitor.config.json`:

- `appId` — replace `com.yourstudio.luminablocks` with a reverse-domain id you
  own. It is permanent once the app is published.
- `appName` — the name shown under the icon. Search Google Play for the name
  first and pick a different one if a similar game already uses it.

## 2. Create the Android project

```bash
npm install
npm run build                               # produces web/game.js
npm install @capacitor/core @capacitor/android
npm install --save-dev @capacitor/cli @capacitor/assets
npx cap add android                         # creates the android/ folder
npx cap sync android                        # copies web/ into the app
```

Run `npm run build && npx cap sync android` again after every change to the game.

## 3. Android settings worth making

In `android/app/src/main/AndroidManifest.xml`, on the main `<activity>`:

- `android:screenOrientation="portrait"` — the layout is designed for portrait.

Icons and splash screen: put a 1024×1024 PNG export of `web/icons/icon.svg` at
`assets/icon.png` and run `npx capacitor-assets generate --android`.

## 4. Test on real devices

```bash
npx cap open android        # opens Android Studio; press Run
```

Check on at least one small and one large phone: dragging feels right, sound
plays after the first touch, the score survives closing and reopening the app,
and the system back button behaves the way you want.

## 5. Build the release bundle

In Android Studio: **Build → Generate Signed App Bundle**, create an upload
keystore (back it up — losing it is painful), and build the `.aab`.
Set `versionCode` / `versionName` in `android/app/build.gradle` and raise
`versionCode` on every upload.

## 6. Play Console listing

- **Data safety:** the game as shipped collects nothing, has no ads, no
  analytics and no network calls; progress is stored only on the device. If
  you add ads or analytics later, this declaration must change.
- **Privacy policy URL:** required by Google Play even for apps that collect
  nothing; a one-page statement saying so is enough.
- **Content rating questionnaire:** a puzzle game with no user-generated
  content, violence or gambling.
- **Store assets:** 512×512 icon, 1024×500 feature graphic, at least two phone
  screenshots (`docs/screenshot.png` shows the kind of frames to capture).
- New personal developer accounts must run a closed test before production
  access is granted; check the current requirement in the Play Console.

## Selling it

The game currently has no monetisation code. The usual routes for this genre:

- **Paid app** — nothing to build; set a price in the Play Console.
- **Free with a one-time "remove ads" purchase** — add an ads plugin and Play
  Billing; show an ad only between games, never during play.
- **Rewarded ad for one extra move set after game over** — strongest earner in
  this genre, and optional for the player.

Whichever you choose, keep `src/core` free of it: add a port (interface) in
`src/core`, implement it in `src/infrastructure`, and wire it up in
`src/main.ts`, the same way storage and the clock are handled.

## Other stores

- **Web / itch.io:** upload the `web/` folder, or the single file from
  `npm run standalone`.
- **iOS:** `npm install @capacitor/ios && npx cap add ios` (requires a Mac).
