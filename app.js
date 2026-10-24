(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var text=$("text"), preview=$("preview"), tempo=$("tempo"), tempoVal=$("tempo-val"), inst=$("instrument"),
    loopBtn=$("loop"), soundBtn=$("sound-on"), soundStatus=$("sound-status"), demoStatus=$("demo-status");

/* ---------- Instruments ---------- */
var INSTRUMENTS={chiptune:"Chiptune",dreamy:"Dreamy",bass:"Bass",piano:"Piano","808":"808 Bass",pluck:"Pluck",supersaw:"Super Saw",bell:"Bell",organ:"Organ",flute:"Flute",strings:"Strings Pad",steel:"Steel Drum",guitar:"Guitar Pluck",choir:"Choir Ooh",wobble:"Wobble Bass",keys:"Keys",reese:"Reese bass"};

/* ---------- Audio core ---------- */
var AC=window.AudioContext||window.webkitAudioContext;
var ctx=null, inBus=null, master=null, fx=null, noiseBuf=null, silentEl=null, crushReady=false;
var debug=[]; // [{ch,inst,waves,t}] for tests

function makeNoise(c){ var len=c.sampleRate, b=c.createBuffer(1,len,c.sampleRate), d=b.getChannelData(0); for(var i=0;i<len;i++) d[i]=Math.random()*2-1; return b; }

function ensureCtx(){
  if(ctx||!AC) return ctx;
  try{ ctx=new AC({latencyHint:"interactive"}); }catch(e){ ctx=new AC(); }
  noiseBuf=makeNoise(ctx);
  inBus=ctx.createGain();
  master=ctx.createGain(); master.gain.value=0.5;
  var comp=ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  fx=buildFx(ctx,inBus,master,fxState);
  loadCrusher(ctx).then(function(ok){ crushReady=ok; if(ok&&fxState.crush.on) rebuildFx(); });
  return ctx;
}

// A tiny silent WAV, generated here (no files). Playing it through an <audio> element
// moves iOS into "playback" mode, so the ring/silent switch does not mute Web Audio.
function silentWavURI(){
  var sr=8000, n=sr/2, buf=new Uint8Array(44+n), v=new DataView(buf.buffer), p=0;
  function s(t){ for(var i=0;i<t.length;i++) buf[p++]=t.charCodeAt(i); }
  function u32(x){ v.setUint32(p,x,true); p+=4; } function u16(x){ v.setUint16(p,x,true); p+=2; }
  s("RIFF"); u32(36+n); s("WAVE"); s("fmt "); u32(16); u16(1); u16(1); u32(sr); u32(sr); u16(1); u16(8); s("data"); u32(n);
  for(var i=0;i<n;i++) buf[p++]=128;
  var bin=""; for(var j=0;j<buf.length;j++) bin+=String.fromCharCode(buf[j]);
  return "data:audio/wav;base64,"+btoa(bin);
}
function playSilent(){
  try{
    if(!silentEl){
      silentEl=document.createElement("audio");
      silentEl.setAttribute("playsinline",""); silentEl.setAttribute("x-webkit-airplay","deny");
      silentEl.preload="auto"; silentEl.loop=true; silentEl.src=silentWavURI();
    }
    if(silentEl.paused){ var pr=silentEl.play(); if(pr&&pr.catch) pr.catch(function(){}); }
  }catch(e){}
}
document.addEventListener("visibilitychange",function(){ if(document.hidden&&silentEl) silentEl.pause(); });

// Call this from any real user gesture. Safe to call again and again.
function unlock(){
  if(!AC) return null;
  ensureCtx();
  try{ if(navigator.audioSession) navigator.audioSession.type="playback"; }catch(e){}
  playSilent();
  if(ctx.state!=="running"&&ctx.resume){ try{ var pr=ctx.resume(); if(pr&&pr.then) pr.then(updateSoundStatus,function(){}); }catch(e){} }
  updateSoundStatus();
  return ctx;
}
function running(){ return !!ctx&&ctx.state==="running"; }
function updateSoundStatus(){
  if(!soundStatus) return;
  if(!AC) soundStatus.textContent="This browser has no Web Audio, so no sound, sorry.";
  else if(running()) soundStatus.textContent="Sound is on. Heard nothing? Flip the silent switch off and turn the volume up.";
  else soundStatus.textContent="Sound is off. Press Turn sound on.";
}
["pointerup","touchend","click","keydown"].forEach(function(ev){
  document.addEventListener(ev,function(e){ if(ev==="keydown"&&(e.key==="Escape"||e.key==="Esc")) return; unlock(); },{passive:true,capture:true});
});

/* ---------- Synth voices ---------- */
var PENTA=[0,2,4,7,9];
function letterFreq(ch){
  var i=ch.charCodeAt(0)-97, step=Math.round(i*14/25);
  var midi=48+Math.floor(step/5)*12+PENTA[step%5];
  return 440*Math.pow(2,(midi-69)/12);
}
function env(g,t,a,peak,dec){
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+a);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec);
}
function osc(c,type,f,t,stop,dest,det){
  var o=c.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t); if(det) o.detune.value=det;
  o.connect(dest); o.start(t); o.stop(t+stop); return o;
}
function lp(c,freq,q,dest){ var f=c.createBiquadFilter(); f.type="lowpass"; f.frequency.value=freq; f.Q.value=q||0.7; f.connect(dest); return f; }
var satCurve=null;
function sat(c){ if(!satCurve){ satCurve=new Float32Array(1024); for(var i=0;i<1024;i++){ var x=i/511.5-1; satCurve[i]=Math.tanh(2.2*x); } } var w=c.createWaveShaper(); w.curve=satCurve; return w; }

