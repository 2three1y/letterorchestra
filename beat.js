/* KeyJam Beat Studio: the center of all musical chaos.
   Step sequencer with patterns A and B, hat rolls, sliding 808, scale-locked lead,
   swing, transition FX, presets, WAV export and project files.
   Plain JavaScript and the Web Audio API. No libraries, no samples, no requests. */
(function(){
"use strict";
var $=function(id){ return document.getElementById(id); };
var root=$("studio"); if(!root) return;
var Core=window.LetterOrchestraCore||null;
var AC=window.AudioContext||window.webkitAudioContext;
var OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
var SR=44100, STEPS=16, CUR_KEY="letterorchestra.beatstudio.current", LIB_KEY="letterorchestra.beatstudio.projects";
var NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var SPOKEN=["C","C sharp","D","D sharp","E","F","F sharp","G","G sharp","A","A sharp","B"];
var SCALES={minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11]};
var TRACKS=[{id:"kick",name:"Kick"},{id:"clap",name:"Clap"},{id:"hat",name:"Hi-hat"},{id:"b808",name:"808"},{id:"lead",name:"Lead"}];
var TNAME={}; TRACKS.forEach(function(t){ TNAME[t.id]=t.name; });
var HAT_KIND={1:"single hit",2:"roll in 32nds",3:"triplet roll"};
var HAT_SHORT={1:"\u25CF",2:"2\u00D7",3:"3\u00D7"};
var FX_NAMES={none:"No FX",tape:"Tape stop",stutter:"Stutter",filter:"Filter sweep",reverse:"Reverse",riser:"Riser"};
var LEADS={saw:"Saw",square:"Square",pluck:"Pluck"};
var BASE={kick:0.95,clap:0.5,hat:0.28,b808:0.62,lead:0.42};
var reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- One live region for the whole page ---------- */
var statusEl=$("studio-status"), sayT=null;
function say(msg){
  if(!statusEl) return;
  clearTimeout(sayT); statusEl.textContent="";
  sayT=setTimeout(function(){ statusEl.textContent=msg; },60);
}

/* ---------- State ---------- */
function emptyPattern(){
  var p={}; TRACKS.forEach(function(t){ p[t.id]=[]; for(var i=0;i<STEPS;i++) p[t.id].push(t.id==="b808"||t.id==="lead"?null:0); });
  return p;
}
function freshState(){
  return {app:"letterorchestra-beatstudio",v:1,name:"Untitled beat",bpm:145,swing:0,root:1,scale:"minor",lead:"saw",
    cur:"A",chain:0,loop:true,switchFx:"riser",exportMode:"ab4",hatBrush:1,
    vol:{kick:1,clap:1,hat:1,b808:1,lead:1},mute:{kick:false,clap:false,hat:false,b808:false,lead:false},
    patterns:{A:emptyPattern(),B:emptyPattern()}};
}
var S=freshState();
function pat(){ return S.patterns[S.cur]; }
function other(p){ return p==="A"?"B":"A"; }

/* ---------- Music helpers ---------- */
function midiOf(track,deg){
  var sc=SCALES[S.scale]||SCALES.minor, o=Math.floor(deg/7), ix=((deg%7)+7)%7;
  var base=(track==="b808"?24:60)+S.root;
  return base+12*o+sc[ix];
}
function hz(m){ return 440*Math.pow(2,(m-69)/12); }
function noteName(m,spoken){ var n=((m%12)+12)%12, o=Math.floor(m/12)-1; return (spoken?SPOKEN[n]+" ":NAMES[n])+o; }
function keyName(spoken){ return (spoken?SPOKEN[S.root]:NAMES[S.root])+" "+S.scale; }
function stepDur(bpm){ return 60/(bpm||S.bpm)/4; }
function barDur(bpm){ return stepDur(bpm)*STEPS; }
function stepTime(i,sd){ return i*sd+((i%2===1)?(S.swing/100)*sd*0.6:0); }
function isOn(track,i,p){ var v=(p||pat())[track][i]; return track==="b808"||track==="lead"?!!v:v>0; }

/* ---------- Synths (work in any AudioContext, live or offline) ---------- */
function noiseBuffer(ctx){
  if(ctx.__bsNoise) return ctx.__bsNoise;
  var b=ctx.createBuffer(1,Math.floor(ctx.sampleRate*1),ctx.sampleRate), d=b.getChannelData(0), seed=12345;
  for(var i=0;i<d.length;i++){ seed=(seed*1103515245+12345)&0x7fffffff; d[i]=seed/0x3fffffff-1; }
  ctx.__bsNoise=b; return b;
}
function env(g,t,a,peak,dec){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec); }
function kick(ctx,out,t,v){
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.type="sine"; o.frequency.setValueAtTime(170,t); o.frequency.exponentialRampToValueAtTime(48,t+0.09);
  env(g,t,0.002,v,0.42); o.connect(g); g.connect(out); o.start(t); o.stop(t+0.5);
  var c=ctx.createOscillator(), cg=ctx.createGain(); c.type="square"; c.frequency.value=900;
  env(cg,t,0.001,v*0.25,0.012); c.connect(cg); cg.connect(out); c.start(t); c.stop(t+0.03);
}
function noiseHit(ctx,out,t,dur,filters,peak,a){
  var s=ctx.createBufferSource(); s.buffer=noiseBuffer(ctx);
  var node=s; filters.forEach(function(f){ var b=ctx.createBiquadFilter(); b.type=f[0]; b.frequency.value=f[1]; if(f[2]) b.Q.value=f[2]; node.connect(b); node=b; });
  var g=ctx.createGain(); env(g,t,a||0.001,peak,dur); node.connect(g); g.connect(out);
  s.start(t,Math.random()*0.5); s.stop(t+dur+0.05);
}
function clap(ctx,out,t,v){
  [0,0.011,0.022].forEach(function(o){ noiseHit(ctx,out,t+o,0.012,[["highpass",500],["bandpass",1500,0.9]],v*0.9); });
  noiseHit(ctx,out,t+0.03,0.18,[["highpass",500],["bandpass",1400,0.7]],v*0.7);
}
function hat(ctx,out,t,v){ noiseHit(ctx,out,t,0.035,[["highpass",7200],["highpass",9000]],v); }
function lead(ctx,out,t,f,dur,type,v){
  var g=ctx.createGain(), lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.Q.value=type==="pluck"?6:2;
  var oscs=[];
  if(type==="saw"){ [-8,8].forEach(function(d){ var o=ctx.createOscillator(); o.type="sawtooth"; o.frequency.value=f; o.detune.value=d; oscs.push(o); }); }
  else if(type==="square"){ var o=ctx.createOscillator(); o.type="square"; o.frequency.value=f; oscs.push(o); }
  else { var o1=ctx.createOscillator(); o1.type="sawtooth"; o1.frequency.value=f; var o2=ctx.createOscillator(); o2.type="square"; o2.frequency.value=f*2; oscs.push(o1,o2); }
  var mix=ctx.createGain(); mix.gain.value=1/oscs.length; oscs.forEach(function(o){ o.connect(mix); }); mix.connect(lp); lp.connect(g); g.connect(out);
  var end;
  if(type==="pluck"){
    lp.frequency.setValueAtTime(6000,t); lp.frequency.exponentialRampToValueAtTime(500,t+0.18);
    env(g,t,0.003,v,0.32); end=t+0.4;
  } else {
    lp.frequency.setValueAtTime(type==="saw"?4200:2800,t); lp.frequency.exponentialRampToValueAtTime(type==="saw"?2200:1600,t+0.25);
    var hold=Math.max(0.05,dur);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.006);
    g.gain.exponentialRampToValueAtTime(v*0.65,t+0.1); g.gain.setValueAtTime(v*0.65,t+hold);
    g.gain.exponentialRampToValueAtTime(0.0001,t+hold+0.08); end=t+hold+0.1;
  }
  oscs.forEach(function(o){ o.start(t); o.stop(end); });
}
function shaper(ctx,drive){
  var w=ctx.createWaveShaper(), n=1024, c=new Float32Array(n);
  for(var i=0;i<n;i++){ var x=i/(n-1)*2-1; c[i]=Math.tanh(drive*x)/Math.tanh(drive); }
  w.curve=c; return w;
}
// The 808: one oscillator per held note; a "slide" note bends the running one instead of starting a new hit.
function render808(ctx,out,notes,sd,end,v){
  var sat=shaper(ctx,2.2), post=ctx.createGain(); post.gain.value=v; sat.connect(post); post.connect(out);
  var cur=null;
  function startNote(t,f){
    var o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.setValueAtTime(f,t);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(1,t+0.004); g.gain.setTargetAtTime(0.45,t+0.05,0.7);
    o.connect(g); g.connect(sat); o.start(t); cur={o:o,g:g,f:f};
  }
  function endNote(t){ if(!cur) return; cur.g.gain.cancelScheduledValues(t); cur.g.gain.setTargetAtTime(0.0001,t,0.008); cur.o.stop(t+0.08); cur=null; }
  notes.forEach(function(n){
    var f=hz(n.m);
    if(n.s&&cur){ cur.o.frequency.setValueAtTime(cur.f,n.t); cur.o.frequency.exponentialRampToValueAtTime(f,n.t+Math.min(0.14,sd*1.4)); cur.f=f; }
    else if(n.s){ endNote(n.t); startNote(n.t,f*0.7); cur.o.frequency.exponentialRampToValueAtTime(f,n.t+Math.min(0.14,sd*1.4)); cur.f=f; }
    else { endNote(n.t); startNote(n.t,f); }
  });
  if(cur){ cur.g.gain.setTargetAtTime(0.0001,end,0.06); cur.o.stop(end+0.5); }
}
function trackGain(id){ return S.mute[id]?0:BASE[id]*S.vol[id]; }

