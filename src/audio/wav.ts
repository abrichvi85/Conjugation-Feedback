// Minimal WAV (RIFF) encoding/decoding for 16-bit PCM mono.

export function pcmToWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const dataLength = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const out = new Uint8Array(buffer);
  const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  out.set(pcmBytes, 44);
  return out;
}

export interface DecodedWav {
  pcm: Int16Array;
  sampleRate: number;
}

/** Decodes 16-bit PCM WAV. Stereo is downmixed to mono by averaging. */
export function wavToPcm(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      const format = view.getUint16(offset + 8, true);
      if (format !== 1) throw new Error(`Unsupported WAV format code ${format} (need PCM)`);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || !sampleRate) throw new Error('Malformed WAV: missing fmt/data chunk');
  if (bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${bitsPerSample} (need 16)`);

  const sampleCount = Math.floor(dataLength / 2);
  const raw = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    raw[i] = view.getInt16(dataOffset + i * 2, true);
  }

  if (channels === 1) return { pcm: raw, sampleRate };
  if (channels === 2) {
    const mono = new Int16Array(Math.floor(sampleCount / 2));
    for (let i = 0; i < mono.length; i++) {
      mono[i] = Math.round((raw[i * 2] + raw[i * 2 + 1]) / 2);
    }
    return { pcm: mono, sampleRate };
  }
  throw new Error(`Unsupported channel count ${channels}`);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}