// Guitar Pluck: Karplus-Strong. A short noise burst fed back through a one-period delay with a soft lowpass.
var ksCache={};
function ksBuffer(c,f,dur){
  var key=c.sampleRate+":"+f.toFixed(2)+":"+dur; if(ksCache[key]) return ksCache[key];
  var sr=c.sampleRate, n=Math.floor(sr*dur), N=Math.max(2,Math.round(sr/f)), b=c.createBuffer(1,n,sr), d=b.getChannelData(0), line=new Float32Array(N), p=0, damp=0.996;
  for(var i=0;i<N;i++) line[i]=Math.random()*2-1;
  for(var j=0;j<n;j++){ var q=(p+1)%N, y=line[p]; d[j]=y; line[p]=damp*0.5*(y+line[q]); p=q; }
  var fade=Math.floor(sr*0.05); for(var k=0;k<fade;k++) d[n-1-k]*=k/fade;
  ksCache[key]=b; return b;
}
// Every voice returns the list of oscillator wave types it used (for tests).
function voice(c,out,kind,f,t,vowel){
  var g=c.createGain(); g.connect(out); var W=[];
  function o(type,fr,stop,dest,det){ osc(c,type,fr,t,stop,dest||g,det); W.push(type); }
  switch(kind){
  case "dreamy":
    if(vowel){ [0,-7,7].forEach(function(d){ o("sine",f*2,0.95,g,d); }); env(g,t,0.06,0.18,0.8); }
    else { o("sine",f*2,0.75); o("sine",f*2,0.75,g,12); env(g,t,0.01,0.25,0.6); }
    break;
  case "bass":
    var b=lp(c,vowel?700:1400,vowel?2:6,g);
    if(!vowel){ b.frequency.setValueAtTime(1400,t); b.frequency.exponentialRampToValueAtTime(200,t+0.3); }
    o("sawtooth",f/2,vowel?1:0.75,b); env(g,t,vowel?0.04:0.005,vowel?0.25:0.35,vowel?0.8:0.35);
    break;
  case "keys":
    var k=lp(c,vowel?1800:3200,0.7,g);
    o("sine",f*2,1.4,k); o("triangle",f*4,0.5,k,4);
    env(g,t,vowel?0.05:0.004,vowel?0.16:0.26,vowel?1.2:0.9);
    break;
  case "supersaw":
    var s=lp(c,vowel?1800:3600,1,g);
    [-14,0,14].forEach(function(d){ o("sawtooth",f,vowel?1.4:0.7,s,d); });
    env(g,t,vowel?0.12:0.01,vowel?0.09:0.12,vowel?1.1:0.5);
    break;
  case "bell":
    var car=c.createOscillator(), mod=c.createOscillator(), mg=c.createGain(), dur=vowel?2:1.4;
    car.type="sine"; mod.type="sine"; car.frequency.value=f*2; mod.frequency.value=f*2*3.5;
    mg.gain.setValueAtTime(f*2*(vowel?1.5:3),t); mg.gain.exponentialRampToValueAtTime(1,t+dur);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    car.start(t); mod.start(t); car.stop(t+dur); mod.stop(t+dur); W.push("sine","sine");
    env(g,t,vowel?0.03:0.003,vowel?0.14:0.2,dur-0.05);
    break;
  case "808":
    var w=sat(c); w.connect(g);
    var o8=c.createOscillator(); o8.type="sine"; o8.frequency.setValueAtTime(f*0.75,t); o8.frequency.exponentialRampToValueAtTime(f/2,t+0.06);
    o8.connect(w); o8.start(t); o8.stop(t+(vowel?1.8:1.2)); W.push("sine");
    env(g,t,0.004,0.55,vowel?1.6:1.05);
    break;
  case "reese":
    var r=lp(c,vowel?500:900,3,g);
    o("sawtooth",f/2,1.6,r,-18); o("sawtooth",f/2,1.6,r,18);
    env(g,t,0.03,vowel?0.22:0.28,1.4);
    break;
  case "piano":
    var pf=lp(c,4200,0.7,g); pf.frequency.setValueAtTime(4200,t); pf.frequency.exponentialRampToValueAtTime(1100,t+0.8);
    o("triangle",f*2,vowel?2.2:1.6,pf); o("sine",f*2,vowel?2.2:1.6,pf,5); o("sine",f*4,0.4,pf);
    env(g,t,vowel?0.02:0.003,vowel?0.2:0.3,vowel?2:1.45);
    break;
  case "pluck":
    var pl=lp(c,5000,2,g); pl.frequency.setValueAtTime(5000,t); pl.frequency.exponentialRampToValueAtTime(300,t+(vowel?0.5:0.15));
    o("sawtooth",f*2,vowel?0.9:0.4,pl); env(g,t,0.003,0.22,vowel?0.8:0.3);
    break;
  case "organ":
    var od=vowel?1:0.4;
    [[1,0.5],[2,0.32],[3,0.18],[4,0.14],[6,0.08]].forEach(function(h){ var hg=c.createGain(); hg.gain.value=h[1]; hg.connect(g); o("sine",f*h[0],od+0.12,hg); });
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.16,t+0.012); g.gain.setValueAtTime(0.16,t+od); g.gain.linearRampToValueAtTime(0.0001,t+od+0.1);
    break;
  case "flute":
    var fd=vowel?1.2:0.55, vib=c.createOscillator(), vg=c.createGain(); vib.frequency.value=5; vg.gain.value=9; vib.connect(vg);
    var fo=c.createOscillator(); fo.type="sine"; fo.frequency.value=f*2; vg.connect(fo.detune); fo.connect(g); fo.start(t); vib.start(t); fo.stop(t+fd+0.1); vib.stop(t+fd+0.1); W.push("sine");
    var nb=c.createBufferSource(); nb.buffer=noiseBuf; var bp=c.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=f*2; bp.Q.value=6; var ng=c.createGain(); ng.gain.value=0.35;
    nb.connect(bp); bp.connect(ng); ng.connect(g); nb.start(t); nb.stop(t+fd+0.1);
    env(g,t,0.06,0.2,fd);
    break;
  case "strings":
    var sd=vowel?1.6:0.9, sf=lp(c,1800,0.8,g);
    [-10,0,10].forEach(function(d){ o("sawtooth",f,sd+0.6,sf,d); });
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.09,t+(vowel?0.4:0.22)); g.gain.setValueAtTime(0.09,t+sd); g.gain.linearRampToValueAtTime(0.0001,t+sd+0.5);
    break;
  case "steel":
    [[1,0.5],[2,0.25],[3.9,0.12]].forEach(function(h){ var hg=c.createGain(); hg.gain.value=h[1]; hg.connect(g);
      var so=c.createOscillator(); so.type="sine"; so.frequency.setValueAtTime(f*2*h[0]*1.02,t); so.frequency.exponentialRampToValueAtTime(f*2*h[0],t+0.03); so.connect(hg); so.start(t); so.stop(t+(vowel?1.3:0.8)); W.push("sine"); });
    env(g,t,0.002,0.3,vowel?1.2:0.7);
    break;
  case "guitar":
    var src=c.createBufferSource(); src.buffer=ksBuffer(c,f,vowel?2:1.3); src.connect(g); g.gain.value=vowel?0.32:0.42; src.start(t); W.push("karplus-strong");
    break;
  case "choir":
    var cd=vowel?1.4:0.8, cv2=c.createOscillator(), cvg=c.createGain(); cv2.frequency.value=5.5; cvg.gain.value=14; cv2.connect(cvg);
    var co2=c.createOscillator(); co2.type="sawtooth"; co2.frequency.value=f; cvg.connect(co2.detune); W.push("sawtooth");
    [[320,8,1],[800,10,0.45],[2400,12,0.12]].forEach(function(fm){ var b2=c.createBiquadFilter(); b2.type="bandpass"; b2.frequency.value=fm[0]; b2.Q.value=fm[1]; var bg=c.createGain(); bg.gain.value=fm[2]; co2.connect(b2); b2.connect(bg); bg.connect(g); });
    co2.start(t); cv2.start(t); co2.stop(t+cd+0.3); cv2.stop(t+cd+0.3);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.5,t+0.15); g.gain.setValueAtTime(0.5,t+cd); g.gain.linearRampToValueAtTime(0.0001,t+cd+0.25);
    break;
  case "wobble":
    var wd=vowel?1.6:0.9, wf=c.createBiquadFilter(); wf.type="lowpass"; wf.Q.value=9; wf.frequency.value=420; wf.connect(g);
    var wl=c.createOscillator(), wlg=c.createGain(); wl.type="sine"; wl.frequency.value=1/(stepDur()*(vowel?2:1)); wlg.gain.value=360; wl.connect(wlg); wlg.connect(wf.frequency); wl.start(t); wl.stop(t+wd+0.1);
    o("sawtooth",f/2,wd+0.1,wf); o("square",f/2,wd+0.1,wf,-5);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.13,t+0.01); g.gain.setValueAtTime(0.13,t+wd-0.08); g.gain.linearRampToValueAtTime(0.0001,t+wd);
    break;
  default: // chiptune
    if(vowel){ var cf=lp(c,2600,0.7,g); o("square",f*2,0.9,cf,-8); o("square",f*2,0.9,cf,8); env(g,t,0.04,0.07,0.75); }
    else { o("square",f*2,0.3); env(g,t,0.005,0.12,0.22); }
  }
  return W;
}
function noise(c,out,t,dur,type,freq,peak){
  var s=c.createBufferSource(); s.buffer=noiseBuf;
  var f=c.createBiquadFilter(); f.type=type; f.frequency.value=freq;
  var g=c.createGain(); s.connect(f); f.connect(g); g.connect(out);
  env(g,t,0.002,peak,dur); s.start(t); s.stop(t+dur+0.05);
}
function kick(c,o,t){ var x=c.createOscillator(), g=c.createGain(); x.type="sine";
  x.frequency.setValueAtTime(150,t); x.frequency.exponentialRampToValueAtTime(40,t+0.25);
  x.connect(g); g.connect(o); env(g,t,0.003,0.9,0.3); x.start(t); x.stop(t+0.35); }