/* Every pattern renders to one bar of audio (plus its tail). Live playback and the WAV use the same bars. */
var TAIL=1.2;
function renderBar(p,snap){
  var sd=stepDur(snap.bpm), bd=sd*STEPS, len=Math.ceil((bd+TAIL)*SR);
  var ctx; try{ ctx=new OAC(2,len,SR); }catch(e){ return Promise.reject(e); }
  var out=ctx.createGain(); out.connect(ctx.destination);
  var g={}; TRACKS.forEach(function(t){ g[t.id]=ctx.createGain(); g[t.id].gain.value=trackGain(t.id); g[t.id].connect(out); });
  for(var i=0;i<STEPS;i++){
    var t=stepTime(i,sd)+0.002;
    if(p.kick[i]) kick(ctx,g.kick,t,0.9);
    if(p.clap[i]) clap(ctx,g.clap,t,0.9);
    var h=p.hat[i];
    if(h){ var n=h===1?1:h===2?2:3; for(var k=0;k<n;k++) hat(ctx,g.hat,t+k*sd/n,0.55+0.45*(n===1?1:(k+1)/n)); }
    var ln=p.lead[i]; if(ln){ var dur=0, len2=ln.l||1; dur=len2*sd*0.92; lead(ctx,g.lead,t,hz(midiOf("lead",ln.d)),dur,snap.lead,0.5); }
  }
  var bn=[]; for(var j=0;j<STEPS;j++){ var b=p.b808[j]; if(b) bn.push({t:stepTime(j,sd)+0.002,m:midiOf("b808",b.d),s:!!b.s}); }
  render808(ctx,g.b808,bn,sd,bd+0.15,0.9);
  return startRender(ctx).then(function(buf){ return {buf:buf,bar:bd}; });
}
function startRender(ctx){
  return new Promise(function(res,rej){
    var done=false;
    ctx.oncomplete=function(e){ if(!done){ done=true; res(e.renderedBuffer); } };
    try{ var pr=ctx.startRendering(); if(pr&&pr.then) pr.then(function(b){ if(!done){ done=true; res(b); } },rej); }catch(e){ rej(e); }
  });
}
function snapKey(p){ return JSON.stringify([p,S.bpm,S.swing,S.root,S.scale,S.lead,S.vol,S.mute]); }
var cache={A:null,B:null}, pending={A:null,B:null};
function bar(name){
  var p=S.patterns[name], key=snapKey(p);
  if(cache[name]&&cache[name].key===key) return Promise.resolve(cache[name]);
  if(pending[name]&&pending[name].key===key) return pending[name].pr;
  var snap={bpm:S.bpm,lead:S.lead};
  var pr=renderBar(JSON.parse(JSON.stringify(p)),snap).then(function(r){ r.key=key; cache[name]=r; if(pending[name]&&pending[name].key===key) pending[name]=null; return r; });
  pending[name]={key:key,pr:pr}; return pr;
}
var refreshT=null;
function refreshBars(){ clearTimeout(refreshT); refreshT=setTimeout(function(){ bar("A").catch(noop); bar("B").catch(noop); },40); }
function noop(){}

