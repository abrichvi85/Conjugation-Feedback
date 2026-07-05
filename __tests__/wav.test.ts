import { pcmToWav, wavToPcm } from '@/audio/wav';

describe('wav', () => {
  it('encodes a valid RIFF header', () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const wav = pcmToWav(pcm, 16000);
    expect(wav.length).toBe(44 + pcm.length * 2);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
  });

  it('round-trips PCM', () => {
    const pcm = new Int16Array(3200);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(10000 * Math.sin(i / 10));
    const decoded = wavToPcm(pcmToWav(pcm, 16000));
    expect(decoded.sampleRate).toBe(16000);
    expect(decoded.pcm).toEqual(pcm);
  });

  it('rejects non-WAV bytes', () => {
    expect(() => wavToPcm(new Uint8Array(64))).toThrow();
  });
});