function snare(c,o,t){ noise(c,o,t,0.18,"highpass",1200,0.5);
  var x=c.createOscillator(), g=c.createGain(); x.type="triangle"; x.frequency.value=190;
  x.connect(g); g.connect(o); env(g,t,0.002,0.3,0.1); x.start(t); x.stop(t+0.15); }
function hat(c,o,t,open){ noise(c,o,t,open?0.25:0.05,"highpass",7000,0.25); }
function tom(c,o,t,f){ var x=c.createOscillator(), g=c.createGain(); x.type="sine";
  x.frequency.setValueAtTime(f,t); x.frequency.exponentialRampToValueAtTime(f*0.6,t+0.2);
  x.connect(g); g.connect(o); env(g,t,0.003,0.6,0.25); x.start(t); x.stop(t+0.3); }
var DRUMS={
  "0":function(c,o,t){kick(c,o,t);hat(c,o,t,true);}, "1":kick, "2":snare, "3":function(c,o,t){hat(c,o,t,false);},
  "4":function(c,o,t){hat(c,o,t,true);}, "5":function(c,o,t){tom(c,o,t,220);}, "6":function(c,o,t){tom(c,o,t,140);},
  "7":function(c,o,t){kick(c,o,t);snare(c,o,t);}, "8":function(c,o,t){kick(c,o,t);hat(c,o,t,false);}, "9":function(c,o,t){snare(c,o,t);hat(c,o,t,true);}
};
var KICKS="0178";
function crash(c,o,t){ noise(c,o,t,1.2,"highpass",4000,0.35); noise(c,o,t,0.6,"bandpass",9000,0.2); }
function blip(c,o,t){ var x=c.createOscillator(), g=c.createGain(); x.type="square";
  x.frequency.setValueAtTime(400,t); x.frequency.exponentialRampToValueAtTime(1600,t+0.18);
  x.connect(g); g.connect(o); env(g,t,0.005,0.1,0.2); x.start(t); x.stop(t+0.25); }