/* Master: glue compressor, then a brick-ish limiter. */
function makeMaster(ctx){
  var inG=ctx.createGain(); inG.gain.value=0.9;
  var c=ctx.createDynamicsCompressor(); c.threshold.value=-14; c.knee.value=6; c.ratio.value=4; c.attack.value=0.004; c.release.value=0.2;
  var l=ctx.createDynamicsCompressor(); l.threshold.value=-2; l.knee.value=0; l.ratio.value=20; l.attack.value=0.001; l.release.value=0.06;
  var o=ctx.createGain(); o.gain.value=0.92;
  inG.connect(c); c.connect(l); l.connect(o); o.connect(ctx.destination); return inG;
}
function reversed(ctx,buf,len){
  var n=Math.min(buf.length,Math.floor(len*buf.sampleRate)), r=ctx.createBuffer(buf.numberOfChannels,n,buf.sampleRate);
  for(var c=0;c<buf.numberOfChannels;c++){ var s=buf.getChannelData(c), d=r.getChannelData(c); for(var i=0;i<n;i++) d[i]=s[n-1-i]; }
  return r;
}
// Schedule one bar (an entry from bar()) at time t with an optional transition FX. Returns the sources it made.
function scheduleBar(ctx,dest,entry,t,fx,cut){
  var bd=entry.bar, buf=entry.buf, made=[];
  function src(b){ var s=ctx.createBufferSource(); s.buffer=b; made.push(s); return s; }
  function seg(b,when,off,dur,gain){
    var s=src(b), g=ctx.createGain(); g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(gain||1,when+0.003);
    g.gain.setValueAtTime(gain||1,when+dur-0.004); g.gain.linearRampToValueAtTime(0,when+dur); s.connect(g); g.connect(dest); s.start(when,off,dur); s.stop(when+dur+0.01);
  }
  var whole=cut?bd:bd+TAIL;
  if(!fx||fx==="none"){ var s0=src(buf); s0.connect(dest); s0.start(t,0,whole); if(cut) s0.stop(t+bd); return made; }
  if(fx==="tape"){
    var s1=src(buf), g1=ctx.createGain(); s1.connect(g1); g1.connect(dest);
    s1.playbackRate.setValueAtTime(1,t+bd*0.5); s1.playbackRate.linearRampToValueAtTime(0.06,t+bd);
    g1.gain.setValueAtTime(1,t+bd*0.8); g1.gain.linearRampToValueAtTime(0,t+bd);
    s1.start(t); s1.stop(t+bd); return made;
  }
  if(fx==="stutter"){
    seg(buf,t,0,bd/2);
    var e=bd/8, sx=bd/16, x=bd/32, off=bd/2, w=t+bd/2;
    [e,e,sx,sx,x,x,x,x].forEach(function(d,k){ seg(buf,w,off,d,0.75+0.25*k/7); w+=d; });
    return made;
  }
  if(fx==="filter"){
    var s2=src(buf), f=ctx.createBiquadFilter(); f.type="lowpass"; f.Q.value=7;
    f.frequency.setValueAtTime(16000,t); f.frequency.exponentialRampToValueAtTime(220,t+bd);
    s2.connect(f); f.connect(dest); s2.start(t,0,whole); if(cut) s2.stop(t+bd); return made;
  }
  if(fx==="reverse"){
    seg(buf,t,0,bd/2);
    var r=reversed(ctx,buf,bd), s3=src(r), g3=ctx.createGain();
    g3.gain.setValueAtTime(0.2,t+bd/2); g3.gain.exponentialRampToValueAtTime(1,t+bd-0.01); g3.gain.linearRampToValueAtTime(0,t+bd);
    s3.connect(g3); g3.connect(dest); s3.start(t+bd/2,0,bd/2); s3.stop(t+bd); return made;
  }
  if(fx==="riser"){
    var s4=src(buf); s4.connect(dest); s4.start(t,0,whole); if(cut) s4.stop(t+bd);
    var n=src(noiseBuffer(ctx)); n.loop=true; var bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=2.5;
    bp.frequency.setValueAtTime(300,t); bp.frequency.exponentialRampToValueAtTime(9000,t+bd);
    var ng=ctx.createGain(); ng.gain.setValueAtTime(0.0001,t); ng.gain.exponentialRampToValueAtTime(0.5,t+bd-0.01); ng.gain.linearRampToValueAtTime(0,t+bd);
    n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(t); n.stop(t+bd);
    var o=ctx.createOscillator(); o.type="sawtooth"; o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(880,t+bd);
    var og=ctx.createGain(); og.gain.setValueAtTime(0.0001,t); og.gain.exponentialRampToValueAtTime(0.07,t+bd-0.01); og.gain.linearRampToValueAtTime(0,t+bd);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t+bd); made.push(o);
    return made;
  }
  return made;
}

/* ---------- Live playback ---------- */
var L={on:false,ctx:null,master:null,next:0,count:0,limit:Infinity,playing:"A",inPat:0,fxq:null,switchReq:false,switchAfter:false,timer:null,ui:[],sources:[]};
function liveCtx(){
  var c=null;
  if(Core&&Core.ensure){ try{ c=Core.ensure(); }catch(e){ c=null; } }
  if(!c&&AC){ if(!L.own){ try{ L.own=new AC(); }catch(e){} } c=L.own||null; if(c&&c.state!=="running"&&c.resume) c.resume(); }
  if(c&&L.ctx!==c){ L.ctx=c; L.master=makeMaster(c); }
  return c;
}
function nextPlan(){
  if(L.switchAfter){ L.switchAfter=false; L.playing=other(L.playing); L.inPat=0; }
  var plan={pat:L.playing,fx:null};
  if(L.fxq){ plan.fx=L.fxq; L.fxq=null; }
  var fxSw=S.switchFx!=="none"?S.switchFx:null;
  if(L.switchReq){
    L.switchReq=false;
    if(fxSw||plan.fx){ plan.fx=plan.fx||fxSw; L.switchAfter=true; }
    else { L.playing=other(L.playing); L.inPat=0; plan.pat=L.playing; }
  } else if(S.chain&&L.inPat===S.chain-1){
    if(fxSw){ plan.fx=plan.fx||fxSw; L.switchAfter=true; }
    else { L.switchAfter=true; }
  }
  L.inPat++;
  return plan;
}
var lastShownPat=null;
function tick(){
  var c=L.ctx; if(!L.on||!c) return;
  while(L.on&&L.next<c.currentTime+0.3){
    if(L.count>=L.limit){ var endAt=L.next; L.ui.push({t:endAt,fn:function(){ stop(true); }}); L.limit=-1; break; }
    if(L.limit<0) break;
    var plan=nextPlan(), entry=cache[plan.pat];
    if(!entry){ bar(plan.pat).catch(noop); L.next+=barDur(); L.count++; continue; }
    if(cache[plan.pat].key!==snapKey(S.patterns[plan.pat])) bar(plan.pat).catch(noop);
    var made=scheduleBar(c,L.master,entry,L.next,plan.fx,false);
    made.forEach(function(s){ L.sources.push(s); s.onended=function(){ var k=L.sources.indexOf(s); if(k>=0) L.sources.splice(k,1); }; });
    (function(p,fx,t0,sd){
      L.ui.push({t:t0,fn:function(){
        if(S.cur!==p){ S.cur=p; syncPattern(); say("Pattern "+p); }
        if(fx) setNow("fx",fx);
      }});
      for(var i=0;i<STEPS;i++) (function(i){ L.ui.push({t:t0+i*sd,fn:function(){ showStep(i); }}); })(i);
    })(plan.pat,plan.fx,L.next,entry.bar/STEPS);
    L.next+=entry.bar; L.count++;
  }
  while(L.ui.length&&L.ui[0].t<=c.currentTime){ L.ui.shift().fn(); }
}
function play(opts){
  opts=opts||{};
  var c=liveCtx(); if(!c){ say("This browser has no Web Audio, so no sound."); return Promise.resolve(false); }
  stop(false);
  return Promise.all([bar("A"),bar("B")]).then(function(){
    L.on=true; L.playing=S.cur; L.inPat=0; L.count=0; L.switchReq=false; L.switchAfter=false; L.ui=[];
    L.fxq=opts.fx||null;
    L.limit=opts.once?1:(S.loop?Infinity:(S.chain?S.chain*2:1));
    L.next=c.currentTime+0.08;
    tick(); L.timer=setInterval(tick,25);
    setPlayUI(true);
    if(!opts.quiet) say("Playing pattern "+S.cur+", "+S.bpm+" BPM");
    return true;
  }).catch(function(e){ say("Could not start the audio: "+(e&&e.message||e)); return false; });
}
function stop(announce){
  var was=L.on;
  L.on=false; clearInterval(L.timer); L.timer=null; L.ui=[];
  L.sources.splice(0).forEach(function(s){ try{ s.onended=null; s.stop(); }catch(e){} });
  showStep(-1); setNow("fx",null); setPlayUI(false);
  if(was&&announce) say("Stopped");
}
function toggle(){ if(L.on) stop(true); else play(); }

