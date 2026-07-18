# Conjugation Feedback

Real-time grammar feedback for Polish learners. Wear AirPods during a real
conversation in Polish; the app listens continuously, detects grammatical
mistakes (conjugation, case, gender, aspect), logs each mistake with the
correction and a short explanation — and, when the verbal-feedback toggle is on
(default), immediately speaks the correction into your AirPods:
*„Mówi się: szukam mojego telefonu."*

Polish, Spanish, French, and English are supported (pick in Settings); the
architecture keeps more languages, other LLM providers, and a future
backend/OAuth path open. Runs on iOS and Android, with background listening on
both (iOS background audio; Android foreground service).

The coach is deliberately **polite**: spoken corrections wait for a
conversational lull, identical repeats are muted (logged with an "again ×N"
counter), at most 6 corrections are spoken per 10 minutes (then it downgrades
to a soft chime), and corrections that miss their moment are logged instead of
spoken late. A chime-only and a silent mode exist for low-interruption use.
Beyond the live session: a **Practice tab** drills you on your own recent
mistakes, **History** shows your grammar fingerprint (real minutes spoken,
error-type trends, recurring mistakes) plus **vocabulary gaps** — words you
were missing mid-conversation, mined automatically when you circumlocute or
code-switch.

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
- **Background capture** via `@siteed/audio-studio`: real-time PCM streaming
  plus an Android foreground service (persistent notification) and an iOS
  background audio session, so a session survives the screen locking. All of
  it is isolated behind `src/audio/AudioCapture.ts`.

## Repo layout

```
app/                 expo-router screens: Session | Practice | History | Settings
src/audio/           capture, energy VAD, utterance segmenter, WAV codec, one-shot drill capture
src/llm/             provider interface, GeminiProvider, prompt, response schema
src/pipeline/        SessionPipeline — orchestrates capture → check → speak → persist
src/db/              expo-sqlite schema/migrations/repo (node-testable)
src/store/           zustand stores (session state, settings)
src/languages/       per-language packs (prompt, TTS locale) + registry
src/tts/             expo-speech wrapper with the TTS mic-gate
dev/replay.ts        replay WAV fixtures through the real pipeline (prompt tuning)
fixtures/            recorded test clips + guidelines (see fixtures/README.md)
```

## Development

```sh
npm install --legacy-peer-deps
npm test            # 47 unit tests: VAD, segmenter, WAV, schema, provider, repo, cost, language packs
npm run typecheck
```

### Running on a device (required for real testing)

Continuous background mic capture needs a **dev/standalone build** (not Expo
Go). A Mac is *not* required — builds run in the EAS cloud, and Android needs no
Apple account. See **[BUILD.md](./BUILD.md)** for the full iOS + Android build
steps and the on-device verification checklist, and
**[DEPLOY-IOS.md](./DEPLOY-IOS.md)** for the step-by-step iPhone walkthrough
(signing, install, troubleshooting).

### Tuning the grammar checker

The per-language prompts in `src/languages/` are the highest-iteration files in
the repo. Record fixture WAVs (see `fixtures/README.md`), then:

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
