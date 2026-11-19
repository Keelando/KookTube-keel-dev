'use strict';

const api = require('../content.js');
const fft = require('./fft.js');

const SR = 48000;
const N = fft.FFT_SIZE;
const HOP = 0.2;
const buf = new Float64Array(N);

const rows = [];
let failed = 0;

function assertCase(name, ok, detail) {
  if (!ok) {
    failed++;
    console.error('FAIL', name, detail);
  }
}

function tuningOfA(a4) {
  return 1200 * Math.log2(a4 / 440);
}

function placeFreq(absBin, tuningCents, lo, hi) {
  let f = api.C4 * Math.pow(2, (absBin * 50 + tuningCents) / 1200);
  while (f < lo) f *= 2;
  while (f > hi) f /= 2;
  return f;
}

function runSignal(sampleAt, duration) {
  const state = api.createAnalysisState();
  const start = N / SR;
  for (let t = start; t < duration; t += HOP) {
    for (let i = 0; i < N; i++) {
      const time = t - (N - 1 - i) / SR;
      buf[i] = time < 0 ? 0 : sampleAt(time);
    }
    api.pushSpectrumFrame(state, fft.spectrumDb(buf), SR, N, HOP);
  }
  return state;
}

function chordSample(tuningCents, partials, ampScale) {
  const chords = [
    [0, 4, 7, 12],
    [5, 9, 12, 17],
    [7, 11, 14, 19],
    [0, 4, 7, 12],
  ];
  return function (time) {
    const index = Math.min(7, Math.floor(time / 3));
    const notes = chords[index % 4];
    let s = 0;
    for (let n = 0; n < notes.length; n++) {
      const freq = api.C4 * Math.pow(2, (notes[n] + tuningCents / 100) / 12);
      const amp = (n === 0 ? 1 : 0.72) * ampScale;
      for (let h = 1; h <= partials; h++) {
        s += (amp / Math.sqrt(h)) * Math.sin(2 * Math.PI * freq * h * time);
      }
    }
    return s;
  };
}

function record(name, expected, state, mode, trueTuning) {
  const result = api.analyzeState(state, mode);
  const got = result.best ? result.best.name : '(none)';
  const system = result.system;
  const tuning = result.tuningCents;
  const okName = got === expected.name;
  const okSystem = !expected.system || system === expected.system;
  const okTune = trueTuning == null || Math.abs(tuning - trueTuning) <= 5;
  const ok = okName && okSystem && okTune;
  rows.push({
    name: name,
    expected: expected.name + (expected.system ? ' [' + expected.system + ']' : ''),
    got: got + ' [' + system + ']',
    tuning: tuning.toFixed(1),
    trueTuning: trueTuning == null ? '' : trueTuning.toFixed(1),
    ratio: result.ratio.toFixed(3),
    peak: Number.isFinite(result.peakRatio) ? result.peakRatio.toFixed(2) : 'inf',
    quarter: result.quarterSignificant ? 'yes' : 'no',
    confidence: result.confidence,
    ok: ok,
  });
  assertCase(name, ok, JSON.stringify(rows[rows.length - 1]));
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + ' → ' + got + '  tuning ' + tuning.toFixed(1) + '¢');
}

function persianSample(mode, tonicBin, tuningCents) {
  const melody = [];
  const seq = mode.steps.concat(mode.steps.slice(1, -1).reverse());
  let cursor = 0;
  let guard = 0;
  while (cursor < 16 && guard < 400) {
    const step = seq[guard % seq.length];
    const hold = step.role === 'tonic' || step.role === 'color' || step.role === 'fifth' ? 0.58 : 0.34;
    melody.push({ abs: (tonicBin + step.step) % 24, t0: cursor, t1: cursor + hold, amp: step.role === 'degree' ? 0.34 : 0.5 });
    cursor += hold;
    guard++;
  }
  const duration = cursor;
  const drone = placeFreq(tonicBin, tuningCents, 90, 180);
  const melodyFreq = melody.map(function (event) {
    return placeFreq(event.abs, tuningCents, 220, 520);
  });
  return {
    duration: duration,
    sample: function (time) {
      let s = 0.2 * Math.sin(2 * Math.PI * drone * time);
      for (let i = 0; i < melody.length; i++) {
        const event = melody[i];
        if (time >= event.t0 && time < event.t1) {
          s += event.amp * Math.sin(2 * Math.PI * melodyFreq[i] * time);
        }
      }
      return s;
    },
  };
}

