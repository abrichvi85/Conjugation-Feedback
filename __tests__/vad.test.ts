import { EnergyVad, rms } from '@/audio/vad';

const SAMPLE_RATE = 16000;
const FRAME = 512; // 32 ms

function silentFrame(noise = 50): Int16Array {
  const f = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = Math.round((Math.sin(i * 12.9898) * 43758.5453) % noise);
  return f;
}

function loudFrame(amplitude = 8000): Int16Array {
  const f = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = Math.round(amplitude * Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * 220));
  return f;
}

describe('EnergyVad', () => {
  it('computes rms', () => {
    expect(rms(new Int16Array(FRAME))).toBe(0);
    expect(rms(loudFrame())).toBeGreaterThan(4000);
  });

  it('triggers speech-start after onsetFrames loud frames', () => {
    const vad = new EnergyVad({ sampleRate: SAMPLE_RATE, onsetFrames: 3 });
    for (let i = 0; i < 20; i++) expect(vad.processFrame(silentFrame())).toBeNull();

    expect(vad.processFrame(loudFrame())).toBeNull();
    expect(vad.processFrame(loudFrame())).toBeNull();
    expect(vad.processFrame(loudFrame())).toBe('speech-start');
    expect(vad.isSpeech).toBe(true);
  });

  it('ends speech only after the hangover elapses', () => {
    const vad = new EnergyVad({ sampleRate: SAMPLE_RATE, onsetFrames: 2, hangoverMs: 200 });
    for (let i = 0; i < 10; i++) vad.processFrame(silentFrame());
    vad.processFrame(loudFrame());
    vad.processFrame(loudFrame());
    expect(vad.isSpeech).toBe(true);

    // 200 ms hangover = ~6.25 frames of 32 ms; brief pause must NOT end speech
    for (let i = 0; i < 4; i++) expect(vad.processFrame(silentFrame())).toBeNull();
    vad.processFrame(loudFrame()); // speech resumes, hangover resets
    expect(vad.isSpeech).toBe(true);

    let ended = false;
    for (let i = 0; i < 10 && !ended; i++) ended = vad.processFrame(silentFrame()) === 'speech-end';
    expect(ended).toBe(true);
    expect(vad.isSpeech).toBe(false);
  });

  it('adapts the noise floor so steady background does not trigger', () => {
    const vad = new EnergyVad({ sampleRate: SAMPLE_RATE, minThreshold: 500 });
    // steady moderate noise well below minThreshold — never speech
    for (let i = 0; i < 100; i++) {
      expect(vad.processFrame(silentFrame(100))).toBeNull();
    }
    expect(vad.isSpeech).toBe(false);
  });
});
