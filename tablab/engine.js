// TabLab sound engine. Everything here is synthesized with Web Audio: no samples, no voices, no libraries.
// Ideas ported from our Python beats (Sub Wall Protocol, DETONATOR.EXE, the fusion track).
(function () {
  'use strict';

  var SR = 44100;

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var KEYS = ['C', 'C sharp', 'D', 'E flat', 'E', 'F', 'F sharp', 'G', 'A flat', 'A', 'B flat', 'B'];
  var SCALE = [0, 2, 3, 5, 7, 8, 10];
  var CH = {
    m: [0, 3, 7], maj: [0, 4, 7], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m9: [0, 3, 7, 10, 14],
    add9: [0, 4, 7, 14], dom7: [0, 4, 7, 10], sus2: [0, 2, 7]
  };
  var PROGS = {
    subwall: [[8, 'maj7'], [10, 'add9'], [0, 'm9'], [7, 'm7']],
    detonator: [[8, 'maj7'], [10, 'maj'], [0, 'm9'], [7, 'm7']],
    dark: [[0, 'm'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
    sad: [[0, 'm9'], [5, 'm7'], [8, 'maj7'], [7, 'dom7']],
    rage: [[0, 'm'], [0, 'm'], [8, 'maj'], [10, 'maj']],
    float: [[0, 'm7'], [10, 'add9'], [8, 'maj7'], [3, 'maj7']],
    climb: [[5, 'm7'], [8, 'maj7'], [10, 'add9'], [0, 'm9']],
    rock: [[0, 'm'], [10, 'maj'], [8, 'maj'], [10, 'maj']]
  };

  var VIBES = {
    rage: {
      name: 'Rage', bpm: 150, lead: 'rage', keys: 'bell', progs: ['rage', 'dark', 'rock'],
      hats: 16, rolls: 0.7, chops: 0.3, glitch: 0.2, drive: 1.7, b808: 'rage', kick808: true,
      text: 'Rage: a buzzing distorted detuned synth arp, dark bell chords, a huge distorted 808 that bounces and slides, 16th hats with fast rolls'
    },
    digicore: {
      name: 'Digicore', bpm: 145, lead: 'pluck', keys: 'keys', progs: ['subwall', 'float', 'climb'],
      hats: 16, rolls: 0.5, chops: 0.65, glitch: 0.5, drive: 1.25, b808: 'bounce', kick808: false,
      text: 'Digicore: bright sparkly plucks with echoes, dreamy detuned keys, pitched up vowel chops, glitch stutters, a clean sliding 808'
    },
    hyperpop: {
      name: 'Hyperpop, SUPXR style', bpm: 155, lead: 'supersaw', keys: 'bellkeys', progs: ['detonator', 'subwall', 'climb'],
      hats: 16, rolls: 0.6, chops: 0.9, glitch: 0.45, drive: 1.9, b808: 'blown', kick808: true,
      text: 'Hyperpop, SUPXR style: a giant supersaw lead, shiny bell keys, lots of chipmunk vowel chops with pitch dives, a blown out 808'
    },
    trap: {
      name: 'Trap half-time', bpm: 140, lead: 'fmbell', keys: 'keys', progs: ['sad', 'dark', 'subwall'],
      hats: 8, rolls: 0.8, chops: 0.15, glitch: 0.05, drive: 1.35, b808: 'long', kick808: true,
      text: 'Trap half-time: a dark bell melody, soft keys, long deep 808 notes with slides, 8th hats with triplet and 32nd rolls, snare on 3'
    },
    glitch: {
      name: 'Glitchcore', bpm: 160, lead: 'crush', keys: 'bellkeys', progs: ['float', 'rage', 'dark'],
      hats: 16, rolls: 0.9, chops: 0.7, glitch: 1, drive: 2.1, b808: 'rage', kick808: true,
      text: 'Glitchcore: a bitcrushed square lead in 16th bursts, chops that glide, stutters and cut ups everywhere, a crunchy 808'
    }
  };

  var LENGTHS = {
    short: [['intro', 4], ['drop', 8], ['bridge', 4], ['drop2', 8], ['ending', 4]],
    medium: [['intro', 8], ['drop', 16], ['bridge', 8], ['drop2', 16], ['ending', 4]],
    long: [['intro', 8], ['drop', 16], ['bridge', 8], ['drop2', 16], ['bridge2', 8], ['drop3', 16], ['ending', 4]]
  };
  var SECTION_NAMES = { intro: 'Intro', drop: 'Drop', bridge: 'Bridge', drop2: 'Drop 2', bridge2: 'Breakdown', drop3: 'Drop 3', ending: 'Big ending' };

  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---------- helpers that build small buffers in plain JS ----------
  function noiseBuffer(ctx, rnd, sec) {
    var n = Math.floor(sec * SR), b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  }
  function crackleBuffer(ctx, rnd) {
    var n = SR * 3, b = ctx.createBuffer(2, n, SR);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), lp = 0;
      for (var i = 0; i < n; i++) {
        lp = lp * 0.97 + (rnd() * 2 - 1) * 0.03;
        var v = lp * 0.35;
        if (rnd() < 0.0009) v += (rnd() * 2 - 1) * (0.4 + rnd() * 0.6);
        d[i] = v;
      }
    }
    return b;
  }
  function reverbIR(ctx, rnd, sec, tau) {
    var n = Math.floor(sec * SR), b = ctx.createBuffer(2, n, SR);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c);
      for (var i = 0; i < n; i++) {
        var t = i / SR;
        d[i] = (rnd() * 2 - 1) * Math.exp(-t / tau) * Math.min(1, t / 0.01);
      }
    }
    return b;
  }
  function tanhCurve(drive) {
    var n = 2048, c = new Float32Array(n), k = Math.tanh(drive);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * drive) / k; }
    return c;
  }
  function crushCurve(steps) {
    var n = 4096, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
    return c;
  }

  // ---------- the composer: turns settings + seed into a list of events ----------
  function compose(opts) {
    var rnd = mulberry(opts.seed);
    var V = VIBES[opts.vibe];
    var bpm = opts.bpm, bar = 240 / bpm, step = bar / 16;
    var k = opts.key;
    var base = 60 + k - (k >= 6 ? 12 : 0);
    var progName = opts.prog || V.progs[Math.floor(rnd() * V.progs.length)];
    var prog = PROGS[progName];
    var plan = LENGTHS[opts.length] || LENGTHS.medium;
    var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };

    // sections
    var sections = [], b0 = 0;
    plan.forEach(function (p) { sections.push({ type: p[0], bars: p[1], startBar: b0 }); b0 += p[1]; });
    var totalBars = b0;
    var T0 = 0.05;
    function tb(b, s) { return T0 + b * bar + (s || 0) * step; }

    // chord voicing per progression slot
    function chordNotes(c) {
      var notes = CH[c[1]].map(function (iv) { return base + c[0] + iv; });
      while (Math.min.apply(null, notes) < 55) notes = notes.map(function (n) { return n + 12; });
      while (Math.min.apply(null, notes) > 66) notes = notes.map(function (n) { return n - 12; });
      return notes;
    }
    function chordPcs(c) { return CH[c[1]].map(function (iv) { return ((k + c[0] + iv) % 12 + 12) % 12; }); }
    function bassMidi(c) { return 28 + (((k + c[0] - 4) % 12) + 12) % 12; }
    function degMidi(d) { var o = Math.floor(d / 7), r = ((d % 7) + 7) % 7; return base + 12 * o + SCALE[r]; }
    function snapDeg(d, pcs) {
      for (var off = 0; off < 4; off++) {
        var cands = off === 0 ? [d] : [d + off, d - off];
        for (var j = 0; j < cands.length; j++) if (pcs.indexOf(((degMidi(cands[j]) % 12) + 12) % 12) >= 0) return cands[j];
      }
      return d;
    }

    // melody motif (2 bars), shaped per vibe
    var RHY = {
      rage: [[0, 2, 4, 6, 8, 10, 12, 14], [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], [0, 1, 2, 4, 6, 8, 9, 10, 12, 14]],
      pluck: [[0, 3, 6, 8, 10, 12, 14], [0, 2, 3, 6, 7, 10, 12, 14], [0, 3, 6, 9, 10, 12, 14, 15]],
      supersaw: [[0, 3, 6, 8, 12, 14], [0, 2, 3, 5, 6, 8, 11, 13], [0, 3, 6, 10, 12]],
      fmbell: [[0, 3, 6, 10, 12], [0, 2, 4, 8, 11, 14], [0, 3, 6, 8, 11]],
      crush: [[0, 1, 2, 4, 6, 7, 8, 10, 12, 13, 14], [0, 1, 3, 4, 6, 8, 9, 10, 12, 14, 15], [0, 2, 3, 4, 6, 7, 8, 11, 12, 13]]
    };
    var motif = [];
    var deg = 7 + Math.floor(rnd() * 5);
    for (var mb = 0; mb < 2; mb++) {
      var rh = pick(RHY[V.lead]);
      rh.forEach(function (s, i) {
        var nxt = i + 1 < rh.length ? rh[i + 1] : 16;
        var mv = pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
        if (V.lead === 'rage' && i % 4 === 3) mv = -3;
        deg = Math.max(6, Math.min(16, deg + mv));
        motif.push({ bar: mb, step: s, len: Math.max(1, Math.min(nxt - s, 6)), deg: deg, strong: s % 4 === 0 });
      });
    }

    // 808 templates: [step, len, octaveOffset, glide]
    var P808 = {
      rage: [[[0, 3, 0, 0], [3, 3, 0, 0], [6, 2, 12, 1], [8, 4, 0, 1], [12, 2, 0, 0], [14, 2, 12, 1]],
             [[0, 6, 0, 0], [6, 4, 0, 0], [10, 3, 12, 1], [13, 3, 0, 1]]],
      bounce: [[[0, 6, 0, 0], [6, 4, 0, 0], [10, 6, 0, 0]],
               [[0, 6, 0, 0], [6, 3, 0, 0], [9, 3, 12, 1], [12, 4, 0, 1]]],
      blown: [[[0, 3, 0, 0], [3, 3, 0, 0], [6, 4, 12, 1], [10, 2, 0, 1], [12, 4, 0, 1]],
              [[0, 6, 0, 0], [6, 2, 12, 1], [8, 2, 0, 1], [10, 6, 0, 0]]],
      long: [[[0, 10, 0, 0], [10, 6, 0, 0]], [[0, 7, 0, 0], [7, 5, 12, 1], [12, 4, 0, 1]], [[0, 16, 0, 0]]]
    };

    var ev = { kick: [], snare: [], hat: [], b808: [], keys: [], lead: [], chop: [], bomb: [], riser: [], impact: [], sweepDown: [] };
    var moments = [];
    var gaps = [], tapeStops = [], stutters = [];
    var dives = !!opts.dives, bombOn = !!opts.bomb, tapeOn = !!opts.tape;

    var VOWS = ['a', 'e', 'i', 'o', 'u'];

    sections.forEach(function (sec, si) {
      var next = sections[si + 1];
      var isDrop = sec.type.indexOf('drop') === 0;
      var isBridge = sec.type.indexOf('bridge') === 0;
      var energy = sec.type === 'drop' ? 1 : (sec.type === 'drop2' || sec.type === 'drop3') ? 1.15 : sec.type === 'ending' ? 1.2 : 0.5;
      sec.notes = [];
      var t808 = pick(P808[V.b808]), t808b = pick(P808[V.b808]);

      for (var lb = 0; lb < sec.bars; lb++) {
        var b = sec.startBar + lb;
        var c = prog[lb % prog.length];
        var last = lb === sec.bars - 1;
        var notes = chordNotes(c), pcs = chordPcs(c), bass = bassMidi(c);
        var gapBar = last && next && (next.type.indexOf('drop') === 0) && sec.type !== 'drop' && sec.type !== 'drop2';

        // ---- keys / chords
        if (sec.type === 'intro' || isBridge) {
          ev.keys.push({ t: tb(b), dur: bar * (gapBar ? 0.75 : 1), notes: notes, vel: 0.8, soft: true });
        } else if (isDrop || sec.type === 'ending') {
          var stabs = V.lead === 'fmbell' || V.keys === 'keys' ? [[0, 6], [6, 4], [10, 6]] : [[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]];
          if (sec.type === 'ending' && lb >= sec.bars - 1) stabs = [[0, 16]];
          stabs.forEach(function (s) { ev.keys.push({ t: tb(b, s[0]), dur: s[1] * step, notes: notes, vel: 0.7 }); });
        }

        // ---- lead melody
        var leadOn = isDrop || (sec.type === 'ending' && lb < sec.bars - 1) || (sec.type === 'intro' && lb >= sec.bars / 2 && V.lead !== 'supersaw') || (isBridge && V.lead === 'fmbell');
        if (leadOn) {
          var mbar = lb % 2;
          var vary = (lb % 4 === 3) && rnd() < 0.6;
          motif.forEach(function (n) {
            if (n.bar !== mbar) return;
            if (gapBar && n.step >= 12) return;
            var d = n.deg;
            if (vary && n.step >= 8) d += pick([-2, -1, 1, 2, 3]);
            if (n.strong) d = snapDeg(d, pcs);
            var m = degMidi(d);
            if (V.lead === 'supersaw' || V.lead === 'crush') m -= 12;
            ev.lead.push({ t: tb(b, n.step), dur: n.len * step, midi: m, vel: sec.type === 'intro' ? 0.5 : 0.85, filtered: sec.type === 'intro' });
            if (sec.type === 'drop2' || sec.type === 'drop3' || sec.type === 'ending') {
              if (V.lead !== 'rage' && V.lead !== 'crush') ev.lead.push({ t: tb(b, n.step), dur: n.len * step, midi: m + 12, vel: 0.35, layer: true });
            }
          });
        }

        // ---- 808
        var has808 = isDrop || sec.type === 'ending' || (sec.type === 'intro' && lb >= sec.bars - 2) || isBridge;
        if (has808) {
          var tpl = (lb % 2) ? t808b : t808;
          if (isBridge) tpl = [[0, 16, 0, 0]];
          if (sec.type === 'intro') tpl = [[0, gapBar ? 12 : 16, 0, 0]];
          if (sec.type === 'ending' && lb === sec.bars - 1) tpl = [[0, 16, 0, 0]];
          tpl.forEach(function (p) {
            if (gapBar && p[0] >= 12) return;
            var len = p[1];
            if (gapBar && p[0] + len > 12) len = 12 - p[0];
            var o = { t: tb(b, p[0]), dur: len * step, midi: bass + p[2], glide: !!p[3], filtered: sec.type === 'intro' || isBridge };
            ev.b808.push(o);
            var kickHere = (isDrop || sec.type === 'ending') && !p[3] && (V.kick808 || p[0] === 0 || rnd() < 0.5);
            if (kickHere) ev.kick.push({ t: o.t, vel: 1 });
          });
          // pitch dive at the end of a section
          if (dives && last && (isDrop || isBridge) && ev.b808.length && !(tapeOn && sec.type === 'drop')) {
            var lastN = ev.b808[ev.b808.length - 1];
            lastN.dive = isBridge ? -24 : -12;
            moments.push({ t: lastN.t, what: '808 pitch dive' });
          }
        }
        if (!V.kick808 && (isDrop || sec.type === 'ending') && !(sec.type === 'ending' && last)) {
          [6, 10].forEach(function (s) { if (rnd() < 0.5) ev.kick.push({ t: tb(b, s), vel: 0.85 }); });
        }

        // ---- snare / clap (half time: beat 3)
        if (isDrop || sec.type === 'ending') {
          if (!(sec.type === 'ending' && last)) {
            ev.snare.push({ t: tb(b, 8), vel: 1 });
            if (last && isDrop) { ev.snare.push({ t: tb(b, 14), vel: 0.6 }); ev.snare.push({ t: tb(b, 15), vel: 0.8 }); }
            else if (rnd() < 0.15 * energy) ev.snare.push({ t: tb(b, 15), vel: 0.4 });
          }
        } else if (isBridge && lb >= sec.bars / 2) {
          ev.snare.push({ t: tb(b, 8), vel: 0.6 });
        }
        // snare roll building into a drop
        if (gapBar && (sec.type === 'intro' || isBridge)) {
          for (var s = 0; s < 12; s++) ev.snare.push({ t: tb(b, s), vel: 0.25 + 0.6 * s / 12 });
          for (var s2 = 8; s2 < 12; s2++) ev.snare.push({ t: tb(b, s2 + 0.5), vel: 0.3 + 0.6 * (s2 - 8) / 4 });
        }

        // ---- hats
        var hatOn = isDrop || sec.type === 'ending' || (sec.type === 'intro' && lb >= sec.bars / 2) || (isBridge && lb >= 1);
        if (hatOn && !(sec.type === 'ending' && last)) {
          var grid = (isBridge || sec.type === 'intro') ? 4 : (V.hats === 16 ? 1 : 2);
          var rollBeat = (lb % 2 === 1) && rnd() < V.rolls * (isDrop ? 1 : 0.4);
          var rollStart = rollBeat ? pick([12, 8, 12, 14]) : 99;
          for (var hs = 0; hs < 16; hs += grid) {
            if (gapBar && hs >= 12) break;
            if (hs >= rollStart) break;
            ev.hat.push({ t: tb(b, hs), vel: hs % 4 === 0 ? 0.9 : 0.6, rate: 1 });
          }
          if (rollBeat && !(gapBar && rollStart >= 12)) {
            var kind = pick(['trip', '32', 'trip', '64ramp']);
            var rEnd = 16;
            if (kind === 'trip') { for (var r = 0; r < (rEnd - rollStart) * 1.5; r++) ev.hat.push({ t: tb(b, rollStart + r / 1.5), vel: 0.5 + 0.3 * (r % 3 === 0), rate: 1 + r * 0.04 }); }
            else if (kind === '32') { for (var r2 = 0; r2 < (rEnd - rollStart) * 2; r2++) ev.hat.push({ t: tb(b, rollStart + r2 / 2), vel: 0.4 + 0.5 * r2 / ((rEnd - rollStart) * 2), rate: 1 + r2 * 0.05 }); }
            else { var nn = (rEnd - rollStart) * 3; for (var r3 = 0; r3 < nn; r3++) ev.hat.push({ t: tb(b, rollStart + r3 / 3), vel: 0.3 + 0.6 * r3 / nn, rate: 0.8 + r3 / nn }); }
          }
          if ((sec.type === 'drop2' || sec.type === 'drop3') && rnd() < 0.4) ev.hat.push({ t: tb(b, 6), vel: 0.6, open: true, rate: 1 });
        }

        // ---- vowel chops
        var chopProb = V.chops * (isDrop ? 1 : sec.type === 'ending' ? 0.8 : 0.6);
        if (chopProb > 0 && rnd() < chopProb && !(sec.type === 'ending' && last)) {
          var top = notes[notes.length - 1] + 12;
          var pat = isBridge || sec.type === 'intro' ? [[0, 6], [8, 6]] : pick([[[0, 1], [3, 1], [6, 2]], [[0, 2], [2, 1], [3, 1], [6, 2], [10, 1]], [[8, 1], [10, 1], [11, 1], [14, 2]]]);
          pat.forEach(function (p, i) {
            if (gapBar && p[0] >= 12) return;
            var nm = pick(notes) + 12;
            var v1 = pick(VOWS), v2 = (isBridge || sec.type === 'intro') ? pick(VOWS) : null;
            var o = { t: tb(b, p[0]), dur: p[1] * step, midi: i === 0 ? top : nm, v1: v1, v2: v2, glide: 0, vel: isBridge ? 0.7 : 0.85 };
            ev.chop.push(o);
          });
          if (dives && (isBridge || (isDrop && lb % 4 === 1)) && rnd() < 0.8) {
            ev.chop.push({ t: tb(b, isBridge ? 12 : 6), dur: (isBridge ? 4 : 3) * step, midi: top, v1: 'a', v2: null, glide: -24, vel: 0.7 });
            if (isBridge || lb === 1) moments.push({ t: tb(b, isBridge ? 12 : 6), what: 'vocal chop pitch dive' });
          }
        }
      }

      // ---- transitions
      var endBar = sec.startBar + sec.bars;
      if (next && next.type.indexOf('drop') === 0) {
        var riseBars = Math.min(2, sec.bars / 2);
        ev.riser.push({ t: tb(endBar - riseBars), dur: riseBars * bar - step * 4, gain: 0.7 });
        if (sec.type === 'intro' || isBridge) {
          gaps.push({ t: tb(endBar - 1, 12), until: tb(endBar) });
          moments.push({ t: tb(endBar - 1, 12), what: 'one beat of silence before the drop' });
        }
        ev.impact.push({ t: tb(endBar), gain: 0.85 });
      }
      if (next && next.type.indexOf('bridge') === 0) {
        ev.impact.push({ t: tb(endBar), gain: 0.5 });
      }
      // tape stop at the end of the first drop
      if (tapeOn && sec.type === 'drop') {
        tapeStops.push({ t: tb(endBar - 1, 8), until: tb(endBar), curve: 1.6 });
        moments.push({ t: tb(endBar - 1, 8), what: 'tape stop' });
      } else if (sec.type === 'drop' && dives) {
        ev.sweepDown.push({ t: tb(endBar - 1, 8), dur: step * 8 });
      }
      // glitch stutters
      if (V.glitch >= 0.3 && sec.type === 'intro') {
        stutters.push({ t: tb(endBar - 1, 8), until: tb(endBar - 1, 12), segs: [2, 1, 1, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25] });
        moments.push({ t: tb(endBar - 1, 8), what: 'glitch stutter' });
      }
      if (isBridge && V.glitch >= 0.3) {
        var mid = sec.startBar + Math.floor(sec.bars / 2) - 1;
        stutters.push({ t: tb(mid, 12), until: tb(mid + 1), segs: [1, 1, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25] });
        moments.push({ t: tb(mid, 12), what: 'glitch stutter' });
      }
      if (isDrop && V.glitch > 0) {
        for (var ph = 4; ph < sec.bars; ph += 4) {
          if (rnd() < V.glitch * 0.7) {
            stutters.push({ t: tb(sec.startBar + ph - 1, 12), until: tb(sec.startBar + ph), segs: pick([[1, 1, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25], [2, 0.5, 0.5, 0.5, 0.5]]) });
            if (V.glitch >= 0.9 || ph === 4) moments.push({ t: tb(sec.startBar + ph - 1, 12), what: 'glitch stutter' });
          }
        }
      }

      // ---- bomb timer
      if (bombOn) {
        var bh = function (bb, steps, f, bvel, tvel, beep) {
          steps.forEach(function (s, i) { ev.bomb.push({ t: tb(bb, s), f: f, bvel: beep === false ? 0 : bvel, tvel: tvel, tock: i % 2 === 1 }); });
        };
        if (sec.type === 'intro') {
          var n4 = sec.bars;
          for (var ib = 0; ib < n4; ib++) {
            var bb = sec.startBar + ib, frac = ib / n4;
            if (ib === n4 - 1) bh(bb, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 2900, 0.5, 0.34);
            else if (frac >= 0.5) bh(bb, [0, 2, 4, 6, 8, 10, 12, 14], 2750, 0.45, 0.32);
            else bh(bb, [0, 4, 8, 12], 2700, 0.28 + 0.04 * ib, 0.25);
          }
          moments.push({ t: tb(sec.startBar), what: 'bomb timer beeping' });
          moments.push({ t: tb(endBar - 1), what: 'bomb timer speeds up' });
        }
        if (isBridge && next && next.type.indexOf('drop') === 0) {
          bh(endBar - 2, [8, 10, 12, 14], 2800, 0.4, 0.3);
          bh(endBar - 1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 2900, 0.45, 0.32);
          moments.push({ t: tb(endBar - 2, 8), what: 'bomb timer comes back' });
        }
        if (sec.type === 'ending') {
          var eb = sec.startBar;
          for (var e1 = 0; e1 < sec.bars - 2; e1++) bh(eb + e1, [0, 4, 8, 12], 2700, 0, 0.3, false);
          bh(endBar - 2, [0, 2, 4, 6], 2800, 0.4, 0.3); bh(endBar - 2, [8, 9, 10, 11, 12, 13, 14, 15], 2900, 0.45, 0.32);
          ev.bomb.push({ t: tb(endBar - 1), f: 2900, bvel: 0.55, tvel: 0, long: true });
          moments.push({ t: tb(eb), what: 'clock ticking under the 808' });
          moments.push({ t: tb(endBar - 2), what: 'beeps speed up' });
          moments.push({ t: tb(endBar - 1), what: 'final long beep and the boom' });
        }
      }
      if (sec.type === 'ending') {
        ev.impact.push({ t: tb(endBar - 1, bombOn ? 2 : 0), gain: 1, big: true });
        if (!bombOn) moments.push({ t: tb(endBar - 1), what: 'the final boom' });
        if (sec.bars >= 3) gaps.push({ t: tb(endBar - 2, 12), until: tb(endBar - 1) });
        if (tapeOn) {
          tapeStops.push({ t: tb(endBar - 1, 8), until: tb(endBar), curve: 1.2, final: true });
          moments.push({ t: tb(endBar - 1, 8), what: 'final tape stop' });
        }
        ev.riser.push({ t: tb(endBar - 2), dur: bar - step * 4, gain: 0.5 });
      }
      sec.t = tb(sec.startBar);
      sec.end = tb(endBar);
    });

    var endT = T0 + totalBars * bar;
    var tail = tapeOn ? 0.6 : 3.0;
    return {
      opts: opts, vibe: V, bpm: bpm, bar: bar, step: step, prog: progName, sections: sections, ev: ev,
      moments: moments.sort(function (a, b) { return a.t - b.t; }), gaps: gaps, tapeStops: tapeStops, stutters: stutters,
      duration: endT + tail, endT: endT, rnd: rnd
    };
  }

  // ---------- the renderer: schedules the events on an OfflineAudioContext ----------
  function render(song, onProgress) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var len = Math.ceil(song.duration * SR);
    var ctx = new OAC(2, len, SR);
    var rnd = mulberry(song.opts.seed ^ 0x5bd1e995);
    var V = song.vibe, ev = song.ev, opts = song.opts, step = song.step;
    var NOISE = noiseBuffer(ctx, rnd, 2);
    var panner = function (p) {
      if (ctx.createStereoPanner) { var s = ctx.createStereoPanner(); s.pan.value = p; return s; }
      return ctx.createGain();
    };
    var shaper = function (curve) { var w = ctx.createWaveShaper(); w.curve = curve; w.oversample = '2x'; return w; };
    var filt = function (type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; };
    var gainN = function (v) { var g = ctx.createGain(); g.gain.value = v; return g; };
    function env(g, t, a, peak, dur, rel, sus, tau) {
      // attack, exponential-ish decay toward sus, release at t+dur
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      var sv = peak * sus;
      g.gain.setTargetAtTime(sv, t + a, tau);
      var tEnd = t + Math.max(dur, a + 0.002);
      var vEnd = sv + (peak - sv) * Math.exp(-(tEnd - t - a) / tau);
      g.gain.setValueAtTime(vEnd, tEnd);
      g.gain.linearRampToValueAtTime(0, tEnd + rel);
      return tEnd + rel;
    }

    var jobs = [];
    function at(t, fn) { jobs.push({ t: t, fn: fn }); }

    // --- buses
    var master = gainN(0.9);
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.16; comp.knee.value = 8;
    master.connect(comp); comp.connect(ctx.destination);

    var gapGain = gainN(1); gapGain.connect(master);
    song.gaps.forEach(function (g) {
      gapGain.gain.setValueAtTime(1, g.t - 0.01); gapGain.gain.linearRampToValueAtTime(0, g.t);
      gapGain.gain.setValueAtTime(0, g.until - 0.004); gapGain.gain.linearRampToValueAtTime(1, g.until);
    });

    var verb = ctx.createConvolver(); verb.normalize = true; verb.buffer = reverbIR(ctx, rnd, 1.8, 0.4);
    var verbIn = gainN(0.3); var verbHP = filt('highpass', 250); verbIn.connect(verbHP); verbHP.connect(verb); verb.connect(master);

    // ping-pong delay, dotted 8th
    var dl = ctx.createDelay(2), dr = ctx.createDelay(2);
    dl.delayTime.value = step * 3; dr.delayTime.value = step * 3;
    var dIn = gainN(0.32), fbL = gainN(0.42), fbR = gainN(0.42), dLP = filt('lowpass', 5000);
    var pL = panner(-0.7), pR = panner(0.7), dOut = gainN(0.8);
    dIn.connect(dLP); dLP.connect(dl); dl.connect(fbL); fbL.connect(dr); dr.connect(fbR); fbR.connect(dl);
    dl.connect(pL); dr.connect(pR); pL.connect(dOut); pR.connect(dOut); dOut.connect(gapGain); dOut.connect(verbIn);

    // sidechain pump on the music
    var pump = gainN(1); pump.connect(gapGain);
    var music = gainN(1); var secLP = filt('lowpass', 18000, 0.5); music.connect(secLP); secLP.connect(pump);
    var kicks = ev.kick.map(function (k) { return k.t; }).sort(function (a, b) { return a - b; });
    kicks.forEach(function (t, i) {
      var nxt = i + 1 < kicks.length ? kicks[i + 1] : t + 1;
      var rec = Math.min(0.2, nxt - t - 0.01);
      if (rec < 0.03) return;
      pump.gain.setValueAtTime(1, t); pump.gain.linearRampToValueAtTime(0.38, t + 0.008); pump.gain.linearRampToValueAtTime(1, t + rec);
    });
    // section filter: intro and bridges are muffled, drops open up
    var lofiF = opts.vinyl ? 650 : 1100;
    song.sections.forEach(function (sec) {
      var f = sec.type === 'intro' ? lofiF : sec.type.indexOf('bridge') === 0 ? (opts.vinyl ? 1500 : 2400) : 18000;
      secLP.frequency.setValueAtTime(f, sec.t);
      if (sec.type === 'intro' || sec.type.indexOf('bridge') === 0) secLP.frequency.exponentialRampToValueAtTime(f * 2.2, sec.end - 0.01);
    });

    // drum buses
    var drums = gainN(1); drums.connect(gapGain);
    var kickBus = gainN(0.95); var kickSh = shaper(tanhCurve(2.2)); kickBus.connect(kickSh); kickSh.connect(drums);
    var hatHP = filt('highpass', 7000, 0.7); hatHP.connect(drums);
    var hatBus = gainN(0.6), hatPan = panner(0.15); hatBus.connect(hatPan); hatPan.connect(hatHP);
    var hatBusL = gainN(0.6), hatPanL = panner(-0.25); hatBusL.connect(hatPanL); hatPanL.connect(hatHP);
    var snBus = gainN(1.3); var snSh = shaper(tanhCurve(1.8)); snBus.connect(snSh); snSh.connect(drums); snSh.connect(verbIn);
    // 808 bus: clean sine + distorted copy
    var b808 = gainN(V.b808 === 'blown' ? 0.72 : 0.78);
    var b808Pump = gainN(1); b808.connect(b808Pump); b808Pump.connect(gapGain);
    kicks.forEach(function (t, i) {
      var nxt = i + 1 < kicks.length ? kicks[i + 1] : t + 1; var rec = Math.min(0.08, nxt - t - 0.01); if (rec < 0.03) return;
      b808Pump.gain.setValueAtTime(1, t); b808Pump.gain.linearRampToValueAtTime(0.6, t + 0.005); b808Pump.gain.linearRampToValueAtTime(1, t + rec);
    });
    var drive808 = V.b808 === 'blown' ? 4.2 : V.b808 === 'rage' ? 3.4 : V.b808 === 'long' ? 2.0 : 1.6;
    var cl808 = gainN(0.75), di808 = gainN(V.b808 === 'long' || V.b808 === 'bounce' ? 0.35 : 0.6);
    var sh808 = shaper(tanhCurve(drive808)), lp808 = filt('lowpass', 2600);
    var in808 = gainN(1); in808.connect(cl808); in808.connect(sh808); sh808.connect(lp808); lp808.connect(di808);
    var f808 = filt('lowpass', 20000, 0.3); cl808.connect(f808); di808.connect(f808); f808.connect(b808);

    var fx = gainN(0.8); fx.connect(master); fx.connect(verbIn);
    var bombBus = gainN(0.45); var bombHP = filt('highpass', 500); bombBus.connect(bombHP); bombHP.connect(master);

    // --- 808: one continuous oscillator, like the Python version
    var o808 = ctx.createOscillator(); o808.type = 'sine';
    var g808 = gainN(0); o808.connect(g808); g808.connect(in808);
    o808.frequency.setValueAtTime(40, 0);
    g808.gain.setValueAtTime(0, 0);
    var prevF = null, list808 = ev.b808.slice().sort(function (a, b) { return a.t - b.t; });
    list808.forEach(function (n, i) {
      var f = mf(n.midi), t = n.t, tEnd = t + n.dur;
      var nx = list808[i + 1];
      var legato = nx && nx.glide && Math.abs(nx.t - tEnd) < 0.002;
      if (n.glide && prevF) {
        o808.frequency.setValueAtTime(prevF, t);
        o808.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      } else {
        o808.frequency.setValueAtTime(f, t);
      }
      if (n.dive) {
        o808.frequency.setValueAtTime(f, t + n.dur * 0.35);
        o808.frequency.exponentialRampToValueAtTime(f * Math.pow(2, n.dive / 12), tEnd);
      }
      if (!n.glide || !prevF) { g808.gain.setValueAtTime(0, t); g808.gain.linearRampToValueAtTime(1, t + 0.003); }
      else g808.gain.setValueAtTime(0.85, t);
      var tau = n.dur > 1.2 ? 1.6 : 0.35, sus = n.dur > 1.2 ? 0.25 : 0.62;
      g808.gain.setTargetAtTime(sus, t + 0.004, tau);
      if (!legato) {
        var vEnd = sus + (1 - sus) * Math.exp(-(n.dur - 0.016) / tau);
        g808.gain.setValueAtTime(Math.max(0.05, vEnd), tEnd - 0.012);
        g808.gain.linearRampToValueAtTime(0, tEnd);
      }
      prevF = f * (n.dive ? Math.pow(2, n.dive / 12) : 1);
    });
    o808.start(0); o808.stop(song.duration);
    // muffle filtered sections of the 808
    song.sections.forEach(function (sec) {
      var muff = sec.type === 'intro' || sec.type.indexOf('bridge') === 0;
      f808.frequency.setValueAtTime(muff ? 180 : 20000, sec.t);
      b808.gain.setValueAtTime(muff ? 0.4 : (V.b808 === 'blown' ? 0.72 : 0.78), sec.t);
      music.gain.setValueAtTime(sec.type.indexOf('bridge') === 0 ? 0.75 : 1, sec.t);
    });

    // --- drums
    ev.kick.forEach(function (k) { at(k.t, function () {
      var t = k.t;
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.05); o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
      var g = gainN(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(k.vel, t + 0.002); g.gain.setTargetAtTime(0, t + 0.01, 0.12);
      o.connect(g); g.connect(kickBus); o.start(t); o.stop(t + 0.6);
      var n = ctx.createBufferSource(); n.buffer = NOISE; var nh = filt('highpass', 2000); var ng = gainN(0);
      ng.gain.setValueAtTime(0.5 * k.vel, t); ng.gain.setTargetAtTime(0, t, 0.0015);
      n.connect(nh); nh.connect(ng); ng.connect(kickBus); n.start(t, rnd() * 1.5); n.stop(t + 0.03);
    }); });
    ev.snare.forEach(function (s) { at(s.t, function () {
      var t = s.t;
      var n = ctx.createBufferSource(); n.buffer = NOISE; var bp = filt('bandpass', 1900, 0.8); var g = gainN(0);
      g.gain.setValueAtTime(0, t);
      [0, 0.011, 0.022].forEach(function (d) { g.gain.setValueAtTime(s.vel, t + d); g.gain.setTargetAtTime(0.05 * s.vel, t + d + 0.0005, 0.004); });
      g.gain.setValueAtTime(0.7 * s.vel, t + 0.03); g.gain.setTargetAtTime(0, t + 0.03, 0.06);
      n.connect(bp); bp.connect(g); g.connect(snBus); n.start(t, rnd() * 1.5); n.stop(t + 0.4);
      var o = ctx.createOscillator(); o.frequency.value = 190; var og = gainN(0);
      og.gain.setValueAtTime(0.6 * s.vel, t); og.gain.setTargetAtTime(0, t, 0.03);
      o.connect(og); og.connect(snBus); o.start(t); o.stop(t + 0.25);
    }); });
    ev.hat.forEach(function (h) { at(h.t, function () {
      var t = h.t;
      var n = ctx.createBufferSource(); n.buffer = NOISE; n.playbackRate.value = h.rate || 1;
      var g = gainN(0); g.gain.setValueAtTime(h.vel, t); g.gain.setTargetAtTime(0, t, h.open ? 0.07 : 0.014);
      n.connect(g); g.connect(h.open ? hatBusL : hatBus); n.start(t, rnd() * 1.5); n.stop(t + (h.open ? 0.4 : 0.1));
    }); });

    // --- keys
    var keysBus = gainN(V.keys === 'keys' ? 0.12 : 0.095); keysBus.connect(music); keysBus.connect(verbIn);
    var keysL = panner(-0.35), keysR = panner(0.35); keysL.connect(keysBus); keysR.connect(keysBus);
    ev.keys.forEach(function (c) { at(c.t, function () {
      c.notes.forEach(function (m, i) {
        var f = mf(m), t = c.t;
        var g = gainN(0);
        g.connect(i % 2 ? keysR : keysL);
        var end = env(g, t, c.soft ? 0.05 : 0.004, c.vel, c.dur, c.soft ? 0.3 : 0.12, c.soft ? 0.5 : 0.25, c.soft ? 1.2 : 0.5);
        [-7, 7].forEach(function (dt) {
          var o = ctx.createOscillator(); o.type = V.keys === 'keys' ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = dt;
          o.connect(g); o.start(t); o.stop(end + 0.01);
        });
        if ((V.keys !== 'keys' || !c.soft) && i === c.notes.length - 1) {
          var ob = ctx.createOscillator(); ob.type = 'sine'; ob.frequency.value = f * (V.keys === 'bell' ? 3 : 2);
          var gb = gainN(0); gb.gain.setValueAtTime(V.keys === 'bell' ? 0.9 : 0.6, t); gb.gain.setTargetAtTime(0, t, 0.12);
          ob.connect(gb); gb.connect(g); ob.start(t); ob.stop(Math.min(end, t + 0.8) + 0.01);
        }
      });
    }); });

    // --- lead
    var leadBus = gainN(1); var leadLP = filt('lowpass', 9000, 0.6);
    leadBus.connect(leadLP); leadLP.connect(music); leadLP.connect(verbIn);
    var leadPost = null;
    if (V.lead === 'rage') { leadPost = shaper(tanhCurve(3.5)); leadBus.gain.value = 0.11; }
    else if (V.lead === 'crush') { leadPost = shaper(crushCurve(6)); leadBus.gain.value = 0.11; }
    else if (V.lead === 'supersaw') { leadBus.gain.value = 0.1; leadLP.frequency.value = 7000; }
    else if (V.lead === 'pluck') { leadBus.gain.value = 0.2; leadLP.connect(dIn); }
    else { leadBus.gain.value = 0.22; leadLP.connect(dIn); }
    if (V.lead === 'supersaw' || V.lead === 'crush') leadLP.connect(dIn);
    var leadIn = leadBus;
    if (leadPost) { leadIn = gainN(1); leadIn.connect(leadPost); leadPost.connect(leadBus); }
    var ssL = panner(-0.6), ssR = panner(0.6); ssL.connect(leadIn); ssR.connect(leadIn);
    ev.lead.forEach(function (n) { at(n.t, function () {
      var t = n.t, f = mf(n.midi), vel = n.vel;
      var g = gainN(0);
      var dest = leadIn;
      if (n.filtered) { var nf = filt('lowpass', 1200); g.connect(nf); nf.connect(dest); } else g.connect(dest);
      var end;
      if (V.lead === 'supersaw') {
        g.disconnect();
        var gR = gainN(0); gR.connect(ssR); g.connect(ssL);
        end = env(g, t, 0.01, vel, n.dur, 0.09, 0.8, 0.4); env(gR, t, 0.01, vel, n.dur, 0.09, 0.8, 0.4);
        [-30, -12, 0, 12, 30].forEach(function (d, i) {
          var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d + (i === 2 ? 0 : 0);
          o.connect(i % 2 ? gR : g); if (i === 2) o.connect(gR); o.start(t); o.stop(end + 0.01);
        });
      } else if (V.lead === 'rage') {
        end = env(g, t, 0.004, vel, n.dur * 0.9, 0.05, 0.6, 0.25);
        [[-14, 'sawtooth'], [0, 'square'], [14, 'sawtooth']].forEach(function (d) {
          var o = ctx.createOscillator(); o.type = d[1]; o.frequency.value = f; o.detune.value = d[0];
          o.connect(g); o.start(t); o.stop(end + 0.01);
        });
      } else if (V.lead === 'crush') {
        end = env(g, t, 0.002, vel, n.dur * 0.8, 0.02, 0.5, 0.15);
        var oc = ctx.createOscillator(); oc.type = 'square'; oc.frequency.value = f;
        if (rnd() < 0.25) { oc.frequency.setValueAtTime(f * 2, t); oc.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
        oc.connect(g); oc.start(t); oc.stop(end + 0.01);
      } else if (V.lead === 'pluck') {
        end = env(g, t, 0.002, vel, n.dur, 0.08, 0.0, 0.18);
        var pf = filt('lowpass', 5000, 3); pf.frequency.setValueAtTime(5500, t); pf.frequency.exponentialRampToValueAtTime(700, t + 0.2);
        pf.connect(g);
        [['sawtooth', -6], ['square', 6]].forEach(function (d) {
          var o = ctx.createOscillator(); o.type = d[0]; o.frequency.value = f; o.detune.value = d[1];
          var og = gainN(0.5); o.connect(og); og.connect(pf); o.start(t); o.stop(end + 0.01);
        });
      } else {
        // FM bell
        end = env(g, t, 0.002, vel, Math.max(n.dur, 0.5), 0.3, 0.0, 0.45);
        var car = ctx.createOscillator(); car.frequency.value = f;
        var mod = ctx.createOscillator(); mod.frequency.value = f * 3.5;
        var mg = gainN(0); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.2, t, 0.15);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g);
        car.start(t); mod.start(t); car.stop(end + 0.01); mod.stop(end + 0.01);
      }
    }); });

    // --- vowel chops: saw source through vowel resonators, formants shifted up so it reads as a pitched up voice
    var VOW = {
      a: [[800, 80, 1.0], [1150, 90, 0.55], [2900, 120, 0.3]], e: [[530, 70, 1.0], [1840, 100, 0.6], [2480, 120, 0.35]],
      i: [[300, 60, 0.8], [2300, 100, 0.7], [3000, 140, 0.4]], o: [[450, 70, 1.0], [800, 80, 0.6], [2830, 120, 0.2]],
      u: [[325, 60, 1.0], [700, 70, 0.45], [2530, 120, 0.15]]
    };
    var chopBus = gainN(V.lead === 'crush' ? 0.55 : 0.65); chopBus.connect(music); chopBus.connect(dIn); chopBus.connect(verbIn);
    ev.chop.forEach(function (c) { at(c.t, function () {
      var t = c.t, f0 = mf(c.midi), shift = 1.45;
      var src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.setValueAtTime(f0, t);
      var vib = ctx.createOscillator(); vib.frequency.value = 5.5; var vg = gainN(f0 * 0.006); vib.connect(vg); vg.connect(src.frequency);
      var g = gainN(0);
      var end = env(g, t, 0.006, c.vel, c.dur, 0.05, 0.7, 0.12);
      if (c.glide) src.frequency.exponentialRampToValueAtTime(f0 * Math.pow(2, c.glide / 12), t + c.dur);
      VOW[c.v1].forEach(function (fm, j) {
        var bpf = filt('bandpass', Math.min(fm[0] * shift, 18000), fm[0] / fm[1]);
        if (c.v2) bpf.frequency.linearRampToValueAtTime(Math.min(VOW[c.v2][j][0] * shift, 18000), t + c.dur);
        if (c.glide) bpf.frequency.exponentialRampToValueAtTime(fm[0] * shift * Math.pow(2, c.glide / 12 * 0.8), t + c.dur);
        var fg = gainN(fm[2] * 4); src.connect(bpf); bpf.connect(fg); fg.connect(g);
      });
      var p = panner((rnd() - 0.5) * 0.6); g.connect(p); p.connect(chopBus);
      src.start(t); vib.start(t); src.stop(end + 0.01); vib.stop(end + 0.01);
    }); });

    // --- risers, impacts, sweeps
    ev.riser.forEach(function (r) { at(r.t, function () {
      var t = r.t, d = Math.max(0.3, r.dur);
      var n = ctx.createBufferSource(); n.buffer = NOISE; n.loop = true;
      var bp = filt('bandpass', 400, 1.2); bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(11000, t + d);
      var g = gainN(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * r.gain, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.02);
      n.connect(bp); bp.connect(g); g.connect(fx); n.start(t); n.stop(t + d + 0.05);
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(220 * Math.pow(2, 3), t + d);
      var og = gainN(0); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.06 * r.gain, t + d); og.gain.linearRampToValueAtTime(0, t + d + 0.02);
      var olp = filt('lowpass', 3000); o.connect(olp); olp.connect(og); og.connect(fx); o.start(t); o.stop(t + d + 0.05);
    }); });
    ev.impact.forEach(function (im) { at(im.t, function () {
      var t = im.t, d = im.big ? 3 : 2.2;
      var o = ctx.createOscillator(); o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(28, t + d);
      var g = gainN(0); g.gain.setValueAtTime(0.9 * im.gain, t); g.gain.setTargetAtTime(0, t, im.big ? 0.9 : 0.6);
      var sh = shaper(tanhCurve(1.5)); o.connect(sh); sh.connect(g); g.connect(fx); o.start(t); o.stop(t + d);
      var n = ctx.createBufferSource(); n.buffer = NOISE; n.loop = true; var hp = filt('highpass', 4500);
      var ng = gainN(0); ng.gain.setValueAtTime(0.3 * im.gain, t); ng.gain.setTargetAtTime(0, t, 0.55);
      n.connect(hp); hp.connect(ng); ng.connect(fx); n.start(t); n.stop(t + d);
    }); });
    ev.sweepDown.forEach(function (s) { at(s.t, function () {
      var t = s.t;
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(60, t + s.dur);
      var lp = filt('lowpass', 2500); var g = gainN(0); g.gain.setValueAtTime(0.05, t); g.gain.linearRampToValueAtTime(0, t + s.dur);
      o.connect(lp); lp.connect(g); g.connect(fx); o.start(t); o.stop(t + s.dur + 0.02);
    }); });

    // --- bomb timer: tick-tock clicks and square-ish digital beeps
    var beepCurve = tanhCurve(4);
    ev.bomb.forEach(function (bm) { at(bm.t, function () {
      var t = bm.t;
      if (bm.bvel > 0) {
        var d = bm.long ? 0.34 : 0.05;
        var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = bm.f;
        var g = gainN(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(bm.bvel, t + 0.002); g.gain.setValueAtTime(bm.bvel, t + d - 0.004); g.gain.linearRampToValueAtTime(0, t + d);
        o.connect(g); g.connect(bombBus); o.start(t); o.stop(t + d + 0.01);
      }
      if (bm.tvel > 0) {
        var n = ctx.createBufferSource(); n.buffer = NOISE; var bp = filt('bandpass', bm.tock ? 1800 : 2600, 2);
        var tg = gainN(0); tg.gain.setValueAtTime(bm.tvel * 2, t); tg.gain.setTargetAtTime(0, t, 0.003);
        var p = panner(bm.tock ? 0.3 : -0.3);
        n.connect(bp); bp.connect(tg); tg.connect(p); p.connect(bombBus); n.start(t, rnd()); n.stop(t + 0.04);
      }
    }); });

    // --- vinyl crackle
    if (opts.vinyl) {
      var cr = ctx.createBufferSource(); cr.buffer = crackleBuffer(ctx, rnd); cr.loop = true;
      var cg = gainN(0); var chp = filt('highpass', 600);
      cr.connect(chp); chp.connect(cg); cg.connect(master);
      song.sections.forEach(function (sec) {
        var quiet = sec.type === 'intro' || sec.type.indexOf('bridge') === 0;
        cg.gain.setValueAtTime(quiet ? 0.3 : 0.12, sec.t);
      });
      cr.start(0); cr.stop(song.duration);
    }

    // schedule in chunks so only the nodes that are sounding exist at any moment (keeps phones fast)
    jobs.sort(function (a, b) { return a.t - b.t; });
    var ji = 0;
    function runJobs(until) { while (ji < jobs.length && jobs[ji].t < until) { jobs[ji].fn(); ji++; } }
    var CHUNK = 1.0, bounds = [];
    for (var c = CHUNK; c < song.duration - 0.05; c += CHUNK) bounds.push(Math.round(c * SR / 128) * 128 / SR);
    if (!ctx.suspend || !bounds.length) { runJobs(Infinity); return promisify(ctx); }
    runJobs(bounds[0]);
    bounds.forEach(function (q, i) {
      ctx.suspend(q).then(function () {
        runJobs(i + 1 < bounds.length ? bounds[i + 1] : Infinity);
        if (onProgress) onProgress(q / song.duration);
        ctx.resume();
      });
    });
    return promisify(ctx);
  }

  function promisify(ctx) {
    return new Promise(function (resolve, reject) {
      var done = false;
      ctx.oncomplete = function (e) { if (!done) { done = true; resolve(e.renderedBuffer); } };
      try {
        var p = ctx.startRendering();
        if (p && p.then) p.then(function (b) { if (!done) { done = true; resolve(b); } }, reject);
      } catch (err) { reject(err); }
    });
  }

  // ---------- post: tape stops, stutters, saturation, limiting (plain JS on the rendered buffer) ----------
  function post(song, buffer) {
    var L = buffer.getChannelData(0), R = buffer.getChannelData(1);
    var chans = [L, R];
    var S = function (t) { return Math.max(0, Math.min(L.length, Math.round(t * SR))); };

    song.stutters.forEach(function (st) {
      var a = S(st.t), b = S(st.until);
      chans.forEach(function (x) {
        var src = x.slice(a, b), pos = a, i = 0;
        while (pos < b) {
          var segLen = Math.max(64, Math.round(st.segs[Math.min(i, st.segs.length - 1)] * song.step * SR));
          var f = Math.min(64, segLen >> 2);
          for (var j = 0; j < segLen && pos + j < b; j++) {
            var v = src[j] || 0;
            if (j < f) v *= j / f; else if (j > segLen - f) v *= (segLen - j) / f;
            x[pos + j] = v;
          }
          pos += segLen; i++;
        }
      });
    });

    song.tapeStops.forEach(function (ts) {
      var a = S(ts.t), b = S(ts.until), n = b - a;
      chans.forEach(function (x) {
        var src = x.slice(a, b), pos = 0, lp = 0;
        for (var i = 0; i < n; i++) {
          var sp = Math.pow(1 - i / n, ts.curve);
          var i0 = Math.floor(pos), fr = pos - i0;
          var v = (src[Math.min(i0, n - 1)] || 0) * (1 - fr) + (src[Math.min(i0 + 1, n - 1)] || 0) * fr;
          lp += (v - lp) * (0.08 + 0.9 * sp);
          x[a + i] = (lp * 0.6 + v * 0.4 * sp) * (1 - 0.7 * i / n);
          pos += sp;
        }
        if (ts.final) for (var k = b; k < x.length; k++) x[k] *= Math.max(0, 1 - (k - b) / (0.25 * SR));
      });
    });

    // loudness: set RMS per vibe, then a soft knee limiter so peaks stay under 0.95
    var drive = song.vibe.drive, sumSq0 = 0;
    chans.forEach(function (x) { for (var i = 0; i < x.length; i++) sumSq0 += x[i] * x[i]; });
    var rms0 = Math.sqrt(sumSq0 / (L.length * 2)) || 1e-9;
    var target = 0.16 + 0.05 * (drive - 1.2);
    var gain = target / rms0;
    var fadeN = Math.round(0.5 * SR), sumSq = 0, knee = 0.62, room = 0.33;
    chans.forEach(function (x) {
      for (var i = 0; i < x.length; i++) {
        var v = x[i] * gain, a = Math.abs(v);
        if (a > knee) v = (v < 0 ? -1 : 1) * (knee + room * Math.tanh((a - knee) / room));
        var fromEnd = x.length - i;
        if (fromEnd < fadeN) v *= fromEnd / fadeN;
        x[i] = v; sumSq += v * v;
      }
    });
    song.rms = Math.sqrt(sumSq / (L.length * 2));
    return buffer;
  }

  // ---------- WAV encoder (16 bit stereo) ----------
  function encodeWav(buffer) {
    var nch = buffer.numberOfChannels, n = buffer.length, rate = buffer.sampleRate;
    var bytes = 44 + n * nch * 2, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
    function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * nch * 2, true); dv.setUint16(32, nch * 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, n * nch * 2, true);
    var chs = []; for (var c = 0; c < nch; c++) chs.push(buffer.getChannelData(c));
    var o = 44;
    for (var i = 0; i < n; i++) for (var c2 = 0; c2 < nch; c2++) {
      var s = Math.max(-1, Math.min(1, chs[c2][i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  // ---------- track map ----------
  var SECTION_TEXT = {
    intro: function (song) {
      var o = song.opts, bits = ['filtered chords' + (song.vibe.chops > 0.4 ? ' and soft vowel chops' : '')];
      if (o.bomb) bits.push('the bomb timer counting down');
      if (o.vinyl) bits.push('vinyl crackle');
      bits.push('the 808 sneaks in at the end, then a riser');
      return bits.join(', ');
    },
    drop: function (song) { return 'everything hits: kick, snare on 3, hats with rolls, the ' + leadName(song) + ', 808 slides'; },
    bridge: function (song) { return 'the beat drops out to muffled chords and long 808 notes' + (song.opts.dives ? ', chops dive down in pitch' : '') + ', then it builds back up'; },
    drop2: function (song) { return 'the drop comes back bigger' + (song.vibe.lead === 'rage' || song.vibe.lead === 'crush' ? ' with more rolls and open hats' : ' with the lead doubled an octave up'); },
    bridge2: function (song) { return 'a second breakdown, quieter and muffled, building into the last drop'; },
    drop3: function (song) { return 'the last and biggest drop'; },
    ending: function (song) { return 'full energy with long 808 notes' + (song.opts.bomb ? ', the clock ticks and the beeps speed up' : '') + ', then one last boom' + (song.opts.tape ? ' and a tape stop' : ' and the tail rings out'); }
  };
  function leadName(song) {
    return { rage: 'distorted rage synth', pluck: 'pluck melody', supersaw: 'supersaw lead', fmbell: 'bell melody', crush: 'bitcrushed lead' }[song.vibe.lead];
  }
  function trackMap(song) {
    var items = song.sections.map(function (sec) {
      var ms = song.moments.filter(function (m) { return m.t >= sec.t - 0.01 && m.t < sec.end - 0.01; });
      var seen = {}, extra = [];
      ms.forEach(function (m) { var key = m.what; if (seen[key]) return; seen[key] = 1; extra.push(m.what + ' at ' + fmtTime(m.t)); });
      return {
        time: fmtTime(sec.t), name: SECTION_NAMES[sec.type], text: SECTION_TEXT[sec.type](song),
        extra: extra
      };
    });
    return items;
  }

  window.TabLabEngine = {
    VIBES: VIBES, KEYS: KEYS, LENGTHS: LENGTHS, PROGS: PROGS,
    compose: compose, render: render, post: post, encodeWav: encodeWav, trackMap: trackMap, fmtTime: fmtTime,
    build: function (opts) {
      var song = compose(opts);
      return render(song).then(function (buf) { post(song, buf); song.buffer = buf; return song; });
    }
  };
})();
