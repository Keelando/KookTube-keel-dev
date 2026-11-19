/*
 * Audio capture for KookTube. Runs on the audio thread so a background tab
 * still produces frames. Posts a Blackman-windowed magnitude spectrum
 * (linear magnitude / N, in dB) every 200 ms. Keep the FFT in sync with
 * test/fft.js and the copy in content.js.
 */
class KookTubeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = 32768;
    this.hop = Math.max(128, Math.round(sampleRate * 0.2));
    this.buf = new Float32Array(this.N);
    this.window = new Float32Array(this.N);
    this.write = 0;
    this.filled = 0;
    this.since = 0;
    for (let n = 0; n < this.N; n++) {
      const a = (2 * Math.PI * n) / (this.N - 1);
      this.window[n] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
    }
    this.re = new Float64Array(this.N);
    this.im = new Float64Array(this.N);
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || !channels.length || !channels[0]) return true;
    const nch = channels.length;
    const len = channels[0].length;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < nch; c++) s += channels[c][i] || 0;
      this.buf[this.write] = s / nch;
      this.write++;
      if (this.write === this.N) this.write = 0;
      if (this.filled < this.N) this.filled++;
      this.since++;
      if (this.since >= this.hop && this.filled === this.N) {
        this.since = 0;
        this.emit();
      }
    }
    return true;
  }

  emit() {
    const N = this.N;
    const re = this.re;
    const im = this.im;
    let read = this.write;
    for (let i = 0; i < N; i++) {
      re[i] = this.buf[read] * this.window[i];
      im[i] = 0;
      read++;
      if (read === N) read = 0;
    }
    fftRadix2(re, im);
    const half = N >> 1;
    const db = new Float32Array(half);
    for (let k = 0; k < half; k++) {
      const mag = Math.hypot(re[k], im[k]) / N;
      db[k] = mag > 1e-12 ? 20 * Math.log10(mag) : -240;
    }
    this.port.postMessage({ db: db, sampleRate: sampleRate, fftSize: N, dt: this.hop / sampleRate }, [db.buffer]);
  }
}

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

registerProcessor('kooktube-processor', KookTubeProcessor);
