(function () {
  'use strict';
  var E = window.TabLabEngine;
  var $ = function (id) { return document.getElementById(id); };
  var status = $('status');
  var song = null, actx = null, src = null, building = false, prog = null;

  // key menu: 12 minor keys, F minor first choice
  E.KEYS.forEach(function (k, i) {
    var o = document.createElement('option'); o.value = String(i); o.textContent = k + ' minor';
    if (i === 5) o.selected = true;
    $('key').appendChild(o);
  });

  function say(msg) { status.textContent = msg; }
  function newSeed() { return String(Math.floor(Math.random() * 90000) + 10000); }
  if (!$('seed').value) $('seed').value = newSeed();

  function showVibe() {
    $('vibe-text').textContent = E.VIBES[$('vibe').value].text;
  }
  function setBpm(v) {
    $('bpm').value = String(v);
    $('bpm-val').textContent = String(v);
    $('bpm').setAttribute('aria-valuetext', v + ' BPM');
  }
  $('bpm').addEventListener('input', function () { setBpm($('bpm').value); });
  $('vibe').addEventListener('change', function () {
    prog = null;
    var v = E.VIBES[$('vibe').value];
    setBpm(v.bpm);
    showVibe();
    say(v.name + ', tempo set to ' + v.bpm + ' BPM');
  });
  showVibe();
  setBpm($('bpm').value);

  function applyPreset(p) {
    $('vibe').value = p.vibe; setBpm(p.bpm); $('key').value = String(p.key); $('length').value = p.length;
    $('opt-bomb').checked = p.bomb; $('opt-dives').checked = p.dives; $('opt-tape').checked = p.tape; $('opt-vinyl').checked = p.vinyl;
    $('seed').value = String(p.seed); prog = p.prog;
    showVibe();
    say(p.name + ' loaded: ' + E.VIBES[p.vibe].name + ', ' + p.bpm + ' BPM, ' + E.KEYS[p.key] + ' minor. Press Build beat');
  }
  $('preset-subwall').addEventListener('click', function () {
    applyPreset({ name: 'Sub Wall', vibe: 'digicore', bpm: 140, key: 5, length: 'medium', bomb: false, dives: false, tape: true, vinyl: true, seed: 140, prog: 'subwall' });
  });
  $('preset-detonator').addEventListener('click', function () {
    applyPreset({ name: 'Detonator', vibe: 'hyperpop', bpm: 155, key: 1, length: 'medium', bomb: true, dives: true, tape: true, vinyl: false, seed: 155, prog: 'detonator' });
  });

  function readOpts() {
    var seed = parseInt(String($('seed').value).replace(/[^0-9]/g, ''), 10);
    if (!isFinite(seed)) { seed = parseInt(newSeed(), 10); }
    $('seed').value = String(seed);
    return {
      vibe: $('vibe').value, bpm: parseInt($('bpm').value, 10), key: parseInt($('key').value, 10), length: $('length').value,
      bomb: $('opt-bomb').checked, dives: $('opt-dives').checked, tape: $('opt-tape').checked, vinyl: $('opt-vinyl').checked,
      seed: seed, prog: prog
    };
  }

  function stop(silent) {
    if (src) { try { src.onended = null; src.stop(); } catch (e) {} src = null; if (!silent) say('Stopped'); }
  }

  function setBusy(b) {
    building = b;
    ['build', 'again'].forEach(function (id) { $(id).setAttribute('aria-disabled', b ? 'true' : 'false'); });
  }

  function build(fresh) {
    if (building) return;
    stop(true);
    if (fresh) $('seed').value = newSeed();
    var opts = readOpts();
    setBusy(true);
    say('Building…');
    // let the status message land before the heavy work starts
    setTimeout(function () {
      var t0 = performance.now();
      E.build(opts).then(function (s) {
        song = s;
        window.TabLabLast = { rms: s.rms, duration: s.duration, seed: opts.seed, vibe: opts.vibe, ms: Math.round(performance.now() - t0), prog: s.prog };
        drawMap(s);
        $('play').disabled = false; $('stop').disabled = false; $('download').disabled = false;
        setBusy(false);
        say('Ready, ' + E.fmtTime(s.duration) + ', seed ' + opts.seed);
      }, function (err) {
        setBusy(false);
        say('Build failed: ' + (err && err.message ? err.message : 'unknown error'));
        if (window.console) console.error(err);
      });
    }, 60);
  }

  function drawMap(s) {
    var o = s.opts, ol = $('map');
    ol.textContent = '';
    $('map-summary').textContent = s.vibe.name + ', ' + o.bpm + ' BPM, ' + E.KEYS[o.key] + ' minor, seed ' + o.seed + ', ' + E.fmtTime(s.duration) + ' long.';
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

  $('build').addEventListener('click', function () { build(false); });
  $('again').addEventListener('click', function () { build(true); });

  $('play').addEventListener('click', function () {
    if (!song || building) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!actx) actx = new AC();
    if (actx.resume) actx.resume();
    stop(true);
    src = actx.createBufferSource();
    src.buffer = song.buffer;
    src.connect(actx.destination);
    src.onended = function () { src = null; say('Finished'); };
    src.start(0);
    say('Playing');
  });
  $('stop').addEventListener('click', function () { if (src) stop(false); else say('Not playing'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && src) stop(false); });

  $('download').addEventListener('click', function () {
    if (!song) return;
    var o = song.opts;
    var blob = E.encodeWav(song.buffer);
    var name = 'TabLab ' + song.vibe.name.replace(/[^A-Za-z0-9 ]/g, '') + ' ' + o.bpm + ' BPM seed ' + o.seed + '.wav';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    window.TabLabLastWav = { bytes: blob.size, name: name };
    say('Saved ' + name);
  });

  $('how-toggle').addEventListener('click', function () {
    var open = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', open ? 'false' : 'true');
    this.textContent = open ? 'Show how it works' : 'Hide how it works';
    $('how-body').hidden = open;
  });
})();
