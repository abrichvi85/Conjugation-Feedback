# Conjugation Feedback

Real-time grammar feedback for Polish learners. Wear AirPods during a real
conversation in Polish; the app listens continuously, detects grammatical
mistakes (conjugation, case, gender, aspect), logs each mistake with the
correction and a short explanation — and, when the verbal-feedback toggle is on
(default), immediately speaks the correction into your AirPods:
*„Mówi się: szukam mojego telefonu."*

Polish first; the architecture keeps other languages, other LLM providers, and
a future backend/OAuth path open.

## How it works

```
AirPods mic ──► AudioCapture (16 kHz PCM)
                  └► EnergyVad + UtteranceSegmenter   (only speech is sent — cost guardrail)
                        └► GeminiProvider.checkUtterance(WAV)
                             Gemini 3.1 Flash-Lite, structured JSON output:
                             transcript · errors · corrected sentence · short feedback phrase
                               ├► SQLite log (History tab)
                               └► expo-speech TTS → AirPods   (mic gated while speaking)
```

Key design decisions:

- **Audio goes straight to Gemini** (multimodal audio input) — no separate STT
  service. One VAD-segmented `generateContent` call per utterance; the radio
  sleeps between utterances. An hour-long conversation costs pennies.
- **Precision over recall** in the prompt: colloquial-but-correct Polish,
  fillers, and fragments are never flagged; the conversation partner's distant
  voice is ignored (`speaker_is_primary`).
- **BYO Gemini API key**, stored in the device secure enclave
  (`expo-secure-store`). The `LlmProvider`/`CredentialsSource` abstraction in
  `src/llm/types.ts` is where a ChatGPT-OAuth or backend-proxy provider plugs
  in later without rearchitecting.
- **No raw audio is stored.** Only transcripts and corrections go to SQLite.

## Repo layout

```
app/                 expo-router screens: Session | History | Settings
src/audio/           capture, energy VAD, utterance segmenter, WAV codec
src/llm/             provider interface, GeminiProvider, prompt, response schema
src/pipeline/        SessionPipeline — orchestrates capture → check → speak → persist
src/db/              expo-sqlite schema/migrations/repo (node-testable)
src/store/           zustand stores (session state, settings)
src/tts/             expo-speech wrapper with the TTS mic-gate
dev/replay.ts        replay WAV fixtures through the real pipeline (prompt tuning)
fixtures/            recorded test clips + guidelines (see fixtures/README.md)
plugins/             config plugin guarding the AVAudioSession Bluetooth setup
```

## Development

```sh
npm install --legacy-peer-deps
npm test            # 40 unit tests: VAD, segmenter, WAV, schema, provider, repo, cost
npm run typecheck
```

### Running on a device (required for real testing)

Continuous background mic capture needs a **development build** — Expo Go will
not work. A Mac is *not* required if you use EAS cloud builds; you only need an
[expo.dev](https://expo.dev) account and an Apple Developer account:

```sh
npx eas-cli login
npx eas-cli build --profile development --platform ios   # install on your iPhone
npx expo start --dev-client
```

Then on the phone: Settings tab → paste your Gemini API key (from
[aistudio.google.com](https://aistudio.google.com)) → Test key → Session tab →
put in AirPods → Start session.

**On-device checks that matter most** (can't be covered by unit tests):
1. Start a session, lock the phone, keep talking — the utterance counter must
   keep climbing (`UIBackgroundModes: audio`).
2. Trigger a correction — TTS must play in the AirPods while the mic stays
   live afterward (AVAudioSession `playAndRecord` + Bluetooth).
3. Phone call / AirPods disconnect mid-session — the session should fail soft
   (stop/restart is acceptable at this stage).

### Tuning the grammar checker

The prompt in `src/llm/prompt.ts` is the highest-iteration file in the repo.
Record fixture WAVs (see `fixtures/README.md`), then:

```sh
GEMINI_API_KEY=... npm run replay -- fixtures/*.wav
```

Aim for **zero false positives** on the colloquial fixtures before worrying
about recall. In the app, long-press a correction in History to mark it as
wrong — those become new fixtures.

## Roadmap (post-MVP)

- Backend proxy + subscription (required before public App Store release —
  Apple is inconsistent about BYO-key-only apps), consent screen, privacy
  policy, App Privacy labels.
- Silero VAD (onnxruntime) if energy VAD misfires in noisy places; cloud TTS
  voices; log export/Anki; Android; more languages; Gemini Live API mode;
  "Sign in with ChatGPT" when it becomes generally available.