/* ---------- Export WAV ---------- */
function encodeWav(buf){
  var ch=2, n=buf.length, sr=buf.sampleRate, bytes=n*ch*2, ab=new ArrayBuffer(44+bytes), v=new DataView(ab), p=0;
  function s(t){ for(var i=0;i<t.length;i++) v.setUint8(p++,t.charCodeAt(i)); }
  function u32(x){ v.setUint32(p,x,true); p+=4; } function u16(x){ v.setUint16(p,x,true); p+=2; }
  s("RIFF"); u32(36+bytes); s("WAVE"); s("fmt "); u32(16); u16(1); u16(ch); u32(sr); u32(sr*ch*2); u16(ch*2); u16(16); s("data"); u32(bytes);
  var L0=buf.getChannelData(0), R0=buf.numberOfChannels>1?buf.getChannelData(1):L0;
  for(var i=0;i<n;i++){ for(var c=0;c<2;c++){ var x=Math.max(-1,Math.min(1,(c?R0:L0)[i])); v.setInt16(p,x<0?x*0x8000:x*0x7fff,true); p+=2; } }
  return new Blob([ab],{type:"audio/wav"});
}
function exportPlan(){
  var m=S.exportMode, plan=[], i, fx=S.switchFx!=="none"?S.switchFx:null;
  if(m==="cur4"){ for(i=0;i<4;i++) plan.push({pat:S.cur,fx:null}); return plan; }
  var n=m==="ab8"?8:4;
  for(i=0;i<n;i++) plan.push({pat:"A",fx:i===n-1?fx:null});
  for(i=0;i<n;i++) plan.push({pat:"B",fx:null});
  return plan;
}
function renderSong(){
  if(!OAC) return Promise.reject(new Error("This browser cannot render audio files"));
  return Promise.all([bar("A"),bar("B")]).then(function(r){
    var bars={A:r[0],B:r[1]}, plan=exportPlan(), total=0;
    plan.forEach(function(b){ total+=bars[b.pat].bar; });
    var len=Math.ceil((total+0.02)*SR), ctx=new OAC(2,len,SR), dest=makeMaster(ctx), t=0;
    plan.forEach(function(b,ix){ scheduleBar(ctx,dest,bars[b.pat],t,b.fx,ix===plan.length-1); t+=bars[b.pat].bar; });
    return startRender(ctx).then(function(buf){ return {buf:buf,bars:plan.length,seconds:total}; });
  });
}
function fileBase(){ return (S.name||"Untitled beat").replace(/[\\\/:*?"<>|]+/g,"").trim()||"Untitled beat"; }
function download(blob,name){
  var url=URL.createObjectURL(blob), a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },4000);
}
var lastExport=null;
function exportWav(){
  say("Making "+fileBase()+".wav");
  return renderSong().then(function(r){
    var d=r.buf.getChannelData(0), peak=0; for(var i=0;i<d.length;i+=7){ var a=Math.abs(d[i]); if(a>peak) peak=a; }
    var blob=encodeWav(r.buf); lastExport={bytes:blob.size,seconds:r.seconds,bars:r.bars,peak:peak};
    download(blob,fileBase()+".wav");
    say("Saved "+fileBase()+".wav: "+r.bars+" bars, "+Math.round(r.seconds)+" seconds");
    return lastExport;
  }).catch(function(e){ say("Export failed: "+(e&&e.message||e)); throw e; });
}

/* ---------- Audition single sounds ---------- */
function audition(track,i){
  if(L.on) return;
  var c=liveCtx(); if(!c) return;
  var t=c.currentTime+0.02, g=c.createGain(); g.gain.value=trackGain(track)||BASE[track]; g.connect(L.master);
  var p=pat(), sd=stepDur();
  if(track==="kick") kick(c,g,t,0.9);
  else if(track==="clap") clap(c,g,t,0.9);
  else if(track==="hat"){ var h=p.hat[i]||1, n=h===1?1:h===2?2:3; for(var k=0;k<n;k++) hat(c,g,t+k*sd/n,0.8); }
  else if(track==="lead"&&p.lead[i]) lead(c,g,t,hz(midiOf("lead",p.lead[i].d)),(p.lead[i].l||1)*sd,S.lead,0.5);
  else if(track==="b808"&&p.b808[i]) render808(c,g,[{t:t,m:midiOf("b808",p.b808[i].d),s:false}],sd,t+0.5,0.9);
  setTimeout(function(){ try{ g.disconnect(); }catch(e){} },1500);
}

/* ---------- Presets (from the beat-school sound bible) ---------- */
function drums(str){ return str.split("").map(function(ch){ return ch==="x"?1:0; }); }
function hats(str){ return str.split("").map(function(ch){ return ch==="x"?1:ch==="r"?2:ch==="t"?3:0; }); }
function notes(list,slideKey){ var a=[]; for(var i=0;i<STEPS;i++) a.push(null); list.forEach(function(n){ var o={d:n[1]}; if(slideKey) o.s=!!n[2]; else o.l=n[2]||1; a[n[0]]=o; }); return a; }
function P(k,c,h,b,l){ return {kick:drums(k),clap:drums(c),hat:hats(h),b808:notes(b,true),lead:notes(l,false)}; }
var PRESETS={
  dark:{label:"Dark 145, C sharp minor",bpm:145,swing:0,root:1,scale:"minor",lead:"pluck",switchFx:"tape",
    A:P("x.....x...x.....","........x...x...","x.x.x...x.x.x.x.",[[0,0],[6,0],[10,5],[13,2,1]],[[0,7],[3,9],[6,8],[10,7],[12,4],[14,5]]),
    B:P("x.....x...x..x..","........x...x..x","x.x.xrx.x.x.x.t.",[[0,0],[3,7,1],[6,0,1],[10,5],[13,2,1],[15,0,1]],[[0,14],[2,12],[3,16],[6,15],[8,14],[10,11],[12,12],[14,9]])},
  digicore:{label:"Digicore 160, D major",bpm:160,swing:0,root:2,scale:"major",lead:"square",switchFx:"stutter",
    A:P("x.........x.....","....x.......x...","x.x.x.x.x.x.x.x.",[[0,5],[4,0,1],[8,3],[12,4,1]],[[0,5],[1,7],[2,9],[4,7],[5,9],[6,11],[8,3],[9,5],[10,7],[12,4],[13,6],[14,8]]),
    B:P("x.....x...x.....","....x.......x.x.","x.x.x.xtx.x.x.r.",[[0,5],[3,7,1],[4,0,1],[8,3],[11,7,1],[12,4,1]],[[0,12],[1,14],[2,16],[3,14],[4,14],[5,16],[6,18],[8,10],[9,12],[10,14],[11,12],[12,11],[13,13],[14,15],[15,13]])},
  jerk:{label:"Jerk 150, F sharp minor",bpm:150,swing:15,root:6,scale:"minor",lead:"saw",switchFx:"filter",
    A:P("x..x..x...x.x...","....x.......x...","..x...x...x...x.",[[0,0],[3,0],[6,2,1],[10,0],[12,-2,1]],[[2,7,1],[6,6,1],[10,4,2],[14,2,1]]),
    B:P("x..x..x...x.x.x.","....x..x....x...","..x.r.x...x.t.x.",[[0,0],[3,7,1],[6,2,1],[10,0],[12,-2,1],[14,0,1]],[[0,9,1],[2,7,1],[4,9,1],[6,6,1],[8,11,2],[10,9,1],[12,7,1],[14,4,1]])}
};
function loadPreset(id){
  var pr=PRESETS[id]; if(!pr) return;
  stop(false);
  S.bpm=pr.bpm; S.swing=pr.swing; S.root=pr.root; S.scale=pr.scale; S.lead=pr.lead; S.switchFx=pr.switchFx; S.cur="A";
  S.patterns={A:JSON.parse(JSON.stringify(pr.A)),B:JSON.parse(JSON.stringify(pr.B))};
  if(!S.name||S.name==="Untitled beat"||/^(Dark|Digicore|Jerk) /.test(S.name)) S.name=pr.label.replace(/,/,"").replace(/ sharp/,"#");
  syncAll(); changed();
  say("Preset "+pr.label+" loaded. Pattern A is drop 1, pattern B is drop 2.");
}
function chaos(){
  var p=pat(), rng=Math.random, any=false, i;
  for(i=0;i<STEPS;i++) if(p.lead[i]) any=true;
  for(i=0;i<STEPS;i++){
    if(any?p.lead[i]:rng()<0.45) p.lead[i]={d:Math.floor(rng()*12)+2,l:rng()<0.2?2:1};
    if(p.b808[i]) p.b808[i]={d:[0,0,0,5,2,3,4,7][Math.floor(rng()*8)],s:rng()<0.3};
  }
  syncGrid(); changed(); say("New chaos melody in "+keyName(true));
}

/* ---------- UI ---------- */
var gridEl=$("bs-grid"), focusPos={t:0,s:0};
var ED={track:"b808",step:0};
function stepLabel(track,i){
  var p=pat(), v=p[track][i], on=isOn(track,i), s=TNAME[track]+", step "+(i+1)+", "+(on?"on":"off");
  if(!on) return s;
  if(track==="hat"&&v>1) s+=", "+HAT_KIND[v];
  if(track==="b808") s+=", "+noteName(midiOf("b808",v.d),true)+(v.s?", slides in":"");
  if(track==="lead") s+=", "+noteName(midiOf("lead",v.d),true)+((v.l||1)>1?", "+v.l+" steps long":"");
  return s;
}
function stepFace(track,i){
  var v=pat()[track][i]; if(!isOn(track,i)) return "";
  if(track==="hat") return HAT_SHORT[v];
  if(track==="b808") return (v.s?"~":"")+noteName(midiOf("b808",v.d)).replace(/-?\d+$/,"");
  if(track==="lead") return noteName(midiOf("lead",v.d)).replace(/-?\d+$/,"");
  return "\u25CF";
}
function buildGrid(){
  gridEl.textContent="";
  TRACKS.forEach(function(t,ti){
    var box=document.createElement("div"); box.className="bs-track bs-"+t.id;
    var head=document.createElement("div"); head.className="bs-head";
    var h=document.createElement("h4"); h.id="bs-h-"+t.id; h.textContent=t.name; head.appendChild(h);
    var m=document.createElement("button"); m.type="button"; m.className="bs-mini"; m.id="bs-mute-"+t.id; m.textContent="Mute";
    m.setAttribute("aria-label","Mute "+t.name); m.setAttribute("aria-pressed","false"); m.dataset.mute=t.id; head.appendChild(m);
    box.appendChild(head);
    var g=document.createElement("div"); g.className="bs-steps"; g.setAttribute("role","group"); g.setAttribute("aria-labelledby",h.id);
    for(var i=0;i<STEPS;i++){
      var b=document.createElement("button"); b.type="button"; b.className="bs-step"+(i%4===0?" beat":"");
      b.id="bs-"+t.id+"-"+i; b.dataset.t=ti; b.dataset.s=i; b.tabIndex=(ti===0&&i===0)?0:-1;
      g.appendChild(b);
    }
    box.appendChild(g); gridEl.appendChild(box);
  });
}
function refreshStep(track,i){
  var b=$("bs-"+track+"-"+i); if(!b) return;
  var on=isOn(track,i);
  b.classList.toggle("on",on); b.setAttribute("aria-label",stepLabel(track,i));
  var f=stepFace(track,i); b.textContent=f; b.dataset.face=f?"1":"";
  b.classList.toggle("sel",(track===ED.track&&i===ED.step));
}
function syncGrid(){ TRACKS.forEach(function(t){ for(var i=0;i<STEPS;i++) refreshStep(t.id,i); }); syncEditor(); updateReadout(); }
function syncPattern(){
  ["A","B"].forEach(function(p){ var b=$("bs-pat-"+p); b.setAttribute("aria-pressed",S.cur===p?"true":"false"); });
  $("bs-grid-h").textContent="Pattern "+S.cur+" grid ("+(S.cur==="A"?"drop 1":"drop 2")+")";
  syncGrid();
}
function syncControls(){
  $("bs-bpm").value=S.bpm; $("bs-bpm-val").textContent=S.bpm; $("bs-bpm").setAttribute("aria-valuetext",S.bpm+" BPM");
  $("bs-swing").value=S.swing; $("bs-swing-val").textContent=S.swing; $("bs-swing").setAttribute("aria-valuetext",S.swing+" percent");
  $("bs-root").value=String(S.root); $("bs-scale").value=S.scale; $("bs-lead").value=S.lead;
  $("bs-chain").value=String(S.chain); $("bs-switchfx").value=S.switchFx; $("bs-export-mode").value=S.exportMode;
  $("bs-hatbrush").value=String(S.hatBrush); $("bs-name").value=S.name;
  $("bs-loop").setAttribute("aria-pressed",S.loop?"true":"false");
  TRACKS.forEach(function(t){
    $("bs-mute-"+t.id).setAttribute("aria-pressed",S.mute[t.id]?"true":"false");
    $("bs-box-"+t.id).classList.toggle("muted",!!S.mute[t.id]);
    var v=$("bs-vol-"+t.id); v.value=Math.round(S.vol[t.id]*100); v.setAttribute("aria-valuetext",Math.round(S.vol[t.id]*100)+" percent");
    $("bs-vol-"+t.id+"-val").textContent=Math.round(S.vol[t.id]*100);
  });
}
function syncAll(){ syncControls(); syncPattern(); }
function setPlayUI(on){ var b=$("bs-play"); b.textContent=on?"Stop":"Play"; b.classList.toggle("is-on",on); }
var shown=-1;
function showStep(i){
  if(shown===i) return;
  var old=gridEl.querySelectorAll(".bs-step.now"); for(var k=0;k<old.length;k++) old[k].classList.remove("now");
  shown=i; if(i<0) return;
  var now=gridEl.querySelectorAll('.bs-step[data-s="'+i+'"]'); for(var j=0;j<now.length;j++) now[j].classList.add("now");
}
function setNow(kind,fx){
  var bs=root.querySelectorAll(".bs-fx button"); for(var i=0;i<bs.length;i++) bs[i].classList.toggle("is-on",bs[i].dataset.fx===fx);
}

/* Note editor */
function syncEditor(){
  var p=pat(), tsel=$("bs-ed-track"), ssel=$("bs-ed-step");
  tsel.value=ED.track; ssel.textContent="";
  for(var i=0;i<STEPS;i++){
    var o=document.createElement("option"); o.value=i; var v=p[ED.track][i];
    o.textContent="Step "+(i+1)+": "+(v?noteName(midiOf(ED.track,v.d))+(ED.track==="b808"&&v.s?" slide":"")+(ED.track==="lead"&&(v.l||1)>1?" ("+v.l+" steps)":""):"empty");
    ssel.appendChild(o);
  }
  ssel.value=String(ED.step);
  var v2=p[ED.track][ED.step], d=$("bs-ed-desc");
  d.textContent=v2?TNAME[ED.track]+", step "+(ED.step+1)+": "+noteName(midiOf(ED.track,v2.d),true)+(ED.track==="b808"?(v2.s?", slides in from the last note":", hits fresh"):(", "+(v2.l||1)+" step"+((v2.l||1)>1?"s":"")+" long")):TNAME[ED.track]+", step "+(ED.step+1)+" is empty. Turn it on in the grid or press Add note.";
  var has=!!v2;
  ["bs-ed-down","bs-ed-up","bs-ed-octdown","bs-ed-octup","bs-ed-hear","bs-ed-del"].forEach(function(id){ $(id).disabled=!has; });
  $("bs-ed-add").disabled=has;
  var sl=$("bs-ed-slide"); sl.hidden=ED.track!=="b808"; sl.disabled=!has; sl.setAttribute("aria-pressed",has&&v2.s?"true":"false");
  $("bs-ed-longer").hidden=ED.track!=="lead"; $("bs-ed-shorter").hidden=ED.track!=="lead";
  $("bs-ed-longer").disabled=!has; $("bs-ed-shorter").disabled=!has;
  TRACKS.forEach(function(t){ for(var i=0;i<STEPS;i++){ var b=$("bs-"+t.id+"-"+i); if(b) b.classList.toggle("sel",t.id===ED.track&&i===ED.step); } });
}
var lastDeg={b808:0,lead:7};
function toggleStep(track,i){
  var p=pat();
  if(track==="hat") p.hat[i]=p.hat[i]?0:S.hatBrush;
  else if(track==="b808"||track==="lead"){
    if(p[track][i]) p[track][i]=null;
    else { p[track][i]=track==="b808"?{d:lastDeg.b808,s:false}:{d:lastDeg.lead,l:1}; }
    ED.track=track; ED.step=i;
  }
  else p[track][i]=p[track][i]?0:1;
  refreshStep(track,i); syncEditor(); changed();
  if(isOn(track,i)) audition(track,i);
}
function editNote(fn,msg){
  var p=pat(), v=p[ED.track][ED.step]; if(!v) return;
  fn(v); lastDeg[ED.track]=v.d;
  refreshStep(ED.track,ED.step); syncEditor(); changed(); audition(ED.track,ED.step);
  say(msg?msg(v):noteName(midiOf(ED.track,v.d),true));
}
function clampDeg(track,d){ return track==="b808"?Math.max(-7,Math.min(14,d)):Math.max(-7,Math.min(21,d)); }

/* Readout: the whole pattern in words */
function list(a){ return a.length?a.join(", "):"nothing"; }
function describe(name){
  var p=S.patterns[name], out=[], i;
  out.push("Pattern "+name+" ("+(name==="A"?"drop 1":"drop 2")+"). "+S.bpm+" BPM, "+keyName(true)+", swing "+S.swing+" percent, lead sound "+LEADS[S.lead]+".");
  ["kick","clap"].forEach(function(t){ var s=[]; for(i=0;i<STEPS;i++) if(p[t][i]) s.push(i+1); out.push(TNAME[t]+(S.mute[t]?" (muted)":"")+": "+(s.length?s.length+" hit"+(s.length>1?"s":"")+" on step"+(s.length>1?"s ":" ")+list(s):"off")+"."); });
  var hs=[], rolls=[]; for(i=0;i<STEPS;i++){ if(p.hat[i]) hs.push(i+1); if(p.hat[i]>1) rolls.push(HAT_KIND[p.hat[i]]+" on step "+(i+1)); }
  out.push("Hi-hat"+(S.mute.hat?" (muted)":"")+": "+(hs.length?"steps "+list(hs)+(rolls.length?". Rolls: "+list(rolls):""):"off")+".");
  ["b808","lead"].forEach(function(t){ var s=[]; for(i=0;i<STEPS;i++){ var v=p[t][i]; if(v) s.push("step "+(i+1)+" "+noteName(midiOf(t,v.d),true)+(t==="b808"&&v.s?" slide":"")+(t==="lead"&&(v.l||1)>1?" for "+v.l+" steps":"")); }
    out.push(TNAME[t]+(S.mute[t]?" (muted)":"")+": "+(s.length?list(s):"off")+"."); });
  return out;
}
var roT=null;
function updateReadout(){
  clearTimeout(roT); roT=setTimeout(function(){
    var el=$("bs-readout"); el.textContent="";
    describe(S.cur).forEach(function(line){ var pEl=document.createElement("p"); pEl.textContent=line; el.appendChild(pEl); });
    var arr=document.createElement("p"); arr.textContent="Auto switch: "+(S.chain?"every "+S.chain+" bars":"off")+". Switch FX: "+FX_NAMES[S.switchFx]+". Loop "+(S.loop?"on":"off")+".";
    el.appendChild(arr);
  },30);
}

/* Saving */
var saveT=null;
function changed(){
  refreshBars(); updateReadout();
  clearTimeout(saveT); saveT=setTimeout(function(){ try{ localStorage.setItem(CUR_KEY,JSON.stringify(S)); }catch(e){} },300);
}
function sanitize(o){
  var s=freshState(); if(!o||typeof o!=="object") return s;
  ["name"].forEach(function(k){ if(typeof o[k]==="string") s[k]=o[k].slice(0,80); });
  if(+o.bpm>=60&&+o.bpm<=200) s.bpm=Math.round(+o.bpm);
  if(+o.swing>=0&&+o.swing<=60) s.swing=Math.round(+o.swing);
  if(+o.root>=0&&+o.root<=11) s.root=Math.round(+o.root);
  if(SCALES[o.scale]) s.scale=o.scale; if(LEADS[o.lead]) s.lead=o.lead; if(FX_NAMES[o.switchFx]) s.switchFx=o.switchFx;
  if([0,4,8].indexOf(+o.chain)>=0) s.chain=+o.chain; if(typeof o.loop==="boolean") s.loop=o.loop;
  if(["cur4","ab4","ab8"].indexOf(o.exportMode)>=0) s.exportMode=o.exportMode;
  if([1,2,3].indexOf(+o.hatBrush)>=0) s.hatBrush=+o.hatBrush;
  if(o.cur==="B") s.cur="B";
  TRACKS.forEach(function(t){ if(o.vol&&+o.vol[t.id]>=0&&+o.vol[t.id]<=1) s.vol[t.id]=+o.vol[t.id]; if(o.mute) s.mute[t.id]=!!o.mute[t.id]; });
  ["A","B"].forEach(function(pn){
    var src=o.patterns&&o.patterns[pn]; if(!src) return;
    TRACKS.forEach(function(t){ var a=src[t.id]; if(!Array.isArray(a)) return;
      for(var i=0;i<STEPS;i++){ var v=a[i];
        if(t.id==="b808"&&v&&typeof v==="object") s.patterns[pn].b808[i]={d:clampDeg("b808",Math.round(+v.d||0)),s:!!v.s};
        else if(t.id==="lead"&&v&&typeof v==="object") s.patterns[pn].lead[i]={d:clampDeg("lead",Math.round(+v.d||0)),l:Math.max(1,Math.min(8,Math.round(+v.l||1)))};
        else if(t.id==="hat") s.patterns[pn].hat[i]=[0,1,2,3].indexOf(+v)>=0?+v:(v?1:0);
        else if(t.id==="kick"||t.id==="clap") s.patterns[pn][t.id][i]=v?1:0; } });
  });
  return s;
}
function lib(){ try{ return JSON.parse(localStorage.getItem(LIB_KEY)||"{}")||{}; }catch(e){ return {}; } }
function syncLib(keep){
  var sel=$("bs-lib"), l=lib(), names=Object.keys(l).sort(); sel.textContent="";
  if(!names.length){ var o=document.createElement("option"); o.value=""; o.textContent="No saved beats yet"; sel.appendChild(o); }
  names.forEach(function(n){ var o=document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o); });
  if(keep&&l[keep]) sel.value=keep;
  $("bs-lib-load").disabled=!names.length; $("bs-lib-del").disabled=!names.length;
}