function click(c,o,t){ noise(c,o,t,0.015,"bandpass",3000,0.4); }

// Plays one character on context c into node out. Returns true if it made a sound.
function sound(c,out,ch,kind,t){
  var low=ch.toLowerCase();
  if(low>="a"&&low<="z"){
    var W=voice(c,out,INSTRUMENTS[kind]?kind:"chiptune",letterFreq(low),t,"aeiou".indexOf(low)>=0);
    if(c===ctx){ debug.push({ch:ch,inst:kind,waves:W,t:t}); if(debug.length>400) debug.splice(0,100); }
    return true;
  }
  if(low>="0"&&low<="9"){ DRUMS[low](c,out,t); return true; }
  if(low==="!"){ crash(c,out,t); return true; }
  if(low==="?"){ blip(c,out,t); return true; }
  if(low==="."){ click(c,out,t); return true; }
  return false;
}
function playChar(ch,kind,t){
  if(!ctx) return false;
  t=t||ctx.currentTime;
  var ok=sound(ctx,inBus,ch,kind||inst.value,t);
  if(ok&&KICKS.indexOf(ch)>=0&&fx) pump(fx,fxState,t);
  return ok;
}

/* ---------- Effects (all Web Audio, no libraries) ---------- */
var FX_DEFAULTS={reverb:30,delay:35,distortion:30,filter:60,chorus:40,crush:40,pump:50};
var fxState={}; Object.keys(FX_DEFAULTS).forEach(function(k){ fxState[k]={on:false,v:FX_DEFAULTS[k]}; });
function cutoff(v){ return Math.round(150*Math.pow(18000/150,v/100)); }
function distCurve(v){ var k=v*1.5+1, n=2048, cv=new Float32Array(n); for(var i=0;i<n;i++){ var x=i*2/n-1; cv[i]=(1+k)*x/(1+k*Math.abs(x)); } return cv; }
function quantCurve(v){ var bits=Math.max(2,Math.round(12-v/10)), lv=Math.pow(2,bits-1), n=4096, cv=new Float32Array(n); for(var i=0;i<n;i++){ var x=i*2/(n-1)-1; cv[i]=Math.round(x*lv)/lv; } return cv; }
var irCache={};
function impulse(c){
  var key=c.sampleRate; if(irCache[key]) return irCache[key];
  var len=Math.floor(c.sampleRate*2.8), b=c.createBuffer(2,len,c.sampleRate);
  for(var ch=0;ch<2;ch++){ var d=b.getChannelData(ch), last=0;
    for(var i=0;i<len;i++){ var t=i/c.sampleRate, n=(Math.random()*2-1)*Math.exp(-t*2.6); last=last+0.35*(n-last); d[i]=last*(i<c.sampleRate*0.01?i/(c.sampleRate*0.01):1); } }
  irCache[key]=b; return b;
}
var CRUSH_SRC="class C extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:'amount',defaultValue:0.4,minValue:0,maxValue:1}]}"+
 "constructor(){super();this.h=[0,0];this.n=0}process(i,o,p){var a=p.amount[0],hold=1+Math.floor(a*a*20),bits=Math.max(3,16-a*12),q=Math.pow(2,bits-1),inp=i[0],out=o[0];"+
 "for(var c=0;c<out.length;c++){var x=inp&&inp.length?(inp[c]||inp[0]):null,y=out[c],h=this.h[c]||0;for(var k=0;k<y.length;k++){if((this.n+k)%hold===0)h=x?Math.round(x[k]*q)/q:0;y[k]=h}this.h[c]=h}"+
 "this.n=(this.n+128)%27720;return true}}registerProcessor('lo-crush',C);";
