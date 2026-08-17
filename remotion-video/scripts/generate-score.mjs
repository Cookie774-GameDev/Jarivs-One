import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(__dirname, '../public/vibespace-score.wav');
const sampleRate = 48000;
const duration = 36;
const channels = 2;
const frames = sampleRate * duration;
const dataBytes = frames * channels * 2;
const buffer = Buffer.allocUnsafe(44 + dataBytes);

const writeHeader = () => {
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
};

const smoothstep = (x) => {
  const v = Math.max(0, Math.min(1, x));
  return v * v * (3 - 2 * v);
};

let seed = 0x51f15e;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
};

const roots = [55, 65.406, 73.416, 82.407, 55, 65.406, 73.416, 55];
const transitions = [0, 4.4, 10.8, 16.2, 21.6, 27, 31.6];
const noteRatios = [1, 1.25, 1.5, 2, 1.5, 1.25, 2.5, 2];

const synth = (t, panPhase) => {
  let value = 0;

  for (let s = 0; s < roots.length; s++) {
    const start = s * 4.5 - 1.1;
    const end = (s + 1) * 4.5 + 1.1;
    if (t < start || t > end) continue;
    const envIn = smoothstep((t - start) / 1.4);
    const envOut = smoothstep((end - t) / 1.4);
    const env = Math.min(envIn, envOut);
    const root = roots[s];
    value += Math.sin(2 * Math.PI * root * t + panPhase * .15) * .048 * env;
    value += Math.sin(2 * Math.PI * root * 1.5 * t + .8 + panPhase * .3) * .034 * env;
    value += Math.sin(2 * Math.PI * root * 2.5 * t + 1.9 - panPhase * .2) * .018 * env;
    value += Math.sin(2 * Math.PI * root * .5 * t + .2) * .04 * env;
  }

  const beat = 1.5;
  const beatTime = t % beat;
  const kickEnv = Math.exp(-beatTime * 8.5);
  const kickFreq = 45 + 28 * Math.exp(-beatTime * 14);
  value += Math.sin(2 * Math.PI * kickFreq * beatTime) * .11 * kickEnv;

  const eighth = .75;
  const step = Math.floor(t / eighth);
  const pluckT = t - step * eighth;
  const rootIndex = Math.min(roots.length - 1, Math.floor(t / 4.5));
  const pluckFreq = roots[rootIndex] * 4 * noteRatios[step % noteRatios.length];
  const pluckEnv = Math.exp(-pluckT * 7.2) * smoothstep(pluckT / .008);
  value += Math.sin(2 * Math.PI * pluckFreq * pluckT + panPhase) * .026 * pluckEnv;
  value += Math.sin(2 * Math.PI * pluckFreq * 2.01 * pluckT) * .009 * pluckEnv;

  for (const hit of transitions) {
    const d = t - hit;
    if (d >= 0 && d < 1.7) {
      const env = Math.exp(-d * 3.4);
      value += Math.sin(2 * Math.PI * (68 - d * 13) * d) * .17 * env;
      value += noise() * .035 * Math.exp(-d * 12);
      value += Math.sin(2 * Math.PI * 880 * d + panPhase) * .017 * Math.exp(-d * 10);
    }
    const rise = hit - t;
    if (rise > 0 && rise < 1.1) {
      const e = smoothstep(1 - rise / 1.1);
      value += noise() * .008 * e * e;
      value += Math.sin(2 * Math.PI * (180 + (1.1 - rise) * 520) * t) * .008 * e;
    }
  }

  value += Math.sin(2 * Math.PI * 0.08 * t + panPhase) * .003;
  return value;
};

writeHeader();
for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const fadeIn = smoothstep(t / 1.2);
  const fadeOut = smoothstep((duration - t) / 1.5);
  const master = Math.min(fadeIn, fadeOut) * .86;
  const left = Math.tanh(synth(t, 0.35) * 1.35) * master;
  const right = Math.tanh(synth(t + .0009, 1.9) * 1.35) * master;
  buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(left * 32767))), 44 + i * 4);
  buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(right * 32767))), 46 + i * 4);
}

fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, buffer);
console.log(`Generated ${output} (${duration}s, ${sampleRate}Hz stereo)`);