/* ---------- Wiring ---------- */
buildGrid();
TRACKS.forEach(function(t){ var box=$("bs-h-"+t.id).parentNode.parentNode; box.id="bs-box-"+t.id; });
// hat brush + lead sound live in their track headers
(function(){
  var hh=$("bs-h-hat").parentNode, lh=$("bs-h-lead").parentNode;
  hh.appendChild($("bs-hatbrush-wrap")); lh.appendChild($("bs-lead-wrap"));
})();

gridEl.addEventListener("click",function(e){
  var m=e.target.closest("[data-mute]");
  if(m){ var id=m.dataset.mute; S.mute[id]=!S.mute[id]; syncControls(); changed(); say(TNAME[id]+(S.mute[id]?" muted":" unmuted")); return; }
  var b=e.target.closest(".bs-step"); if(!b) return;
  var ti=+b.dataset.t, i=+b.dataset.s; setFocus(ti,i,false);
  toggleStep(TRACKS[ti].id,i);
});
function setFocus(ti,i,move){
  var prev=gridEl.querySelector('.bs-step[tabindex="0"]'); if(prev) prev.tabIndex=-1;
  var b=$("bs-"+TRACKS[ti].id+"-"+i); b.tabIndex=0; focusPos={t:ti,s:i}; if(move) b.focus();
}
gridEl.addEventListener("keydown",function(e){
  var b=e.target.closest(".bs-step"); if(!b) return;
  var ti=+b.dataset.t, i=+b.dataset.s, track=TRACKS[ti].id, k=e.key, nt=ti, ns=i;
  if(k==="ArrowRight") ns=Math.min(STEPS-1,i+1); else if(k==="ArrowLeft") ns=Math.max(0,i-1);
  else if(k==="ArrowDown") nt=Math.min(TRACKS.length-1,ti+1); else if(k==="ArrowUp") nt=Math.max(0,ti-1);
  else if(k==="Home") ns=0; else if(k==="End") ns=STEPS-1;
  else if((k==="r"||k==="R")&&track==="hat"){ e.preventDefault(); var p=pat(); p.hat[i]=p.hat[i]?(p.hat[i]%3)+1:2; refreshStep("hat",i); changed(); audition("hat",i); say(TNAME.hat+", step "+(i+1)+", "+HAT_KIND[p.hat[i]]); return; }
  else if((k==="+"||k==="="||k==="-"||k==="_")&&(track==="b808"||track==="lead")&&pat()[track][i]){ e.preventDefault(); ED.track=track; ED.step=i; var up=(k==="+"||k==="="); editNote(function(v){ v.d=clampDeg(track,v.d+(up?1:-1)); }); return; }
  else if((k==="s"||k==="S")&&track==="b808"&&pat().b808[i]){ e.preventDefault(); ED.track="b808"; ED.step=i; editNote(function(v){ v.s=!v.s; },function(v){ return v.s?"Slide on":"Slide off"; }); return; }
  else return;
  e.preventDefault(); setFocus(nt,ns,true);
});

