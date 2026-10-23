(function(){
"use strict";
var ctx=null, master=null, noiseBuf=null;
var $=function(id){return document.getElementById(id);};
var text=$("text"), playBtn=$("play"), stopBtn=$("stop"), loopBtn=$("loop"),
    tempo=$("tempo"), tempoVal=$("tempo-val"), inst=$("instrument"), preview=$("preview");

function unlock(){
  if(!ctx){
    var AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return null;
    ctx=new AC();
    master=ctx.createGain(); master.gain.value=0.5;
    var comp=ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    var len=ctx.sampleRate; noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
    var d=noiseBuf.getChannelData(0); for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
  }
  if(ctx.state==="suspended" && ctx.resume) ctx.resume();
  return ctx;
}

// Major pentatonic over 3 octaves from C3; 26 letters spread across it.
var PENTA=[0,2,4,7,9];
function letterFreq(ch){
  var i=ch.charCodeAt(0)-97; // 0..25
  var step=Math.round(i*14/25); // 15 scale steps
  var oct=Math.floor(step/5), deg=PENTA[step%5];
  var midi=48+oct*12+deg;
  return 440*Math.pow(2,(midi-69)/12);
}
function env(g,t,a,peak,dec){
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+a);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec);
}
function pad(f,t){
  var g=ctx.createGain(); g.connect(master);
  [0,-7,7].forEach(function(det){
    var o=ctx.createOscillator(); o.type="sine"; o.frequency.value=f*2; o.detune.value=det;
    o.connect(g); o.start(t); o.stop(t+0.9);
  });
  env(g,t,0.06,0.18,0.75);
}
function pluck(f,t){
  var kind=inst.value, g=ctx.createGain(), o=ctx.createOscillator(), out=g;
  if(kind==="chiptune"){ o.type="square"; o.frequency.value=f*2; o.connect(g); env(g,t,0.005,0.12,0.22); }
  else if(kind==="dreamy"){
    o.type="sine"; o.frequency.value=f*2; o.connect(g);
    var o2=ctx.createOscillator(); o2.type="sine"; o2.frequency.value=f*2; o2.detune.value=12; o2.connect(g); o2.start(t); o2.stop(t+0.7);
    env(g,t,0.01,0.25,0.6);
  } else {
    o.type="sawtooth"; o.frequency.value=f/2;
    var lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.setValueAtTime(1400,t); lp.frequency.exponentialRampToValueAtTime(200,t+0.3); lp.Q.value=6;
    o.connect(lp); lp.connect(g); env(g,t,0.005,0.35,0.35);
  }
  out.connect(master); o.start(t); o.stop(t+0.75);
}
function noise(t,dur,type,freq,peak){
  var s=ctx.createBufferSource(); s.buffer=noiseBuf;
  var f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq;
  var g=ctx.createGain(); s.connect(f); f.connect(g); g.connect(master);
  env(g,t,0.002,peak,dur); s.start(t); s.stop(t+dur+0.05);
}
function kick(t){
  var o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine";
  o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(40,t+0.25);
  o.connect(g); g.connect(master); env(g,t,0.003,0.9,0.3); o.start(t); o.stop(t+0.35);
}
function snare(t){ noise(t,0.18,"highpass",1200,0.5);
  var o=ctx.createOscillator(), g=ctx.createGain(); o.type="triangle"; o.frequency.value=190;
  o.connect(g); g.connect(master); env(g,t,0.002,0.3,0.1); o.start(t); o.stop(t+0.15); }
function hat(t,open){ noise(t,open?0.25:0.05,"highpass",7000,0.25); }
function tom(t,f){ var o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine";
  o.frequency.setValueAtTime(f,t); o.frequency.exponentialRampToValueAtTime(f*0.6,t+0.2);
  o.connect(g); g.connect(master); env(g,t,0.003,0.6,0.25); o.start(t); o.stop(t+0.3); }
var DRUMS={
  "0":function(t){kick(t);hat(t,true);},
  "1":kick, "2":snare, "3":function(t){hat(t,false);},
  "4":function(t){hat(t,true);}, "5":function(t){tom(t,220);}, "6":function(t){tom(t,140);},
  "7":function(t){kick(t);snare(t);}, "8":function(t){kick(t);hat(t,false);}, "9":function(t){snare(t);hat(t,true);}
};
function crash(t){ noise(t,1.2,"highpass",4000,0.35); noise(t,0.6,"bandpass",9000,0.2); }
function blip(t){ var o=ctx.createOscillator(), g=ctx.createGain(); o.type="square";
  o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(1600,t+0.18);
  o.connect(g); g.connect(master); env(g,t,0.005,0.1,0.2); o.start(t); o.stop(t+0.25); }
