'use strict';

/** In-place radix-2 DFT. Same numerical path as worklet.js. */
function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const j = i + k + half;
        const vRe = re[j] * wRe - im[j] * wIm;
        const vIm = re[j] * wIm + im[j] * wRe;
        const uRe = re[i + k];
        const uIm = im[i + k];
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[j] = uRe - vRe;
        im[j] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function blackman(n, N) {
  const a = (2 * Math.PI * n) / (N - 1);
  return 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
}

const N = 32768;
const re = new Float64Array(N);
const im = new Float64Array(N);
const window = new Float32Array(N);
for (let i = 0; i < N; i++) window[i] = blackman(i, N);

/** Blackman window, FFT, magnitude / N, dB. `samples` length must be 32768. */
function spectrumDb(samples) {
  for (let i = 0; i < N; i++) {
    re[i] = samples[i] * window[i];
    im[i] = 0;
  }
  fftRadix2(re, im);
  const db = new Float32Array(N >> 1);
  for (let k = 0; k < db.length; k++) {
    const mag = Math.hypot(re[k], im[k]) / N;
    db[k] = mag > 1e-12 ? 20 * Math.log10(mag) : -240;
  }
  return db;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

module.exports = {
  fftRadix2: fftRadix2,
  blackman: blackman,
  spectrumDb: spectrumDb,
  mulberry32: mulberry32,
  gaussian: gaussian,
  FFT_SIZE: N,
};