var crushURL=null;
function loadCrusher(c){
  try{
    if(!c.audioWorklet||!window.Blob||!window.URL) return Promise.resolve(false);
    if(!crushURL) crushURL=URL.createObjectURL(new Blob([CRUSH_SRC],{type:"application/javascript"}));
    return c.audioWorklet.addModule(crushURL).then(function(){ return true; },function(){ return false; });
  }catch(e){ return Promise.resolve(false); }
}
// Builds the effect chain between src and dest from state st. Returns refs so sliders can tweak it live.
function buildFx(c,src,dest,st,useWorklet){
  var input=c.createGain(), node=input, names=[], refs={}, stoppers=[];
  if(useWorklet===undefined) useWorklet=crushReady;
  function step(a,b){ node.connect(a); node=b||a; }
  if(st.distortion.on){
    var ws=c.createWaveShaper(); ws.curve=distCurve(st.distortion.v); ws.oversample="4x";
    var mk=c.createGain(); mk.gain.value=1/(1+st.distortion.v/60); ws.connect(mk); step(ws,mk);
    refs.distortion={ws:ws,mk:mk}; names.push("distortion:WaveShaperNode");
  }
  if(st.crush.on){
    var cr=null, a=st.crush.v/100;
    if(useWorklet){ try{ cr=new AudioWorkletNode(c,"lo-crush",{outputChannelCount:[2]}); cr.parameters.get("amount").value=a; names.push("crush:AudioWorkletNode"); }catch(e){ cr=null; } }
    if(!cr){ cr=c.createWaveShaper(); cr.curve=quantCurve(st.crush.v); names.push("crush:WaveShaperNode"); }
    var clp=c.createBiquadFilter(); clp.type="lowpass"; clp.frequency.value=12000-a*8000; cr.connect(clp); step(cr,clp);
    refs.crush={node:cr,lp:clp};
  }
  if(st.filter.on){
    var f=c.createBiquadFilter(); f.type="lowpass"; f.frequency.value=cutoff(st.filter.v); f.Q.value=4;
    var l=c.createOscillator(), lg=c.createGain(); l.frequency.value=0.12; lg.gain.value=700; l.connect(lg); lg.connect(f.detune); l.start(); stoppers.push(l);
    step(f); refs.filter={f:f}; names.push("filter:BiquadFilterNode");
  }
  if(st.chorus.on){
    var ci=c.createGain(), co=c.createGain(), dry=c.createGain(); dry.gain.value=0.8; ci.connect(dry); dry.connect(co);
    var depth=st.chorus.v/100*0.006, gs=[];
    [[0.018,0.6],[0.024,0.85]].forEach(function(p,ix){
      var d=c.createDelay(0.1); d.delayTime.value=p[0];
      var lo=c.createOscillator(), g=c.createGain(); lo.frequency.value=p[1]; g.gain.value=depth; lo.connect(g); g.connect(d.delayTime); lo.start(); stoppers.push(lo); gs.push(g);
      var wet=c.createGain(); wet.gain.value=0.45; ci.connect(d); d.connect(wet); wet.connect(co);
      if(c.createStereoPanner){ var pn=c.createStereoPanner(); pn.pan.value=ix?0.6:-0.6; wet.disconnect(); wet.connect(pn); pn.connect(co); }
    });
    step(ci,co); refs.chorus={gs:gs}; names.push("chorus:DelayNode");
  }
  if(st.delay.on){
    var di=c.createGain(), dout=c.createGain(); di.connect(dout);
    var dl=c.createDelay(2); dl.delayTime.value=Math.min(1.9,stepDur()*1.5);
    var fb=c.createGain(); fb.gain.value=st.delay.v/100*0.85; var dlp=c.createBiquadFilter(); dlp.type="lowpass"; dlp.frequency.value=3500;
    var dw=c.createGain(); dw.gain.value=0.45;
    di.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dw); dw.connect(dout);
    step(di,dout); refs.delay={dl:dl,fb:fb}; names.push("delay:DelayNode");
  }
  if(st.reverb.on){
    var ri=c.createGain(), ro=c.createGain(), rd=c.createGain(), rw=c.createGain(), cv=c.createConvolver();
    cv.buffer=impulse(c); var m=st.reverb.v/100; rd.gain.value=1-m*0.5; rw.gain.value=m*1.2;
    ri.connect(rd); rd.connect(ro); ri.connect(cv); cv.connect(rw); rw.connect(ro);
    step(ri,ro); refs.reverb={dry:rd,wet:rw}; names.push("reverb:ConvolverNode");
  }
  var duck=c.createGain(); step(duck); if(st.pump.on) names.push("pump:GainNode");
  src.connect(input); node.connect(dest);
  return {input:input,output:node,duck:duck,refs:refs,names:names,stoppers:stoppers,src:src};
}
function teardown(old,c){
  try{ old.src.disconnect(old.input); }catch(e){}
  setTimeout(function(){ try{ old.output.disconnect(); }catch(e){} old.stoppers.forEach(function(s){ try{ s.stop(); }catch(e){} }); },3500);
}
function rebuildFx(){ if(!ctx) return; var old=fx; fx=buildFx(ctx,inBus,master,fxState); if(old) teardown(old,ctx); }
function pump(chain,st,t){
  if(!st.pump.on) return;
  var g=chain.duck.gain, amt=st.pump.v/100*0.85, beat=stepDur()*2;
  g.cancelScheduledValues(t); g.setValueAtTime(1-amt,t); g.setTargetAtTime(1,t+0.02,beat/5);
}
function tweak(name){
  if(!fx||!ctx) return; var r=fx.refs[name], v=fxState[name].v, t=ctx.currentTime;
  if(!r) return;
  if(name==="reverb"){ r.dry.gain.setTargetAtTime(1-v/200,t,0.05); r.wet.gain.setTargetAtTime(v/100*1.2,t,0.05); }
  else if(name==="delay"){ r.fb.gain.setTargetAtTime(v/100*0.85,t,0.05); }
  else if(name==="distortion"){ r.ws.curve=distCurve(v); r.mk.gain.setTargetAtTime(1/(1+v/60),t,0.05); }
  else if(name==="filter"){ r.f.frequency.setTargetAtTime(cutoff(v),t,0.05); }
  else if(name==="chorus"){ r.gs.forEach(function(g){ g.gain.setTargetAtTime(v/100*0.006,t,0.05); }); }
  else if(name==="crush"){ if(r.node.parameters) r.node.parameters.get("amount").setValueAtTime(v/100,t); else r.node.curve=quantCurve(v); r.lp.frequency.setTargetAtTime(12000-v*80,t,0.05); }
}
function fxValueText(name,v){ if(name==="filter") return cutoff(v)+" Hz"; return v+" percent"; }
function fxShown(name,v){ if(name==="filter") return cutoff(v)+" Hz"; return v+"%"; }
function syncFxUI(name){
  var s=fxState[name], b=$("fx-"+name), r=$("fx-"+name+"-amt"), out=$("fx-"+name+"-val");
  b.setAttribute("aria-pressed",s.on?"true":"false"); b.querySelector(".st").textContent=s.on?" (on)":" (off)"; r.value=s.v; out.textContent=fxShown(name,s.v); r.setAttribute("aria-valuetext",fxValueText(name,s.v));
}
Object.keys(fxState).forEach(function(name){
  $("fx-"+name).addEventListener("click",function(){ fxState[name].on=!fxState[name].on; syncFxUI(name); unlock(); rebuildFx(); });
  $("fx-"+name+"-amt").addEventListener("input",function(e){ fxState[name].v=Number(e.target.value); syncFxUI(name); tweak(name); });
  syncFxUI(name);
});