function click(t){ noise(t,0.015,"bandpass",3000,0.4); }

function playChar(ch,t){
  if(!ctx) return false;
  t=t||ctx.currentTime;
  var c=ch.toLowerCase();
  if(c>="a"&&c<="z"){ var f=letterFreq(c); if("aeiou".indexOf(c)>=0) pad(f,t); else pluck(f,t); return true; }
  if(c>="0"&&c<="9"){ DRUMS[c](t); return true; }
  if(c==="!"){ crash(t); return true; }
  if(c==="?"){ blip(t); return true; }
  if(c==="."){ click(t); return true; }
  return false; // space and others: rest
}

// Typing: play the newly inserted character(s).
var lastVal="";
text.addEventListener("input",function(e){
  unlock();
  var v=text.value;
  if(e && typeof e.data==="string" && e.data.length && v.length>lastVal.length){
    playChar(e.data.charAt(e.data.length-1));
  } else if(v.length===lastVal.length+1){
    var pos=text.selectionStart||v.length; playChar(v.charAt(pos-1));
  }
  lastVal=v; renderPreview();
});

function renderPreview(){
  preview.textContent="";
  var v=text.value.slice(0,400);
  for(var i=0;i<v.length;i++){ var s=document.createElement("span"); s.textContent=v.charAt(i); preview.appendChild(s); }
}

// Playback: lookahead scheduler.
var timer=null, idx=0, nextTime=0, seq="", playing=false, visTimers=[];
function stepDur(){ return 60/Number(tempo.value)/2; } // eighth notes
function highlight(i){
  var kids=preview.children;
  for(var k=0;k<kids.length;k++) kids[k].classList.toggle("on",k===i);
}
function schedule(){
  while(nextTime<ctx.currentTime+0.12){
    if(idx>=seq.length){
      if(loopBtn.getAttribute("aria-pressed")==="true" && seq.length){ idx=0; seq=text.value; }
      else { var end=(nextTime-ctx.currentTime)*1000; visTimers.push(setTimeout(stop,Math.max(0,end))); clearInterval(timer); timer=null; return; }
    }
    var i=idx, ch=seq.charAt(i);
    playChar(ch,nextTime);
    (function(i,when){ visTimers.push(setTimeout(function(){ if(playing) highlight(i); },Math.max(0,(when-ctx.currentTime)*1000))); })(i,nextTime);
    nextTime+=stepDur(); idx++;
  }
}
function play(){
  unlock(); if(!ctx) return;
  stop();
  seq=text.value; if(!seq.length) return;
  playing=true; idx=0; nextTime=ctx.currentTime+0.05;
  schedule(); if(playing && !timer) timer=setInterval(schedule,25);
  document.body.setAttribute("data-playing","true");
}
function stop(){
  playing=false;
  if(timer){ clearInterval(timer); timer=null; }
  visTimers.forEach(clearTimeout); visTimers=[];
  highlight(-1);
  document.body.removeAttribute("data-playing");
}
playBtn.addEventListener("click",play);
stopBtn.addEventListener("click",stop);
loopBtn.addEventListener("click",function(){
  loopBtn.setAttribute("aria-pressed",loopBtn.getAttribute("aria-pressed")==="true"?"false":"true");
});
tempo.addEventListener("input",function(){ tempoVal.textContent=tempo.value; tempo.setAttribute("aria-valuetext",tempo.value+" BPM"); });
tempo.setAttribute("aria-valuetext",tempo.value+" BPM");
inst.addEventListener("change",function(){ unlock(); playChar("g"); });
Array.prototype.forEach.call(document.querySelectorAll(".ex"),function(b){
  b.addEventListener("click",function(){ unlock(); text.value=b.textContent; lastVal=text.value; renderPreview(); });
});
document.addEventListener("keydown",function(e){ if(e.key==="Escape"||e.key==="Esc") stop(); });
["pointerdown","touchend","keydown"].forEach(function(ev){ document.addEventListener(ev,unlock,{once:true,passive:true}); });

window.LetterOrchestra={playChar:playChar,play:play,stop:stop,isPlaying:function(){return playing;},letterFreq:letterFreq};
renderPreview();
})();