$("bs-play").addEventListener("click",toggle);
$("bs-loop").addEventListener("click",function(){ S.loop=!S.loop; syncControls(); changed(); if(L.on) L.limit=S.loop?Infinity:L.count+(S.chain?S.chain*2:1); say("Loop "+(S.loop?"on":"off")); });
["A","B"].forEach(function(p){ $("bs-pat-"+p).addEventListener("click",function(){
  if(L.on){
    if(L.playing===p&&!L.switchAfter){ say("Already on pattern "+p); return; }
    L.switchReq=true; say("Switching to pattern "+p+" at the next bar"+(S.switchFx!=="none"?", after the "+FX_NAMES[S.switchFx].toLowerCase():""));
  } else { S.cur=p; syncPattern(); changed(); say("Pattern "+p); }
}); });
$("bs-copy").addEventListener("click",function(){ var o=other(S.cur); S.patterns[o]=JSON.parse(JSON.stringify(pat())); changed(); say("Copied pattern "+S.cur+" to pattern "+o); });
$("bs-clear").addEventListener("click",function(){ S.patterns[S.cur]=emptyPattern(); syncGrid(); changed(); say("Pattern "+S.cur+" cleared"); });
$("bs-chaos").addEventListener("click",chaos);
Array.prototype.forEach.call(root.querySelectorAll("[data-preset]"),function(b){ b.addEventListener("click",function(){ loadPreset(b.dataset.preset); }); });
Array.prototype.forEach.call(root.querySelectorAll(".bs-fx button"),function(b){ b.addEventListener("click",function(){
  var fx=b.dataset.fx;
  if(L.on){ L.fxq=fx; say(FX_NAMES[fx]+" on the next bar"); }
  else { play({fx:fx,once:true,quiet:true}); say(FX_NAMES[fx]+": one bar preview"); }
}); });
function slider(id,key,unit,announce){
  var el=$(id);
  el.addEventListener("input",function(){ S[key]=+el.value; $(id+"-val").textContent=el.value; el.setAttribute("aria-valuetext",el.value+unit); changed(); });
  if(announce) el.addEventListener("change",function(){ say(announce(+el.value)); });
}
slider("bs-bpm","bpm"," BPM",null);
slider("bs-swing","swing"," percent",null);
$("bs-root").addEventListener("change",function(){ S.root=+this.value; syncGrid(); changed(); say("Key "+keyName(true)); });
$("bs-scale").addEventListener("change",function(){ S.scale=this.value; syncGrid(); changed(); say("Key "+keyName(true)); });
$("bs-lead").addEventListener("change",function(){ S.lead=this.value; changed(); });
$("bs-hatbrush").addEventListener("change",function(){ S.hatBrush=+this.value; changed(); });
$("bs-chain").addEventListener("change",function(){ S.chain=+this.value; changed(); });
$("bs-switchfx").addEventListener("change",function(){ S.switchFx=this.value; changed(); });
$("bs-export-mode").addEventListener("change",function(){ S.exportMode=this.value; changed(); });
TRACKS.forEach(function(t){ var v=$("bs-vol-"+t.id); v.addEventListener("input",function(){ S.vol[t.id]=+v.value/100; $("bs-vol-"+t.id+"-val").textContent=v.value; v.setAttribute("aria-valuetext",v.value+" percent"); changed(); }); });

