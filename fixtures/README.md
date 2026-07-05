# Fixtures

Recorded WAV clips used to iterate on the grammar-checking prompt without
speaking live. Run them through the real pipeline with:

```sh
GEMINI_API_KEY=... npm run replay -- fixtures/your-clip.wav
```

## Recording guidelines

- 16-bit PCM WAV, mono, ideally 16 kHz (other rates are accepted).
- Record through **actual AirPods** on the phone when possible, so microphone
  coloration matches production (Voice Memos → AirPods input → export → convert
  with `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 out.wav`).
- One utterance (or a short exchange) per file, with ~1 s of silence before and
  after so the VAD has context.

## What to cover (target ~15–20 clips)

| Category | Examples | Expected verdict |
|---|---|---|
| Correct sentences | "Wczoraj poszedłem do kina." | no error |
| Conjugation errors | "Ja chcieć kupić bilet." | error: conjugation |
| Case errors | "Szukam mój telefon." | error: case |
| Gender/past-tense agreement | male speaker: "widziałam ten film" | error: gender |
| Aspect errors | "Jutro czytałem książkę." | error: aspect |
| **Colloquial but correct** | "Kupiłem se kebaba, no i git." | **no error** (critical: false-positive guard) |
| Fillers/fragments | "No wiesz... do sklepu." | no error |
| Background speaker | partner's voice, distant | `speaker_is_primary: false`, no error |

Name files `<verdict>-<slug>.wav`, e.g. `ok-colloquial-se.wav`,
`err-case-szukam.wav`, `ignore-background-partner.wav`.

Corrections the app got wrong in real sessions (long-press → "mark as wrong
correction" in History) are the best source of new fixtures.
