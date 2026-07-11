# Getting Conjugation Feedback onto a phone

The app can't run in Expo Go or a browser — it needs a **dev/standalone build**
because it uses continuous native mic capture, a background audio session, and
(on Android) a foreground service. Builds run in the cloud via EAS, so **no Mac
is required**. Android is the easiest first test (no Apple account needed).

> These steps run on *your* machine with *your* accounts — an Expo account
> (free) and, for iOS only, an Apple Developer account ($99/yr). They can't be
> pre-run here.

## One-time setup

```sh
npm install --legacy-peer-deps
npm i -g eas-cli
eas login                 # your Expo account
eas init                  # creates the EAS project; writes owner + projectId into app.json
```

## Android (recommended first — standalone APK, no Apple account)

```sh
eas build --profile preview --platform android
```

EAS returns a URL/QR for an **APK**. Download it on the phone and install
(allow "install from unknown sources" if prompted). The `preview` profile
bundles the JS, so it runs standalone — no laptop/Metro tether, which is what
you need to test walking around with AirPods and the screen locked.

## iOS (standalone, for your iPhone)

```sh
eas device:create         # register your iPhone's UDID (follow the on-device profile prompt)
eas build --profile preview --platform ios
```

EAS will offer to generate and manage the Apple signing credentials
interactively (needs the Apple Developer account). Install via the URL/QR it
returns. Internal distribution installs directly; no TestFlight/review needed
for your own registered device.

## Fast JS iteration (optional)

For changing app code without a full rebuild each time:

```sh
eas build --profile development --platform android   # or ios; one time
npx expo start --dev-client                          # laptop on same Wi-Fi
```

The `development` build loads JS from your machine, so it only runs while the
dev server is up — fine for the desk, not for real background testing.

## First run in the app

1. **Settings** → paste your Gemini API key (from
   [aistudio.google.com](https://aistudio.google.com)) → **Test key**.
2. Pick a language (🇵🇱 / 🇪🇸 / 🇫🇷 / 🇬🇧).
3. **Session** → put in your AirPods → **Start session**. Grant the microphone
   (and, on Android 13+, the notification) permission when asked.

## On-device verification — run on BOTH an Android phone and an iPhone

These are the behaviors unit tests can't cover; they're the real acceptance gate
for the native changes:

1. **Background capture.** Start a session, lock the phone, keep talking. The
   utterance counter must keep climbing. On Android a persistent "Listening for
   corrections…" notification should appear — that's the foreground service; if
   capture dies on lock, the service didn't start.
2. **Duplex + mic-gate.** Trigger a mistake. The correction is spoken into the
   AirPods, and the mic stays live for your next sentence afterward — and the
   app never corrects its own spoken feedback.
3. **Logging.** Mistakes appear in **History** with the correction, explanation,
   and the session's language flag; the cost badge increments.

If background capture fails on one platform, note which, and check: iOS →
`UIBackgroundModes: audio` present (it is, in app.json); Android → the
foreground-service notification appeared and `FOREGROUND_SERVICE_MICROPHONE` is
granted.