// note editor
$("bs-ed-track").addEventListener("change",function(){ ED.track=this.value; syncEditor(); });
$("bs-ed-step").addEventListener("change",function(){ ED.step=+this.value; syncEditor(); });
$("bs-ed-up").addEventListener("click",function(){ editNote(function(v){ v.d=clampDeg(ED.track,v.d+1); }); });
$("bs-ed-down").addEventListener("click",function(){ editNote(function(v){ v.d=clampDeg(ED.track,v.d-1); }); });
$("bs-ed-octup").addEventListener("click",function(){ editNote(function(v){ v.d=clampDeg(ED.track,v.d+7); }); });
$("bs-ed-octdown").addEventListener("click",function(){ editNote(function(v){ v.d=clampDeg(ED.track,v.d-7); }); });
$("bs-ed-slide").addEventListener("click",function(){ editNote(function(v){ v.s=!v.s; },function(v){ return v.s?"Slide on":"Slide off"; }); });
$("bs-ed-longer").addEventListener("click",function(){ editNote(function(v){ v.l=Math.min(8,(v.l||1)+1); },function(v){ return v.l+" steps long"; }); });
$("bs-ed-shorter").addEventListener("click",function(){ editNote(function(v){ v.l=Math.max(1,(v.l||1)-1); },function(v){ return v.l+" step"+(v.l>1?"s":"")+" long"; }); });
$("bs-ed-hear").addEventListener("click",function(){ audition(ED.track,ED.step); });
$("bs-ed-add").addEventListener("click",function(){ toggleStep(ED.track,ED.step); say(TNAME[ED.track]+", step "+(ED.step+1)+" added"); });
$("bs-ed-del").addEventListener("click",function(){ pat()[ED.track][ED.step]=null; refreshStep(ED.track,ED.step); syncEditor(); changed(); say(TNAME[ED.track]+", step "+(ED.step+1)+" removed"); });