/* ---------- Text + per-character instruments ---------- */
// insts[i] is the instrument character i was typed with. Kept in sync with an input diff.
var insts=[], lastVal="";
function applyDiff(prev,cur,kind){
  var p=0, max=Math.min(prev.length,cur.length);
  while(p<max&&prev.charCodeAt(p)===cur.charCodeAt(p)) p++;
  var s=0; while(s<max-p&&prev.charCodeAt(prev.length-1-s)===cur.charCodeAt(cur.length-1-s)) s++;
  var removed=prev.length-p-s, added=cur.slice(p,cur.length-s), fill=[];
  for(var i=0;i<added.length;i++) fill.push(kind);
  insts.splice.apply(insts,[p,removed].concat(fill));
  return added;
}
function setText(v,instList){
  text.value=v; lastVal=v; insts=[];
  for(var i=0;i<v.length;i++) insts.push(instList?instList[i]:inst.value);
  renderPreview();
}
text.addEventListener("input",function(){
  var v=text.value, added=applyDiff(lastVal,v,inst.value); lastVal=v;
  if(insts.length!==v.length){ insts.length=v.length; for(var i=0;i<v.length;i++) if(!insts[i]) insts[i]=inst.value; }
  renderPreview();
  if(!added.length) return;
  var chars=added.length<=2?added:added.slice(-1);
  liveSound(chars);
});
function liveSound(chars){
  if(!ctx) unlock();
  if(!ctx) return;
  var go=function(){ var t=ctx.currentTime; for(var i=0;i<chars.length;i++) playChar(chars.charAt(i),inst.value,t+i*0.06); };
  if(running()) go();
  else if(ctx.resume){ try{ var pr=ctx.resume(); var t0=Date.now(); if(pr&&pr.then) pr.then(function(){ if(Date.now()-t0<400) go(); updateSoundStatus(); },function(){}); }catch(e){} }
}

/* ---------- Preview (visual only) ---------- */
var lit=[];
function renderPreview(){
  preview.textContent=""; lit=[];
  var lines=text.value.slice(0,2000).split("\n");
  lines.forEach(function(L){ var row=document.createElement("div"); row.className="pl";
    for(var i=0;i<L.length;i++){ var s=document.createElement("span"); s.textContent=L.charAt(i); row.appendChild(s); }
    if(!L.length) row.textContent=" "; preview.appendChild(row); });
}
function highlight(cols){
  lit.forEach(function(s){ s.classList.remove("on"); }); lit=[];
  if(!cols) return;
  var rows=preview.children;
  cols.forEach(function(c,li){ var r=rows[li]; if(c>=0&&r&&r.children[c]){ r.children[c].classList.add("on"); lit.push(r.children[c]); } });
}

/* ---------- Playback: each line is a track ---------- */
function stepDur(){ return 60/Number(tempo.value)/2; } // eighth notes
function tracks(){
  var v=text.value, out=[], start=0;
  v.split("\n").forEach(function(L){ out.push({s:L,start:start}); start+=L.length+1; });
  return out;
}
function looping(){ return loopBtn.getAttribute("aria-pressed")==="true"; }
var timer=null, step=0, nextTime=0, playing=false, visTimers=[], maxLen=0;
function schedule(){
  while(nextTime<ctx.currentTime+0.12){
    var T=tracks(); maxLen=0; T.forEach(function(t){ if(t.s.length>maxLen) maxLen=t.s.length; });
    if(!maxLen||(!looping()&&step>=maxLen)){
      var end=(nextTime-ctx.currentTime)*1000; visTimers.push(setTimeout(stop,Math.max(0,end)));
      clearInterval(timer); timer=null; return;
    }
    var cols=[];
    T.forEach(function(t){
      var L=t.s.length; if(!L){ cols.push(-1); return; }
      var col=looping()?step%L:step; if(col>=L){ cols.push(-1); return; }
      playChar(t.s.charAt(col),insts[t.start+col]||inst.value,nextTime); cols.push(col);
    });
    if(step%2===0) pump(fx,fxState,nextTime);
    (function(cols,when){ visTimers.push(setTimeout(function(){ if(playing) highlight(cols); },Math.max(0,(when-ctx.currentTime)*1000))); })(cols,nextTime);
    nextTime+=stepDur(); step++;
  }
}
function play(){
  unlock(); if(!ctx) return;
  stop();
  if(!text.value.replace(/\n/g,"").length) return;
  playing=true; step=0; nextTime=ctx.currentTime+0.06;
  schedule(); if(playing&&!timer) timer=setInterval(schedule,25);
  document.body.setAttribute("data-playing","true");
}
function stop(){
  playing=false;
  if(timer){ clearInterval(timer); timer=null; }
  visTimers.forEach(clearTimeout); visTimers=[];
  highlight(null);
  document.body.removeAttribute("data-playing");
}
Array.prototype.forEach.call(document.querySelectorAll(".play"),function(b){ b.addEventListener("click",play); });
Array.prototype.forEach.call(document.querySelectorAll(".stop"),function(b){ b.addEventListener("click",stop); });
loopBtn.addEventListener("click",function(){ loopBtn.setAttribute("aria-pressed",looping()?"false":"true"); });
function syncTempo(){ tempoVal.textContent=tempo.value; tempo.setAttribute("aria-valuetext",tempo.value+" BPM"); if(fx&&fx.refs.delay) fx.refs.delay.dl.delayTime.setTargetAtTime(Math.min(1.9,stepDur()*1.5),ctx.currentTime,0.05); }
tempo.addEventListener("input",syncTempo); syncTempo();
inst.addEventListener("change",function(){ unlock(); if(running()) playChar("g",inst.value); });
document.addEventListener("keydown",function(e){ if(e.key==="Escape"||e.key==="Esc") stop(); });

