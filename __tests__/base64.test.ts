import { base64Decode, base64Encode } from '@/utils/base64';

describe('base64', () => {
  it('matches known vectors', () => {
    expect(base64Encode(new Uint8Array([]))).toBe('');
    expect(base64Encode(new TextEncoder().encode('f'))).toBe('Zg==');
    expect(base64Encode(new TextEncoder().encode('fo'))).toBe('Zm8=');
    expect(base64Encode(new TextEncoder().encode('foo'))).toBe('Zm9v');
    expect(base64Encode(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
  });

  it('round-trips binary data', () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 13) % 256;
    expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
  });

  it('agrees with Buffer', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    const encoded = Buffer.from(bytes).toString('base64');
    expect(base64Decode(encoded)).toEqual(bytes);
  });
});