$("bs-read").addEventListener("click",function(){ updateReadout(); setTimeout(function(){ var r=$("bs-readout"); r.focus(); },60); });

// project
$("bs-name").addEventListener("input",function(){ S.name=this.value.slice(0,80)||"Untitled beat"; changed(); });
$("bs-save").addEventListener("click",function(){ var l=lib(); l[S.name]=JSON.parse(JSON.stringify(S)); try{ localStorage.setItem(LIB_KEY,JSON.stringify(l)); syncLib(S.name); say("Saved "+S.name+" in this browser"); }catch(e){ say("Could not save in this browser"); } });
$("bs-lib-load").addEventListener("click",function(){ var n=$("bs-lib").value, l=lib(); if(!l[n]) return; stop(false); S=sanitize(l[n]); syncAll(); changed(); say("Loaded "+S.name); });
$("bs-lib-del").addEventListener("click",function(){ var n=$("bs-lib").value, l=lib(); if(!l[n]) return; delete l[n]; try{ localStorage.setItem(LIB_KEY,JSON.stringify(l)); }catch(e){} syncLib(); say("Deleted "+n); });
$("bs-download").addEventListener("click",function(){ download(new Blob([JSON.stringify(S,null,1)],{type:"application/json"}),fileBase()+".json"); say("Downloaded "+fileBase()+".json"); });
$("bs-open").addEventListener("click",function(){ $("bs-file").click(); });
$("bs-file").addEventListener("change",function(){
  var f=this.files&&this.files[0]; if(!f) return; var rd=new FileReader();
  rd.onload=function(){ try{ var o=JSON.parse(rd.result); if(o.app!=="letterorchestra-beatstudio") throw new Error("not a Beat studio file"); stop(false); S=sanitize(o); syncAll(); changed(); say("Opened "+S.name); }catch(e){ say("That file did not open: "+e.message); } };
  rd.readAsText(f); this.value="";
});
$("bs-export").addEventListener("click",function(){ exportWav().catch(noop); });

// Spacebar plays and stops (in the grid too: there Enter flips a step). Form fields and other buttons keep their own Space.
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"||e.key==="Esc"){ if(L.on) stop(true); return; }
  if(e.key!==" "&&e.code!=="Space") return;
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  var t=e.target, tag=(t&&t.tagName||"").toLowerCase();
  if(tag==="input"||tag==="textarea"||tag==="select"||(t&&t.isContentEditable)) return;
  if((tag==="button"||tag==="a"||tag==="summary")&&!(t.classList&&t.classList.contains("bs-step"))) return;
  e.preventDefault(); toggle();
});

// restore autosave, else start with the dark preset so it makes noise right away
(function(){
  var saved=null; try{ saved=JSON.parse(localStorage.getItem(CUR_KEY)||"null"); }catch(e){}
  if(saved&&saved.app==="letterorchestra-beatstudio"){ S=sanitize(saved); syncAll(); refreshBars(); }
  else { var pr=PRESETS.dark; S.bpm=pr.bpm; S.swing=pr.swing; S.root=pr.root; S.scale=pr.scale; S.lead=pr.lead; S.switchFx=pr.switchFx;
    S.patterns={A:JSON.parse(JSON.stringify(pr.A)),B:JSON.parse(JSON.stringify(pr.B))}; S.name="Dark 145 C# minor"; syncAll(); refreshBars(); }
  syncLib();
})();

window.BeatStudio={state:function(){ return S; },play:play,stop:stop,isPlaying:function(){ return L.on; },exportWav:exportWav,renderSong:renderSong,
  lastExport:function(){ return lastExport; },describe:describe,loadPreset:loadPreset,encodeWav:encodeWav,ctx:function(){ return L.ctx; }};
})();