/* ---------- Turn sound on ---------- */
function chime(){
  if(!running()) return;
  var t=ctx.currentTime+0.02;
  [523.25,659.25,783.99].forEach(function(f,i){ var g=ctx.createGain(); g.connect(master); osc(ctx,"sine",f,t+i*0.09,0.6,g); env(g,t+i*0.09,0.01,0.12,0.45); });
}
soundBtn.addEventListener("click",function(){
  unlock(); if(!ctx){ updateSoundStatus(); return; }
  if(running()) chime();
  else { try{ ctx.resume().then(function(){ updateSoundStatus(); chime(); },function(){ updateSoundStatus(); }); }catch(e){} }
  updateSoundStatus();
});

/* ---------- Example phrases ---------- */
Array.prototype.forEach.call(document.querySelectorAll(".ex"),function(b){
  b.addEventListener("click",function(){ unlock(); setText(b.textContent); });
});

/* ---------- Demos ---------- */
var DEMOS={
"lofi": {
"label": "Lo-fi",
"tempo": 75,
"lead": "keys",
"fx": {
"reverb": 35,
"delay": 25,
"filter": 55,
"chorus": 30,
"crush": 35
},
"lines": [
[
"8323832383 28 238323832383 28 24",
"chiptune"
],
[
"h    m  f     d h    m  j    g  ",
"bass"
],
[
"iae     eao     iae     ae      ",
"dreamy"
],
[
"  q p m   k m     q p q j  k  h ",
"keys"
]
]
},
"boombap": {
"label": "Hip-hop boom bap",
"tempo": 90,
"lead": "piano",
"fx": {
"crush": 30,
"filter": 75,
"reverb": 15
},
"lines": [
[
"83233823832883248323382383288 29",
"chiptune"
],
[
"h    h  f  fg   h    h  j  kj   ",
"bass"
],
[
"mkh     pmk     mkh   j g h     ",
"piano"
],
[
"ie      ae      ie      ea      ",
"dreamy"
]
]
},
"trap": {
"label": "Trap",
"tempo": 140,
"lead": "bell",
"fx": {
"reverb": 25,
"delay": 20,
"distortion": 15
},
"lines": [
[
"83382383834323388338238383432222",
"chiptune"
],
[
"h  h  f h      mh  h  j g      d",
"808"
],
[
"m k h k m  pm   m k h g h   d   ",
"bell"
]
]
},
"house": {
"label": "House",
"tempo": 125,
"lead": "keys",
"fx": {
"pump": 60,
"reverb": 25,
"filter": 80,
"delay": 20
},
"lines": [
[
"14741474147414741474147414741474",
"chiptune"
],
[
" h h j h f f g j h h j h k k j g",
"bass"
],
[
"m  m  m p  p  p m  m  m q  q  p ",
"keys"
],
[
"j  j  j k  k  k j  j  j m  m  k ",
"keys"
],
[
"a               i               ",
"dreamy"
]
]
},
"synthwave": {
"label": "Synthwave",
"tempo": 100,
"lead": "supersaw",
"fx": {
"chorus": 55,
"reverb": 45,
"delay": 35,
"pump": 30
},
"lines": [
[
"83238323832383238323832383238329",
"chiptune"
],
[
"hhhhhhhhffffffffjjjjjjjjgggggggg",
"bass"
],
[
"q  p  m p   q r t  r  q p   m   ",
"supersaw"
],
[
"ie      o       ae      eo      ",
"strings"
]
]
},
"chiptune": {
"label": "Chiptune",
"tempo": 150,
"lead": "chiptune",
"fx": {
"crush": 45,
"delay": 20
},
"lines": [
[
"13231123132311231323112313232222",
"chiptune"
],
[
"hjmqhjmqfjkpfjkpjmprjmprgkpkgkpq",
"chiptune"
],
[
"h h h h f f f f j j j j g g g g ",
"bass"
]
]
},
"dnb": {
"label": "Drum and bass",
"tempo": 175,
"lead": "bell",
"fx": {
"reverb": 25,
"filter": 70,
"distortion": 20,
"delay": 15
},
"lines": [
[
"83233823832338248323382383235222",
"chiptune"
],
[
"h       f   g   h       j   k   ",
"reese"
],
[
"i       e       a       e       ",
"dreamy"
],
[
"    q p             m p         ",
"bell"
]
]
},
"ambient": {
"label": "Ambient",
"tempo": 70,
"lead": "dreamy",
"fx": {
"reverb": 80,
"delay": 55,
"chorus": 60,
"filter": 60
},
"lines": [
[
"a   e   i     o a   e   u   i   ",
"strings"
],
[
"  m       p  q    m       k   h ",
"bell"
],
[
"h               f               ",
"reese"
]
]
},
"hyperpop": {
"label": "Hyperpop",
"tempo": 170,
"lead": "supersaw",
"fx": {
"distortion": 60,
"crush": 40,
"chorus": 40,
"pump": 60,
"reverb": 20
},
"lines": [
[
"13723172137292221372317217171222",
"chiptune"
],
[
"rtvxvtr xz xvtrqrtvxzxv t r q p ",
"supersaw"
],
[
"j m p m j m p q j m p m k m p r ",
"chiptune"
],
[
"h     h f     g h     j k     g ",
"808"
]
]
}
};
function loadDemo(key){
  var d=DEMOS[key]; if(!d) return;
  stop();
  var v=[], list=[];
  d.lines.forEach(function(pair,ix){ if(ix){ v.push("\n"); list.push(pair[1]); } for(var i=0;i<pair[0].length;i++){ list.push(pair[1]); } v.push(pair[0]); });
  tempo.value=d.tempo; syncTempo();
  inst.value=d.lead;
  Object.keys(fxState).forEach(function(n){ var on=d.fx.hasOwnProperty(n); fxState[n].on=on; if(on) fxState[n].v=d.fx[n]; syncFxUI(n); });
  setText(v.join(""),list);
  rebuildFx();
  demoStatus.textContent="Loaded "+d.label+" demo. Press Play it back.";
}
Array.prototype.forEach.call(document.querySelectorAll(".demo"),function(b){
  b.addEventListener("click",function(){ unlock(); loadDemo(b.getAttribute("data-demo")); });
});

