# Deploying Conjugation Feedback on an iPhone

A complete walkthrough from zero to the app running on your iPhone — written
for someone who has never shipped an iOS app. Builds happen in the Expo (EAS)
cloud, so **you do not need a Mac or Xcode**.

The app cannot run in Expo Go or Safari: it needs native continuous mic
capture, a background audio session for lock-screen listening, and Bluetooth
mic routing for AirPods. That's why a real build is required.

## 1. What you need

| Requirement | Notes |
|---|---|
| Apple Developer Program account | [developer.apple.com](https://developer.apple.com/programs/enroll/), $99/year, personal enrollment is fine. A free Apple ID is **not** enough for EAS internal distribution. |
| Expo account | Free, at [expo.dev](https://expo.dev). |
| Node.js 20+ and this repo cloned | Any OS — Windows/Linux/Mac all work. |
| Your iPhone + a Gemini API key | Key is free to create at [aistudio.google.com](https://aistudio.google.com); usage costs pennies. |

## 2. One-time project setup

From the repo root:

```sh
npm install --legacy-peer-deps
npm i -g eas-cli
eas login          # your expo.dev account
eas init           # links the project to your Expo account
```

`eas init` writes `owner` and `extra.eas.projectId` into `app.json` — commit
that change so future builds use the same project.

## 3. Register your iPhone

Internal ("ad hoc") distribution only installs on iPhones whose device IDs are
registered **before** the build:

```sh
eas device:create
```

This prints a link/QR — open it **on the iPhone in Safari**, and follow the
prompt to install the registration profile. If you later want the app on
another iPhone, repeat this for that device and rebuild.

## 4. Build and install

```sh
eas build --profile preview --platform ios
```

- On the first run, EAS asks you to sign in with your **Apple Developer**
  account and then generates and manages the signing certificate and
  provisioning profile for you. Accept the defaults — there is nothing to
  configure manually.
- The cloud build takes roughly 10–20 minutes. When it finishes, EAS prints an
  install URL and QR code (also visible on your build's page at expo.dev).
- Open that URL **in Safari on the iPhone** and tap install.
- If iOS says the app is from an untrusted developer: Settings → General →
  VPN & Device Management → your developer profile → Trust.

**Which profile?** `preview` (used above) bundles the JavaScript — the app runs
completely standalone, which is what you want for real testing (AirPods in,
phone locked in your pocket). The `development` profile instead loads JS from
your computer (`npx expo start --dev-client`) — great for iterating on app
code, useless away from your desk.

## 5. First run

1. Open the app → **Settings** tab → paste your Gemini API key → **Save** →
   **Test key** (should show "✓ Key works"). The key is stored only on the
   device, in the iOS secure enclave.
2. Pick your practice language (🇵🇱 🇪🇸 🇫🇷 🇬🇧) and check that **Speak
   corrections aloud** is on (it is by default).
3. Put in your AirPods → **Session** tab → **Start session** → grant the
   microphone permission when asked.
4. Say something with a deliberate mistake (Polish: *"Szukam mój telefon"*).
   Within a couple of seconds you should hear *"Mówi się: szukam mojego
   telefonu"* in the AirPods and see the correction card on screen.

## 6. Verify the native behaviors

These are the things unit tests can't cover — check all three:

1. **Lock-screen capture** — start a session, lock the phone, keep talking.
   Unlock: the utterance counter must have kept climbing.
2. **AirPods duplex** — after a spoken correction, the mic must still be live
   for your next sentence, and the app must never "correct" its own voice.
3. **Logging** — mistakes appear in **History** with correction, explanation,
   and the session's language flag; the session cost badge increments.

## 7. Updating the app later

```sh
git pull
eas build --profile preview --platform ios   # then reinstall from the new URL
```

For rapid JS-only iteration, build the `development` profile once and use
`npx expo start --dev-client` — code changes reload instantly without
rebuilding.

## 8. Sharing with other testers (TestFlight)

When you want friends testing without registering each phone's device ID:

```sh
eas build --profile production --platform ios
eas submit --platform ios
```

Then add testers in App Store Connect → TestFlight → Internal Testing. They
install via the TestFlight app; no device registration needed. (Public/external
TestFlight and the App Store itself involve Apple review — see the roadmap
notes in the README about the backend proxy before any public release.)

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails during the credentials step | Usually an expired Apple session or 2FA prompt gone wrong. Re-run `eas build` and complete the interactive Apple login; `eas credentials` lets you inspect/reset what EAS manages. |
| Install page says the device isn't eligible / app won't install | The iPhone's UDID wasn't registered before the build. Run `eas device:create` on that phone, then rebuild. |
| Tapping the install link does nothing | It must be opened in **Safari** on the iPhone — Chrome and in-app browsers won't trigger the install. |
| App installed but won't open ("Untrusted Developer") | Settings → General → VPN & Device Management → trust your developer profile. |
| Correction audio plays from the phone speaker, not AirPods | iOS routed output to the phone. With AirPods connected, use Control Center's audio output picker to select them, then restart the session. |
| Session stops when the phone locks | Microphone permission was denied or restricted. iOS Settings → Conjugation Feedback → enable Microphone, then start a new session. |
| "Test key" fails in Settings | Key mistyped/revoked, or the Generative Language API isn't enabled for it — create a fresh key at aistudio.google.com. |
