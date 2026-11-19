/*
 * Pitch shift for KookTube. One output sample is produced for every input
 * sample, so the video keeps its speed. A phase vocoder moves the partials
 * onto the transposed pitch. A shift of 0 copies the input straight through,
 * with no added delay.
 */
class KookTubePitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'semitones',
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automationRate: 'k-rate',
    }];
  }

  constructor() {
    super();
    const n = 2048;
    this.fftSize = n;
    this.hop = n >> 2;
    this.window = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
    }
    let cola = 0;
    for (let i = 0; i < this.hop; i++) {
      let sum = 0;
      for (let j = i; j < n; j += this.hop) sum += this.window[j] * this.window[j];
      if (sum > cola) cola = sum;
    }
    // The shifted path comes out quieter than the dry path; this brings a
    // transposed tone back to about the same level.
    this.scale = (cola > 0 ? 1 / cola : 1) * 1.45;

    this.inRing = [new Float32Array(n), new Float32Array(n)];
    this.ola = [new Float32Array(n), new Float32Array(n)];
    this.queue = [new Float32Array(n), new Float32Array(n)];
    this.lastPhase = [new Float32Array(n), new Float32Array(n)];
    this.sumPhase = [new Float32Array(n), new Float32Array(n)];
    this.synMag = new Float32Array((n >> 1) + 1);
    this.synFreq = new Float32Array((n >> 1) + 1);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.inWrite = 0;
    this.filled = 0;
    this.sinceHop = 0;
    this.qRead = [0, 0];
    this.qWrite = [0, 0];
    this.qCount = [0, 0];
    this.mix = 0;
    this.slew = 1 - Math.exp(-1 / (sampleRate * 0.03));
    this.wasDry = true;
  }

  resetVocoder() {
    this.ola[0].fill(0);
    this.ola[1].fill(0);
    this.lastPhase[0].fill(0);
    this.lastPhase[1].fill(0);
    this.sumPhase[0].fill(0);
    this.sumPhase[1].fill(0);
    this.qCount[0] = 0;
    this.qCount[1] = 0;
    this.qRead[0] = 0;
    this.qRead[1] = 0;
    this.qWrite[0] = 0;
    this.qWrite[1] = 0;
    this.sinceHop = 0;
  }

  synthesize(channel, ratio) {
    const n = this.fftSize;
    const hop = this.hop;
    const re = this.re;
    const im = this.im;
    const ring = this.inRing[channel];
    let read = this.inWrite;
    for (let i = 0; i < n; i++) {
      re[i] = ring[read] * this.window[i];
      im[i] = 0;
      read++;
      if (read === n) read = 0;
    }
    fft(re, im, false);

    const expct = (2 * Math.PI * hop) / n;
    const last = this.lastPhase[channel];
    const sum = this.sumPhase[channel];
    const synMag = this.synMag;
    const synFreq = this.synFreq;
    const half = n >> 1;
    synMag.fill(0);
    synFreq.fill(0);
    for (let k = 0; k <= half; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const phase = Math.atan2(im[k], re[k]);
      let delta = phase - last[k];
      last[k] = phase;
      delta -= k * expct;
      delta -= 2 * Math.PI * Math.round(delta / (2 * Math.PI));
      const freqBin = k + delta / expct;
      const dest = Math.round(freqBin * ratio);
      if (dest < 0 || dest > half) continue;
      if (mag > synMag[dest]) {
        synMag[dest] = mag;
        synFreq[dest] = freqBin * ratio;
      }
    }

    for (let k = 0; k <= half; k++) {
      sum[k] += synFreq[k] * expct;
      const mag = synMag[k];
      re[k] = mag * Math.cos(sum[k]);
      im[k] = mag * Math.sin(sum[k]);
    }
    for (let k = 1; k < half; k++) {
      re[n - k] = re[k];
      im[n - k] = -im[k];
    }
    fft(re, im, true);

    const ola = this.ola[channel];
    const scale = this.scale;
    const win = this.window;
    for (let i = 0; i < n; i++) ola[i] += re[i] * win[i] * scale;

    const queue = this.queue[channel];
    let w = this.qWrite[channel];
    for (let i = 0; i < hop; i++) {
      queue[w] = ola[i];
      w++;
      if (w === n) w = 0;
    }
    this.qWrite[channel] = w;
    this.qCount[channel] += hop;
    ola.copyWithin(0, hop, n);
    ola.fill(0, n - hop, n);
  }

  pop(channel) {
    if (this.qCount[channel] <= 0) return 0;
    const q = this.queue[channel];
    const r = this.qRead[channel];
    const sample = q[r];
    this.qRead[channel] = r + 1 === this.fftSize ? 0 : r + 1;
    this.qCount[channel]--;
    return sample;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !input[0] || !output || !output.length) return true;

    const semitones = parameters.semitones[0] || 0;
    const shifting = Math.abs(semitones) >= 0.001;
    const ratio = shifting ? Math.pow(2, semitones / 12) : 1;
    const targetMix = shifting ? 1 : 0;
    if (shifting && this.wasDry) {
      this.resetVocoder();
      this.wasDry = false;
    }
    if (!shifting) this.wasDry = true;

    const nch = Math.min(2, input.length, output.length);
    const len = input[0].length;
    const n = this.fftSize;
    const slew = this.slew;

    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nch; c++) this.inRing[c][this.inWrite] = input[c][i];
      this.inWrite++;
      if (this.inWrite === n) this.inWrite = 0;
      if (this.filled < n) this.filled++;
      this.sinceHop++;

      if (shifting && this.filled >= n && this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        for (let c = 0; c < nch; c++) this.synthesize(c, ratio);
      }

      this.mix += (targetMix - this.mix) * slew;
      const mix = this.mix;
      const dry = 1 - mix;
      const wet0 = mix > 0.0005 ? this.pop(0) : 0;
      const wet1 = nch > 1 && mix > 0.0005 ? this.pop(1) : wet0;
      output[0][i] = input[0][i] * dry + wet0 * mix;
      if (output.length > 1) {
        const in1 = nch > 1 ? input[1][i] : input[0][i];
        output[1][i] = in1 * dry + wet1 * mix;
      }
    }
    return true;
  }
}

function fft(re, im, inverse) {
  const n = re.length;
  if (inverse) {
    for (let i = 0; i < n; i++) im[i] = -im[i];
  }
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
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] = -im[i] / n;
    }
  }
}

registerProcessor('kooktube-pitch', KookTubePitchProcessor);