/* ---------- Export WAV (same tracks, same instruments, same effects) ---------- */
var exportBtn=$("export"), exportStatus=$("export-status"), lastWav=null;
function encodeWav(buf){
  var ch=buf.numberOfChannels, sr=buf.sampleRate, n=buf.length, bytes=n*ch*2;
  var ab=new ArrayBuffer(44+bytes), v=new DataView(ab), p=0;
  function s(str){ for(var i=0;i<str.length;i++) v.setUint8(p++,str.charCodeAt(i)); }
  function u32(x){ v.setUint32(p,x,true); p+=4; } function u16(x){ v.setUint16(p,x,true); p+=2; }
  s("RIFF"); u32(36+bytes); s("WAVE"); s("fmt "); u32(16); u16(1); u16(ch); u32(sr); u32(sr*ch*2); u16(ch*2); u16(16);
  s("data"); u32(bytes);
  var chans=[]; for(var c=0;c<ch;c++) chans.push(buf.getChannelData(c));
  for(var i=0;i<n;i++) for(var c2=0;c2<ch;c2++){ var x=Math.max(-1,Math.min(1,chans[c2][i])); v.setInt16(p,x<0?x*0x8000:x*0x7FFF,true); p+=2; }
  return new Blob([ab],{type:"audio/wav"});
}
function renderBuffer(){
  var OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  var T=tracks(), len=0; T.forEach(function(t){ if(t.s.length>len) len=t.s.length; });
  if(!OAC||!len) return Promise.resolve(null);
  var sr=44100, sd=stepDur(), dur=len*sd+3.2;
  var off=new OAC(2,Math.ceil(dur*sr),sr);
  var need=fxState.crush.on?loadCrusher(off):Promise.resolve(false);
  return need.then(function(wk){
    var savedNoise=noiseBuf; noiseBuf=makeNoise(off);
    var bus=off.createGain(), m=off.createGain(); m.gain.value=0.5;
    var comp=off.createDynamicsCompressor(); m.connect(comp); comp.connect(off.destination);
    var chain=buildFx(off,bus,m,fxState,wk);
    try{
      for(var step=0;step<len;step++){
        var t=0.05+step*sd;
        T.forEach(function(tr){ var L=tr.s.length; if(!L) return; var col=looping()?step%L:step; if(col>=L) return;
          var ch=tr.s.charAt(col); sound(off,bus,ch,insts[tr.start+col]||inst.value,t);
          if(KICKS.indexOf(ch)>=0) pump(chain,fxState,t); });
        if(step%2===0) pump(chain,fxState,t);
      }
    } finally { noiseBuf=savedNoise; }
    return new Promise(function(res,rej){
      var done=false; off.oncomplete=function(e){ if(!done){ done=true; res(e.renderedBuffer); } };
      var pr=off.startRendering(); if(pr&&pr.then) pr.then(function(b){ if(!done){ done=true; res(b); } },rej);
    });
  });
}
function renderWav(){ return renderBuffer().then(function(b){ return b?encodeWav(b):null; }); }
exportBtn.addEventListener("click",function(){
  if(!text.value.replace(/\n/g,"").length){ exportStatus.textContent="Type something first, then export."; return; }
  exportStatus.textContent="Rendering...";
  renderWav().then(function(blob){
    if(!blob){ exportStatus.textContent="This browser can't export audio, sorry."; return; }
    lastWav=blob;
    var url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url; a.download="letter-orchestra.wav"; a.style.display="none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },60000);
    exportStatus.textContent="Saved letter-orchestra.wav";
  }).catch(function(){ exportStatus.textContent="Export failed, sorry. Try again?"; });
});

window.LetterOrchestra={playChar:playChar,play:play,stop:stop,isPlaying:function(){return playing;},letterFreq:letterFreq,
  renderWav:renderWav,renderBuffer:renderBuffer,lastWav:function(){return lastWav;},loadDemo:loadDemo,demos:function(){return Object.keys(DEMOS);},
  fxNames:function(){return fx?fx.names.slice():[];},fxState:function(){return JSON.parse(JSON.stringify(fxState));},
  insts:function(){return insts.slice();},debug:function(){return debug.slice();},clearDebug:function(){debug=[];},
  state:function(){return ctx?ctx.state:"none";},crushReady:function(){return crushReady;}};
renderPreview(); updateSoundStatus();
})();