function pad(text, width) {
  text = String(text);
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

console.log('Synthesising and analysing. This takes a minute.');

[440, 432, 430, 446].forEach(function (a4) {
  const offset = tuningOfA(a4);
  const state = runSignal(chordSample(offset, 1, 0.22), 24);
  record('C major A=' + a4 + ' auto', { name: 'C Major', system: 'western' }, state, 'auto', offset);
  record('C major A=' + a4 + ' western', { name: 'C Major', system: 'western' }, state, 'western', offset);
});

{
  const state = runSignal(chordSample(0, 16, 0.12), 24);
  record('C major bright auto', { name: 'C Major', system: 'western' }, state, 'auto', 0);
}

{
  const rand = fft.mulberry32(1);
  const tone = chordSample(0, 16, 0.2);
  const state = runSignal(function (time) {
    return tone(time) + fft.gaussian(rand);
  }, 24);
  record('C major noise auto', { name: 'C Major', system: 'western' }, state, 'auto', null);
}

const persianCases = [
  { id: 'shur', tonic: 14, label: 'G Shur' },
  { id: 'homayoun', tonic: 0, label: 'C Homayoun' },
  { id: 'chahargah', tonic: 0, label: 'C Chahargah' },
  { id: 'esfahan', tonic: 14, label: 'G Bayat-e Esfahan' },
  { id: 'segah', tonic: 7, label: 'E-koron Segah' },
];

persianCases.forEach(function (item) {
  const mode = api.PERSIAN_MODES.find(function (entry) { return entry.id === item.id; });
  [440, 432].forEach(function (a4) {
    const offset = tuningOfA(a4);
    const phrase = persianSample(mode, item.tonic, offset);
    const state = runSignal(phrase.sample, phrase.duration);
    const tag = item.label + ' A=' + a4;
    record(tag + ' persian', { name: item.label, system: 'persian' }, state, 'persian', offset);
    record(tag + ' auto', { name: item.label, system: 'persian' }, state, 'auto', offset);
  });
});

{
  const mahur = api.PERSIAN_MODES.find(function (entry) { return entry.id === 'mahur'; });
  const phrase = persianSample(mahur, 0, 0);
  const state = runSignal(phrase.sample, phrase.duration);
  record('C Mahur forced persian', { name: 'C Mahur', system: 'persian' }, state, 'persian', 0);
}

function unit(name, ok, detail) {
  rows.push({
    name: name,
    expected: 'pass',
    got: ok ? 'pass' : 'fail',
    tuning: '',
    trueTuning: '',
    ratio: '',
    peak: '',
    quarter: '',
    confidence: detail || '',
    ok: ok,
  });
  assertCase(name, ok, detail || '');
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
}

function fineFrom(notes) {
  const fine = new Float64Array(api.FINE_BINS);
  notes.forEach(function (note) { api.addCents(fine, note[0], note[1]); });
  return fine;
}

{
  const fine = fineFrom([
    [0, 5], [200, 5], [300, 5], [500, 5], [700, 5], [800, 5], [1000, 5], [150, 4],
  ]);
  for (let j = 0; j < fine.length; j++) {
    const dev = ((j * 10 + 50) % 100) - 50;
    if (Math.abs(Math.abs(dev) - 50) < 15) fine[j] += 0.55;
  }
  const got = api.estimateTuningCents(fine);
  unit('weak quarter-tone bins do not flip tuning', Math.abs(got) < 8, 'got ' + got.toFixed(2));
}

{
  const segah = [[50, 12], [0, 2], [500, 2.2], [700, 2], [1000, 2], [150, 2.4], [350, 2.5]];
  const got = api.estimateTuningCents(fineFrom(segah));
  unit('loud koron tonic stays on the semitone grid', Math.abs(got) < 8, 'got ' + got.toFixed(2));
}

{
  const detuned = [];
  [0, 200, 400, 500, 700, 900, 1100].forEach(function (cents) { detuned.push([cents - 32, 3]); });
  detuned.push([18, 9]);
  const got = api.estimateTuningCents(fineFrom(detuned));
  unit('detuned semitone cluster beats one loud koron', Math.abs(got + 32) < 8, 'got ' + got.toFixed(2));
}

{
  const chroma = new Float64Array(24);
  chroma[0] = 2;
  chroma[1] = 1;
  chroma[2] = 4;
  chroma[23] = 3;
  const folded = api.foldToTwelve(chroma);
  const sum24 = 2 + 1 + 4 + 3;
  const sum12 = folded.reduce(function (a, b) { return a + b; }, 0);
  unit('foldToTwelve conserves energy', Math.abs(sum24 - sum12) < 1e-9, 'sum24 ' + sum24 + ' sum12 ' + sum12);
  unit(
    'foldToTwelve splits the odd bin',
    Math.abs(folded[0] - (2 + 0.5 * 1 + 0.5 * 3)) < 1e-9 && Math.abs(folded[1] - (4 + 0.5 * 1)) < 1e-9,
    'C ' + folded[0] + ' C# ' + folded[1]
  );
}

function moments(dev, weight) {
  const ang = (dev / 100) * 2 * Math.PI;
  return api.tuningCentsFromMoments(weight * Math.sin(ang), weight * Math.cos(ang));
}
[48, -48].forEach(function (dev) {
  const got = moments(dev, 3);
  unit('tuning wrap ' + dev + '¢', Math.abs(got - dev) < 1e-6, 'got ' + got.toFixed(3));
});

{
  const freq = api.C4;
  const seventh = freq * 7;
  function tone(time) {
    return 0.5 * Math.sin(2 * Math.PI * freq * time) + 0.18 * Math.sin(2 * Math.PI * seventh * time);
  }
  for (let i = 0; i < N; i++) buf[i] = tone(i / SR);
  const db = fft.spectrumDb(buf);
  const raw = api.pickPeaks(db, SR, N);
  const kept = api.suppressHarmonics(raw);
  const frame = new Float64Array(api.FINE_BINS);
  kept.forEach(function (peak) {
    api.addCents(frame, api.centsFromC(peak.freq), peak.amp);
  });
  const chroma = api.fineToChroma24(frame, 0);
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 24; i++) {
    if (i % 2) odd += chroma[i];
    else even += chroma[i];
  }
  const nearSeventh = kept.some(function (peak) {
    return Math.abs(1200 * Math.log2(peak.freq / seventh)) < 30;
  });
  unit(
    '7th harmonic removed from odd bins',
    !nearSeventh && even > 0 && odd / (odd + even) < 0.08,
    'oddShare ' + (odd / (odd + even + 1e-12)).toFixed(3) + ' kept ' + kept.length + ' raw ' + raw.length
  );
}

console.log('');
console.log(pad('case', 42) + pad('expected', 28) + pad('detected', 32) + pad('tuning', 10) + pad('true', 10) + pad('qRatio', 8) + pad('qPeak', 8) + 'quarter');
rows.forEach(function (row) {
  if (row.expected === 'pass') return;
  console.log(
    pad(row.name, 42) +
    pad(row.expected, 28) +
    pad(row.got, 32) +
    pad(row.tuning, 10) +
    pad(row.trueTuning, 10) +
    pad(row.ratio, 8) +
    pad(row.peak, 8) +
    row.quarter +
    (row.ok ? '' : '  FAIL')
  );
});

console.log(failed ? '\n' + failed + ' FAILED' : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
