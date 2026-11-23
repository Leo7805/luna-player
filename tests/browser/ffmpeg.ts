import { BrowserFfmpegService } from '../../src/services/ffmpegService';

const engine = new BrowserFfmpegService(15_000);
// A short PCM WAV provides real local input without a binary fixture download.
const wav = new ArrayBuffer(44 + 8000 * 2);
const view = new DataView(wav);
const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
text(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE');
text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 16000, true);

const verification = {
  initialize: () => engine.initialize(),
  terminate: () => engine.terminate(),
  encode: async (format: 'mp3' | 'webm') => (await engine.extractAudio(new File([wav], 'local.wav'), format)).data.length,
};
declare global { interface Window { ffmpegVerification: typeof verification; } }
window.ffmpegVerification = verification;

// Reproduce the former direct-URL lifecycle independently of the fixed service.
const legacyVerification = {
  async create() {
    const [{ FFmpeg }, core, wasm] = await Promise.all([
      import('@ffmpeg/ffmpeg'), import('@ffmpeg/core?url'), import('@ffmpeg/core/wasm?url'),
    ]);
    const instance = new FFmpeg();
    const config = { coreURL: new URL(core.default, location.href).href, wasmURL: new URL(wasm.default, location.href).href };
    await instance.load(config);
    return {
      terminate: () => instance.terminate(),
      initialize: () => instance.load(config),
    };
  },
};
declare global { interface Window { legacyVerification: typeof legacyVerification; legacyEngine: Awaited<ReturnType<typeof legacyVerification.create>>; } }
window.legacyVerification = legacyVerification;
