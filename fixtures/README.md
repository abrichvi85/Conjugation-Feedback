# Fixtures

Recorded WAV clips used to iterate on the grammar-checking prompts without
speaking live. One subfolder per language (`fixtures/pl/`, `fixtures/es/`).
Run them through the real pipeline with:

```sh
GEMINI_API_KEY=... npm run replay -- fixtures/pl/your-clip.wav
GEMINI_API_KEY=... REPLAY_LANGUAGE=es npm run replay -- fixtures/es/*.wav
```

## Recording guidelines

- 16-bit PCM WAV, mono, ideally 16 kHz (other rates are accepted).
- Record through **actual AirPods** on the phone when possible, so microphone
  coloration matches production (Voice Memos → AirPods input → export → convert
  with `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 out.wav`).
- One utterance (or a short exchange) per file, with ~1 s of silence before and
  after so the VAD has context.
- New-language checklist: a language ships only after its fixture set exists
  and replay shows **zero false positives** on the colloquial clips. The
  colloquial/regionalism examples must come from (or be reviewed by) a fluent
  speaker — they are the false-positive guard.

## What to cover (target ~15–20 clips per language)

### Polish (`fixtures/pl/`)

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

### Spanish (`fixtures/es/`)

| Category | Examples | Expected verdict |
|---|---|---|
| Correct sentences | "Ayer fui al cine con mi hermana." | no error |
| Conjugation errors | "Yo querer comprar un billete." | error: conjugation |
| Ser/estar | "Estoy cansado de ser en casa." | error: word_choice |
| Gender/number agreement | "La problema es complicado." | error: gender |
| Missing subjunctive | "Quiero que vienes a la fiesta." | error: conjugation |
| **Colloquial but correct** | "Pues nada, aquí andamos, currando." | **no error** (critical: false-positive guard) |
| **Regional variants** | voseo: "¿Vos tenés tiempo?" | **no error** (all varieties are correct) |
| Fillers/fragments | "Bueno, o sea... a la tienda." | no error |
| Background speaker | partner's voice, distant | `speaker_is_primary: false`, no error |

### French (`fixtures/fr/`)

| Category | Examples | Expected verdict |
|---|---|---|
| Correct sentences | "Hier, je suis allé au cinéma." | no error |
| Conjugation errors | "Je vouloir acheter un billet." | error: conjugation |
| Passé composé auxiliary | "J'ai allé au cinéma." | error: conjugation |
| Gender/article agreement | "Le voiture est rapide." | error: gender |
| Missing subjunctive | "Il faut que tu viens." | error: conjugation |
| **Colloquial but correct** | "Bah j'sais pas, c'est pas grave quoi." | **no error** (dropped "ne" is correct spoken French) |
| **Regional variants** | "Ça coûte septante euros." | **no error** (Belgian/Swiss/Quebec French is correct) |
| Fillers/fragments | "Ben... au magasin, du coup." | no error |
| Background speaker | partner's voice, distant | `speaker_is_primary: false`, no error |

Name files `<verdict>-<slug>.wav`, e.g. `ok-colloquial-se.wav`,
`err-case-szukam.wav`, `ignore-background-partner.wav`.

Corrections the app got wrong in real sessions (long-press → "mark as wrong
correction" in History) are the best source of new fixtures.
