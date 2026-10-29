(function () {
  'use strict';
  // TabLab, now built into Letter Orchestra. The beat engine is tablab/engine.js.
  var E = window.TabLabEngine;
  var $ = function (id) { return document.getElementById(id); };
  if (!E || !$('tl-build')) return;
  var C = window.LetterOrchestraCore || null;
  var live = $('studio-status'), mirror = $('tl-status');
  var song = null, actx = null, src = null, building = false, prog = null, sayT = null;

  // key menu: 12 minor keys, F minor first choice
  E.KEYS.forEach(function (k, i) {
    var o = document.createElement('option'); o.value = String(i); o.textContent = k + ' minor';
    if (i === 5) o.selected = true;
    $('tl-key').appendChild(o);
  });

  // lead sound menu: the vibe's own lead, each letter's own instrument, or any Letter Orchestra instrument
  (function () {
    var sel = $('tl-lead');
    function add(v, label) { var o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); }
    add('', "The vibe's own lead");
    if (C && C.INSTRUMENTS && C.voice) {
      add('mine', 'Each letter\u2019s own instrument from my letters');
      Object.keys(C.INSTRUMENTS).forEach(function (k) { add(k, C.INSTRUMENTS[k]); });
    }
  })();

  // One live region on the page: Letter Orchestra's status. The beat section shows the same words, not live.
  function say(msg) {
    if (mirror) mirror.textContent = msg;
    if (!live) return;
    clearTimeout(sayT);
    live.textContent = '';
    sayT = setTimeout(function () { live.textContent = msg; }, 60);
  }
  function newSeed() { return String(Math.floor(Math.random() * 90000) + 10000); }
  if (!$('tl-seed').value) $('tl-seed').value = newSeed();

  function showVibe() { $('tl-vibe-text').textContent = E.VIBES[$('tl-vibe').value].text; }
  function setBpm(v) {
    $('tl-bpm').value = String(v);
    $('tl-bpm-val').textContent = String(v);
    $('tl-bpm').setAttribute('aria-valuetext', v + ' BPM');
  }
  $('tl-bpm').addEventListener('input', function () { setBpm($('tl-bpm').value); });
  $('tl-vibe').addEventListener('change', function () {
    prog = null;
    var v = E.VIBES[$('tl-vibe').value];
    setBpm(v.bpm);
    showVibe();
    say(v.name + ', tempo set to ' + v.bpm + ' BPM');
  });
  showVibe();
  setBpm($('tl-bpm').value);

  function applyPreset(p) {
    $('tl-vibe').value = p.vibe; setBpm(p.bpm); $('tl-key').value = String(p.key); $('tl-length').value = p.length;
    $('tl-opt-bomb').checked = p.bomb; $('tl-opt-dives').checked = p.dives; $('tl-opt-tape').checked = p.tape; $('tl-opt-vinyl').checked = p.vinyl;
    $('tl-seed').value = String(p.seed); prog = p.prog;
    showVibe();
    say(p.name + ' loaded: ' + E.VIBES[p.vibe].name + ', ' + p.bpm + ' BPM, ' + E.KEYS[p.key] + ' minor. Press Build beat');
  }
  $('tl-preset-subwall').addEventListener('click', function () {
    applyPreset({ name: 'Sub Wall', vibe: 'digicore', bpm: 140, key: 5, length: 'medium', bomb: false, dives: false, tape: true, vinyl: true, seed: 140, prog: 'subwall' });
  });
  $('tl-preset-detonator').addEventListener('click', function () {
    applyPreset({ name: 'Detonator', vibe: 'hyperpop', bpm: 155, key: 1, length: 'medium', bomb: true, dives: true, tape: true, vinyl: false, seed: 155, prog: 'detonator' });
  });

  // the letters from Letter Orchestra's text box (all lines, joined), plus the instrument each letter was typed with
  function myLetters() {
    var st = C && C.getSongState ? C.getSongState() : null;
    var text = st ? st.text : ($('text') ? $('text').value : '');
    var insts = st && st.insts ? st.insts : [];
    return { text: text.replace(/\n/g, ' '), insts: insts, current: st ? st.instrument : '' };
  }
  function hasLetters(s) { return /[a-z]/i.test(s); }

  function readOpts() {
    var seed = parseInt(String($('tl-seed').value).replace(/[^0-9]/g, ''), 10);
    if (!isFinite(seed)) { seed = parseInt(newSeed(), 10); }
    $('tl-seed').value = String(seed);
    var o = {
      vibe: $('tl-vibe').value, bpm: parseInt($('tl-bpm').value, 10), key: parseInt($('tl-key').value, 10), length: $('tl-length').value,
      bomb: $('tl-opt-bomb').checked, dives: $('tl-opt-dives').checked, tape: $('tl-opt-tape').checked, vinyl: $('tl-opt-vinyl').checked,
      seed: seed, prog: prog, loLead: $('tl-lead').value
    };
    var L = myLetters();
    o.loCurrent = L.current;
    if ($('tl-letters').checked && hasLetters(L.text)) { o.letters = L.text; o.letterInsts = L.insts; }
    return o;
  }

  function stop(silent) {
    if (src) { try { src.onended = null; src.stop(); } catch (e) {} src = null; if (!silent) say('Beat stopped'); }
  }

  function setBusy(b) {
    building = b;
    ['tl-build', 'tl-again'].forEach(function (id) { $(id).setAttribute('aria-disabled', b ? 'true' : 'false'); });
  }

  function build(fresh) {
    if (building) return;
    stop(true);
    if (fresh) $('tl-seed').value = newSeed();
    var opts = readOpts();
    var emptyLetters = $('tl-letters').checked && !opts.letters;
    if (C && C.ensure) { try { C.ensure(); } catch (e) {} }
    setBusy(true);
    say('Building beat\u2026');
    // let the status message land before the heavy work starts
    setTimeout(function () {
      var t0 = performance.now();
      E.build(opts).then(function (s) {
        song = s;
        window.TabLabLast = { rms: s.rms, duration: s.duration, seed: opts.seed, vibe: opts.vibe, ms: Math.round(performance.now() - t0), prog: s.prog,
          letters: !!s.letters, letterCount: s.letterCount || 0, lead: opts.loLead || '' };
        drawMap(s);
        $('tl-play').disabled = false; $('tl-stop').disabled = false; $('tl-download').disabled = false;
        setBusy(false);
        var msg = 'Beat ready, ' + E.fmtTime(s.duration) + ', seed ' + opts.seed;
        if (s.letters) msg += ', melody from your letters';
        else if (emptyLetters) msg += '. Your text box has no letters yet, so the vibe\u2019s own melody plays';
        say(msg);
      }, function (err) {
        setBusy(false);
        say('Build failed: ' + (err && err.message ? err.message : 'unknown error'));
        if (window.console) console.error(err);
      });
    }, 60);
  }

  function drawMap(s) {
    var o = s.opts, ol = $('tl-map');
    ol.textContent = '';
    $('tl-map-summary').textContent = s.vibe.name + ', ' + o.bpm + ' BPM, ' + E.KEYS[o.key] + ' minor, seed ' + o.seed + ', ' + E.fmtTime(s.duration) + ' long' +
      (s.letters ? ', melody from your letters (' + s.letterCount + ' notes)' : '') + '.';
    E.trackMap(s).forEach(function (it) {
      var li = document.createElement('li');
      var txt = it.time + ' ' + it.name + '. ' + it.text.charAt(0).toUpperCase() + it.text.slice(1) + '.';
      if (it.extra.length) txt += ' Moments: ' + it.extra.join(', ') + '.';
      li.textContent = txt;
      ol.appendChild(li);
    });
    var end = document.createElement('li');
    end.textContent = E.fmtTime(s.duration) + ' End.';
    ol.appendChild(end);
  }

  $('tl-build').addEventListener('click', function () { build(false); });
  $('tl-again').addEventListener('click', function () { build(true); });

  function audioCtx() {
    // share Letter Orchestra's audio (already unlocked for iPhone); fall back to our own
    var c = C && C.ensure ? C.ensure() : null;
    if (c) return c;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!actx) actx = new AC();
    return actx;
  }
  $('tl-play').addEventListener('click', function () {
    if (!song || building) return;
    var c = audioCtx();
    if (c.resume) c.resume();
    stop(true);
    src = c.createBufferSource();
    src.buffer = song.buffer;
    src.connect(c.destination);
    src.onended = function () { src = null; say('Beat finished'); };
    src.start(0);
    say('Playing beat');
  });
  $('tl-stop').addEventListener('click', function () { if (src) stop(false); else say('Beat not playing'); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Escape' || e.key === 'Esc') && src) stop(false); });

  $('tl-download').addEventListener('click', function () {
    if (!song) return;
    var o = song.opts;
    // same WAV encoder as Letter Orchestra's Download as audio
    var w = C && C.encodeWav ? C.encodeWav(song.buffer) : E.encodeWav(song.buffer);
    var blob = (window.Blob && w instanceof Blob) ? w : new Blob([w], { type: 'audio/wav' });
    var name = 'TabLab ' + song.vibe.name.replace(/[^A-Za-z0-9 ]/g, '') + (song.letters ? ' letters' : '') + ' ' + o.bpm + ' BPM seed ' + o.seed + '.wav';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    window.TabLabLastWav = { bytes: blob.size, name: name };
    say('Saved ' + name);
  });

  $('tl-how-toggle').addEventListener('click', function () {
    var open = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', open ? 'false' : 'true');
    this.textContent = open ? 'Show how TabLab works' : 'Hide how TabLab works';
    $('tl-how-body').hidden = open;
  });
})();
