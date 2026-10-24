/* Letter Orchestra studio: song title, save/open, audio download, step sequencer, piano roll, mixer.
   Plain JS, no libraries. Uses window.LetterOrchestraCore from app.js. */
(function(){
"use strict";
var C=window.LetterOrchestraCore; if(!C) return;
var $=function(id){ return document.getElementById(id); };
var STEPS=16, STORE="letterorchestra.song.v1";
var statusEl=$("studio-status");
var DRUMS=[["1","Kick"],["2","Snare"],["3","Closed hat"],["4","Open hat"],["5","High tom"],["6","Low tom"],["!","Crash"],["?","Boop"],[".","Click"]];
var DRUM_NAMES={}; DRUMS.forEach(function(d){ DRUM_NAMES[d[0]]=d[1]; });
var NOTE=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
var MINP=36, MAXP=84; // C2 to C6
function noteName(p){ return NOTE[p%12]+(Math.floor(p/12)-1); }
function noteSpoken(p){ var n=NOTE[p%12], o=Math.floor(p/12)-1; return n.length>1?n.charAt(0)+" sharp "+o:n+o; }
function midiFreq(p){ return 440*Math.pow(2,(p-69)/12); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

/* ---------- Song model ---------- */
var uid=0;
function newTrack(kind,sound,name){
  var t={id:"t"+(++uid)+"x"+Date.now().toString(36), kind:kind, sound:sound, name:name||(kind==="drum"?DRUM_NAMES[sound]:C.INSTRUMENTS[sound]), steps:[], notes:[], root:kind==="melodic"?(sound==="bass"||sound==="808"||sound==="reese"||sound==="wobble"?48:60):60, vol:80, mute:false, solo:false};
  for(var i=0;i<STEPS;i++) t.steps.push(false);
  return t;
}
function defaultStudio(){
  var k=newTrack("drum","1"), s=newTrack("drum","2"), h=newTrack("drum","3"), b=newTrack("melodic","bass","Bass"), l=newTrack("melodic","piano","Lead");
  [0,8].forEach(function(i){ k.steps[i]=true; }); [4,12].forEach(function(i){ s.steps[i]=true; }); [0,2,4,6,8,10,12,14].forEach(function(i){ h.steps[i]=true; });
  return {tracks:[k,s,h,b,l], master:100, letters:{vol:100,mute:false,solo:false}, repeats:4};
}
var S=defaultStudio();
var title="";

function sanitizeTitle(t){
  var s=String(t||"").replace(/[\u0000-\u001f\u007f<>:"\/\\|?*]+/g," ").replace(/\s+/g," ").trim().replace(/^[.\s]+|[.\s]+$/g,"");
  if(s.length>80) s=s.slice(0,80).trim();
  if(/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s+=" song";
  return s||"Untitled song";
}
function fileBase(){ return sanitizeTitle(title); }

/* ---------- Status (the one polite region) ---------- */
var stT=null;
function say(msg){
  if(!statusEl) return;
  clearTimeout(stT);
  statusEl.textContent="";
  stT=setTimeout(function(){ statusEl.textContent=msg; },60);
}

/* ---------- Mixer gains ---------- */
var liveGains={};
function audible(t){
  var anySolo=S.letters.solo||S.tracks.some(function(x){ return x.solo; });
  if(t.mute) return false;
  if(anySolo) return !!t.solo;
  return true;
}
function trackGainValue(t){ return audible(t)?t.vol/100:0; }
function applyMix(){
  var c=C.ctx();
  C.setMasterVol(S.master/100);
  C.setLettersVol(trackGainValue(S.letters));
  if(!c) return;
  S.tracks.forEach(function(t){ var g=liveGains[t.id]; if(g) g.gain.setTargetAtTime(trackGainValue(t),c.currentTime,0.02); });
}
function liveGain(t){
  var c=C.ctx(); if(!c) return null;
  var g=liveGains[t.id];
  if(!g){ g=c.createGain(); g.gain.value=trackGainValue(t); g.connect(C.inBus()); liveGains[t.id]=g; }
  return g;
}

/* ---------- Making sound ---------- */
function sixteenth(){ return C.stepDur()/2; }
function playNote(c,out,t,pitch,lenSteps,when,sd){
  var g=c.createGain(); g.gain.value=1; g.connect(out);
  var dur=lenSteps*sd;
  C.voice(c,g,C.INSTRUMENTS[t.sound]?t.sound:"piano",midiFreq(pitch),when,lenSteps>=3);
  g.gain.setValueAtTime(1,when+dur); g.gain.setTargetAtTime(0,when+dur,0.04);
  setTimeout(function(){ try{ g.disconnect(); }catch(e){} },(when-c.currentTime+dur+3)*1000);
}
function stepSounds(c,out,t,stepIx,when,sd,chain){
  if(t.kind==="drum"){
    if(t.steps[stepIx]){ C.sound(c,out,t.sound,"chiptune",when); if(chain&&C.KICKS.indexOf(t.sound)>=0) C.pump(chain,when); }
  } else {
    t.notes.forEach(function(n){ if(n.step===stepIx) playNote(c,out,t,n.pitch,n.len,when,sd); });
  }
}
function patternEmpty(){ return !S.tracks.some(function(t){ return t.kind==="drum"?t.steps.some(Boolean):t.notes.length>0; }); }

/* ---------- Sequencer transport ---------- */
var seqTimer=null, seqStep=0, seqNext=0, seqOn=false, uiQueue=[];
function seqTick(){
  var c=C.ctx(); if(!c||!seqOn) return;
  var sd=sixteenth();
  while(seqNext<c.currentTime+0.12){
    var st=seqStep%STEPS;
    S.tracks.forEach(function(t){ var g=liveGain(t); if(g) stepSounds(c,g,t,st,seqNext,sd,t.kind==="drum"?C.liveFx():null); });
    uiQueue.push([st,seqNext]);
    seqNext+=sd; seqStep++;
  }
  while(uiQueue.length&&uiQueue[0][1]<=c.currentTime){ showStep(uiQueue.shift()[0]); }
}
function seqStart(t0){
  var c=C.ensure(); if(!c) { say("This browser has no Web Audio, so no sound."); return false; }
  seqStopNow();
  seqOn=true; seqStep=0; seqNext=(typeof t0==="number")?t0:c.currentTime+0.06; uiQueue=[];
  seqTick(); seqTimer=setInterval(seqTick,25);
  return true;
}
function seqStopNow(){ seqOn=false; clearInterval(seqTimer); seqTimer=null; uiQueue=[]; showStep(-1); }
var shown=-1;
function showStep(st){
  if(shown===st) return;
  Array.prototype.forEach.call(document.querySelectorAll(".step.now"),function(b){ b.classList.remove("now"); });
  shown=st; if(st<0) return;
  Array.prototype.forEach.call(document.querySelectorAll('.step[data-step="'+st+'"]'),function(b){ b.classList.add("now"); });
}

/* ---------- UI: sequencer ---------- */
var seqList=$("seq-tracks");
function stepLabel(t,i){ return t.name+", step "+(i+1)+", "+(stepIsOn(t,i)?"on":"off"); }
function stepIsOn(t,i){ return t.kind==="drum"?t.steps[i]:t.notes.some(function(n){ return n.step===i; }); }
function toggleStep(t,i){
  if(t.kind==="drum") t.steps[i]=!t.steps[i];
  else if(stepIsOn(t,i)) t.notes=t.notes.filter(function(n){ return n.step!==i; });
  else t.notes.push({pitch:t.root,step:i,len:1});
  var on=stepIsOn(t,i);
  if(on){ var c=C.ensure(); if(c){ var g=liveGain(t); if(g) stepSounds(c,g,t,i,c.currentTime+0.01,sixteenth(),null); } }
  return on;
}
function renderSeq(){
  var focusId=document.activeElement&&document.activeElement.id;
  seqList.textContent="";
  S.tracks.forEach(function(t,ti){
    var li=document.createElement("li"); li.className="seq-track";
    var head=document.createElement("h3"); head.id="seq-name-"+t.id; head.textContent=t.name+(t.kind==="drum"?" (drum)":" ("+C.INSTRUMENTS[t.sound]+")");
    li.appendChild(head);
    var grid=document.createElement("div"); grid.className="steps"; grid.setAttribute("role","group"); grid.setAttribute("aria-labelledby",head.id);
    for(var i=0;i<STEPS;i++){
      var b=document.createElement("button"); b.type="button"; b.className="step"+(i%4===0?" beat":"")+(stepIsOn(t,i)?" on":"");
      b.id="st-"+t.id+"-"+i; b.dataset.track=ti; b.dataset.step=i; b.setAttribute("aria-label",stepLabel(t,i));
      b.tabIndex=(i===0)?0:-1;
      b.textContent=stepIsOn(t,i)?"\u25CF":"\u25CB";
      grid.appendChild(b);
    }
    li.appendChild(grid);
    var row=document.createElement("div"); row.className="row";
    var clr=document.createElement("button"); clr.type="button"; clr.className="minor"; clr.textContent="Clear "+t.name; clr.dataset.clear=ti; row.appendChild(clr);
    var rm=document.createElement("button"); rm.type="button"; rm.className="minor"; rm.textContent="Remove "+t.name; rm.dataset.remove=ti; row.appendChild(rm);
    li.appendChild(row);
    seqList.appendChild(li);
  });
  if(focusId&&$(focusId)) $(focusId).focus();
}
function refreshStep(ti,i){
  var t=S.tracks[ti], b=$("st-"+t.id+"-"+i); if(!b) return;
  var on=stepIsOn(t,i); b.classList.toggle("on",on); b.textContent=on?"\u25CF":"\u25CB"; b.setAttribute("aria-label",stepLabel(t,i));
}
function focusStep(ti,i){
  var t=S.tracks[ti]; if(!t) return;
  var b=$("st-"+t.id+"-"+i); if(!b) return;
  Array.prototype.forEach.call(b.parentNode.children,function(x){ x.tabIndex=-1; }); b.tabIndex=0; b.focus();
}
seqList.addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return;
  if(b.classList.contains("step")){
    var ti=+b.dataset.track, i=+b.dataset.step, t=S.tracks[ti];
    var on=toggleStep(t,i); refreshStep(ti,i);
    say(t.name+", step "+(i+1)+", "+(on?"on":"off"));
    if(t.kind==="melodic") renderRoll(); save();
  } else if(b.dataset.clear!==undefined){
    var tc=S.tracks[+b.dataset.clear]; tc.steps=tc.steps.map(function(){ return false; }); tc.notes=[];
    renderSeq(); renderRoll(); say(tc.name+" cleared"); save();
  } else if(b.dataset.remove!==undefined){
    var ix=+b.dataset.remove, tr=S.tracks[ix];
    if(!window.confirm("Remove the "+tr.name+" track?")) return;
    S.tracks.splice(ix,1); if(liveGains[tr.id]){ try{ liveGains[tr.id].disconnect(); }catch(er){} delete liveGains[tr.id]; }
    renderAll(); say(tr.name+" removed"); save();
    var h=$("seq-h"); if(h){ h.tabIndex=-1; h.focus(); }
  }
});
seqList.addEventListener("keydown",function(e){
  var b=e.target; if(!b.classList||!b.classList.contains("step")) return;
  var ti=+b.dataset.track, i=+b.dataset.step, n=null;
  if(e.key==="ArrowRight") n=[ti,(i+1)%STEPS];
  else if(e.key==="ArrowLeft") n=[ti,(i+STEPS-1)%STEPS];
  else if(e.key==="ArrowDown") n=[Math.min(S.tracks.length-1,ti+1),i];
  else if(e.key==="ArrowUp") n=[Math.max(0,ti-1),i];
  else if(e.key==="Home") n=[ti,0];
  else if(e.key==="End") n=[ti,STEPS-1];
  if(n){ e.preventDefault(); focusStep(n[0],n[1]); }
});

var addSel=$("seq-add-sound");
(function(){
  var g1=document.createElement("optgroup"); g1.label="Drums";
  DRUMS.forEach(function(d){ var o=document.createElement("option"); o.value="d:"+d[0]; o.textContent=d[1]; g1.appendChild(o); });
  var g2=document.createElement("optgroup"); g2.label="Instruments";
  Object.keys(C.INSTRUMENTS).forEach(function(k){ var o=document.createElement("option"); o.value="m:"+k; o.textContent=C.INSTRUMENTS[k]; g2.appendChild(o); });
  addSel.appendChild(g1); addSel.appendChild(g2);
})();
function uniqueName(n){ var names=S.tracks.map(function(t){ return t.name; }), k=n, i=2; while(names.indexOf(k)>=0){ k=n+" "+i; i++; } return k; }
$("seq-add").addEventListener("click",function(){
  var v=addSel.value, kind=v.charAt(0)==="d"?"drum":"melodic", snd=v.slice(2);
  if(S.tracks.length>=16){ say("16 tracks is the most for now."); return; }
  var t=newTrack(kind,snd); t.name=uniqueName(t.name); S.tracks.push(t);
  renderAll(); say(t.name+" track added"); save();
});
$("seq-play").addEventListener("click",function(){
  if(patternEmpty()){ say("The pattern is empty. Turn on some steps first."); return; }
  if(seqStart()) say("Pattern playing");
});
$("seq-stop").addEventListener("click",function(){ seqStopNow(); say("Pattern stopped"); });
var seqTempo=$("seq-tempo"), seqTempoVal=$("seq-tempo-val");
function syncSeqTempo(){ seqTempo.value=C.tempoEl.value; seqTempoVal.textContent=C.tempoEl.value; seqTempo.setAttribute("aria-valuetext",C.tempoEl.value+" BPM"); }
seqTempo.addEventListener("input",function(){ C.tempoEl.value=seqTempo.value; C.syncTempo(); syncSeqTempo(); });
seqTempo.addEventListener("change",save);
C.tempoEl.addEventListener("input",syncSeqTempo);
$("seq-repeats").addEventListener("change",function(){ S.repeats=+this.value; save(); });

/* ---------- UI: piano roll ---------- */
var rollTrack=$("roll-track"), rollNotes=$("roll-notes"), rollEmpty=$("roll-empty"), rollGrid=$("roll-grid"), rollOct=$("roll-octave");
var selNote=null;
function melodic(){ return S.tracks.filter(function(t){ return t.kind==="melodic"; }); }
function curRoll(){ var id=rollTrack.value; return S.tracks.filter(function(t){ return t.id===id&&t.kind==="melodic"; })[0]||null; }
function noteLabel(n){ return noteSpoken(n.pitch)+", step "+(n.step+1)+", length "+n.len; }
function sortNotes(t){ t.notes.sort(function(a,b){ return a.step-b.step||b.pitch-a.pitch; }); }
(function(){
  for(var p=MAXP;p>=MINP;p--){ var o=document.createElement("option"); o.value=p; o.textContent=noteName(p); o.setAttribute("label",noteSpoken(p)); $("roll-add-pitch").appendChild(o); }
  for(var i=1;i<=STEPS;i++){ var o2=document.createElement("option"); o2.value=i-1; o2.textContent=String(i); $("roll-add-step").appendChild(o2);
    var o3=document.createElement("option"); o3.value=i; o3.textContent=String(i); $("roll-add-len").appendChild(o3); }
  for(var oc=2;oc<=5;oc++){ var o4=document.createElement("option"); o4.value=oc; o4.textContent="Octave "+oc+" (C"+oc+" to B"+oc+")"; rollOct.appendChild(o4); }
  rollOct.value="4"; $("roll-add-pitch").value="60";
})();
function renderRollTracks(){
  var keep=rollTrack.value; rollTrack.textContent="";
  var m=melodic();
  m.forEach(function(t){ var o=document.createElement("option"); o.value=t.id; o.textContent=t.name+" ("+C.INSTRUMENTS[t.sound]+")"; rollTrack.appendChild(o); });
  if(!m.length){ var o=document.createElement("option"); o.value=""; o.textContent="No instrument tracks. Add one in the step sequencer."; rollTrack.appendChild(o); }
  if(keep&&m.some(function(t){ return t.id===keep; })) rollTrack.value=keep;
}
function renderRoll(){
  var t=curRoll();
  rollNotes.textContent="";
  if(t){ sortNotes(t); t.notes.forEach(function(n,ix){
    var li=document.createElement("li"), b=document.createElement("button"); b.type="button"; b.className="note-btn"+(n===selNote?" sel":"");
    b.id="note-"+ix; b.dataset.ix=ix; b.textContent=noteLabel(n); b.setAttribute("aria-pressed",n===selNote?"true":"false");
    li.appendChild(b); rollNotes.appendChild(li); }); }
  rollEmpty.hidden=!!(t&&t.notes.length);
  if(selNote&&(!t||t.notes.indexOf(selNote)<0)) selNote=null;
  $("roll-edit-legend").textContent=selNote?"Selected note: "+noteLabel(selNote):"Selected note: none";
  Array.prototype.forEach.call(document.querySelectorAll(".roll-tools button"),function(b){ b.disabled=!selNote; });
  ["roll-add","roll-add-pitch","roll-add-step","roll-add-len","roll-octave"].forEach(function(id){ $(id).disabled=!t; });
  renderGrid();
}
function hasNoteAt(t,p,s){ return t.notes.some(function(n){ return n.pitch===p&&n.step===s; }); }
function gridLabel(t,p,s){ var n=t.notes.filter(function(x){ return x.pitch===p&&x.step===s; })[0]; return noteSpoken(p)+", step "+(s+1)+", "+(n?"on, length "+n.len:"off"); }
function renderGrid(){
  var t=curRoll(); rollGrid.textContent=""; if(!t) return;
  var oc=+rollOct.value, base=(oc+1)*12;
  for(var p=base+11;p>=base;p--){
    var li=document.createElement("li"); li.className="grid-row";
    var lab=document.createElement("span"); lab.className="grid-pitch"; lab.setAttribute("aria-hidden","true"); lab.textContent=noteName(p); li.appendChild(lab);
    var g=document.createElement("div"); g.className="steps"; g.setAttribute("role","group"); g.setAttribute("aria-label",noteSpoken(p));
    for(var s=0;s<STEPS;s++){
      var b=document.createElement("button"); b.type="button"; var on=hasNoteAt(t,p,s);
      b.className="cell"+(s%4===0?" beat":"")+(on?" on":""); b.id="gc-"+p+"-"+s; b.dataset.p=p; b.dataset.s=s;
      b.setAttribute("aria-label",gridLabel(t,p,s)); b.textContent=on?"\u25CF":"\u25CB"; b.tabIndex=(s===0&&p===base+11)?0:-1;
      g.appendChild(b);
    }
    li.appendChild(g); rollGrid.appendChild(li);
  }
}
function hearNote(t,n){ var c=C.ensure(); if(!c) return; var g=liveGain(t); if(g) playNote(c,g,t,n.pitch,n.len,c.currentTime+0.01,sixteenth()); }
rollTrack.addEventListener("change",function(){ selNote=null; renderRoll(); });
rollOct.addEventListener("change",renderGrid);
rollNotes.addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return; var t=curRoll(); if(!t) return;
  var n=t.notes[+b.dataset.ix]; selNote=n; var id=b.id;
  renderRoll(); if($(id)) $(id).focus();
  hearNote(t,selNote); say("Selected "+noteLabel(selNote)+". Edit it below.");
});
document.querySelector(".roll-tools").addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b||!selNote) return; var t=curRoll(); if(!t) return;
  var n=selNote, act=b.dataset.act, msg="";
  if(act==="up") n.pitch=clamp(n.pitch+1,MINP,MAXP);
  else if(act==="down") n.pitch=clamp(n.pitch-1,MINP,MAXP);
  else if(act==="oct-up") n.pitch=clamp(n.pitch+12,MINP,MAXP);
  else if(act==="oct-down") n.pitch=clamp(n.pitch-12,MINP,MAXP);
  else if(act==="left") n.step=clamp(n.step-1,0,STEPS-1);
  else if(act==="right") n.step=clamp(n.step+1,0,STEPS-1);
  else if(act==="longer") n.len=clamp(n.len+1,1,STEPS);
  else if(act==="shorter") n.len=clamp(n.len-1,1,STEPS);
  else if(act==="delete"){ t.notes.splice(t.notes.indexOf(n),1); msg="Deleted "+noteLabel(n); selNote=null; }
  if(act!=="delete"&&act!=="hear") msg=noteLabel(n);
  if(act!=="delete") hearNote(t,n);
  renderRoll(); renderSeq();
  if(act==="delete"){ var h=$("roll-notes-h"); h.tabIndex=-1; h.focus(); } else b.focus();
  if(msg) say(msg);
  save();
});
$("roll-add").addEventListener("click",function(){
  var t=curRoll(); if(!t) return;
  var n={pitch:+$("roll-add-pitch").value,step:+$("roll-add-step").value,len:+$("roll-add-len").value};
  if(hasNoteAt(t,n.pitch,n.step)){ say("There is already a "+noteSpoken(n.pitch)+" on step "+(n.step+1)+"."); return; }
  t.notes.push(n); selNote=n; hearNote(t,n); renderRoll(); renderSeq(); say("Added "+noteLabel(n)); save();
});
rollGrid.addEventListener("click",function(e){
  var b=e.target.closest("button.cell"); if(!b) return; var t=curRoll(); if(!t) return;
  var p=+b.dataset.p, s=+b.dataset.s, id=b.id;
  if(hasNoteAt(t,p,s)) t.notes=t.notes.filter(function(n){ return !(n.pitch===p&&n.step===s); });
  else { var n={pitch:p,step:s,len:1}; t.notes.push(n); hearNote(t,n); }
  renderRoll(); renderSeq(); var nb=$(id); if(nb){ Array.prototype.forEach.call(rollGrid.querySelectorAll(".cell"),function(x){ x.tabIndex=-1; }); nb.tabIndex=0; nb.focus(); }
  say(gridLabel(t,p,s)); save();
});
rollGrid.addEventListener("keydown",function(e){
  var b=e.target; if(!b.classList||!b.classList.contains("cell")) return;
  var p=+b.dataset.p, s=+b.dataset.s, oc=+rollOct.value, base=(oc+1)*12, np=p, ns=s;
  if(e.key==="ArrowRight") ns=(s+1)%STEPS; else if(e.key==="ArrowLeft") ns=(s+STEPS-1)%STEPS;
  else if(e.key==="ArrowUp") np=Math.min(base+11,p+1); else if(e.key==="ArrowDown") np=Math.max(base,p-1);
  else if(e.key==="Home") ns=0; else if(e.key==="End") ns=STEPS-1; else return;
  e.preventDefault(); var nb=$("gc-"+np+"-"+ns); if(nb){ Array.prototype.forEach.call(rollGrid.querySelectorAll(".cell"),function(x){ x.tabIndex=-1; }); nb.tabIndex=0; nb.focus(); }
});

/* ---------- UI: mixer ---------- */
var mixList=$("mix-tracks"), mixMaster=$("mix-master");
function chan(key,name,obj){
  var li=document.createElement("li"); li.className="mix-ch";
  var fs=document.createElement("fieldset"); fs.className="fx"; var lg=document.createElement("legend"); lg.textContent=name; fs.appendChild(lg);
  var lab=document.createElement("label"); lab.htmlFor="mix-vol-"+key; lab.innerHTML=""; lab.appendChild(document.createTextNode(name+" volume: "));
  var val=document.createElement("span"); val.id="mix-val-"+key; val.textContent=obj.vol; lab.appendChild(val); lab.appendChild(document.createTextNode("%"));
  var r=document.createElement("input"); r.type="range"; r.id="mix-vol-"+key; r.min=0; r.max=100; r.step=5; r.value=obj.vol; r.setAttribute("aria-valuetext",obj.vol+"%");
  r.addEventListener("input",function(){ obj.vol=+r.value; val.textContent=r.value; r.setAttribute("aria-valuetext",r.value+"%"); applyMix(); });
  r.addEventListener("change",save);
  fs.appendChild(lab); fs.appendChild(r);
  var row=document.createElement("div"); row.className="row";
  [["mute","Mute"],["solo","Solo"]].forEach(function(m){
    var b=document.createElement("button"); b.type="button"; b.className="toggle"; b.id="mix-"+m[0]+"-"+key; b.textContent=m[1]+" "+name;
    b.setAttribute("aria-pressed",obj[m[0]]?"true":"false");
    b.addEventListener("click",function(){ obj[m[0]]=!obj[m[0]]; b.setAttribute("aria-pressed",obj[m[0]]?"true":"false"); applyMix(); save(); });
    row.appendChild(b);
  });
  fs.appendChild(row); li.appendChild(fs); return li;
}
function renderMix(){
  mixList.textContent="";
  mixList.appendChild(chan("letters","Letters",S.letters));
  S.tracks.forEach(function(t){ mixList.appendChild(chan(t.id,t.name,t)); });
  mixMaster.value=S.master; $("mix-master-val").textContent=S.master; mixMaster.setAttribute("aria-valuetext",S.master+"%");
  applyMix();
}
mixMaster.addEventListener("input",function(){ S.master=+mixMaster.value; $("mix-master-val").textContent=mixMaster.value; mixMaster.setAttribute("aria-valuetext",mixMaster.value+"%"); applyMix(); });
mixMaster.addEventListener("change",save);

function renderAll(){ renderSeq(); renderRollTracks(); renderRoll(); renderMix(); syncSeqTempo(); $("seq-repeats").value=String(S.repeats||4); }

/* ---------- Title, save, open, autosave ---------- */
var titleEl=$("song-title"), fileNameEl=$("song-file-name");
function syncTitle(){ fileNameEl.textContent=fileBase()+".wav and "+fileBase()+".json"; }
titleEl.addEventListener("input",function(){ title=titleEl.value; syncTitle(); save(); });
function project(){
  return {app:"Letter Orchestra", format:1, title:title, saved:new Date().toISOString(), letters:C.getSongState(),
    studio:{tracks:S.tracks.map(function(t){ return {id:t.id,kind:t.kind,sound:t.sound,name:t.name,steps:t.steps.slice(),notes:t.notes.map(function(n){ return {pitch:n.pitch,step:n.step,len:n.len}; }),root:t.root,vol:t.vol,mute:t.mute,solo:t.solo}; }),
      master:S.master, letters:{vol:S.letters.vol,mute:S.letters.mute,solo:S.letters.solo}, repeats:S.repeats}};
}
function cleanStudio(st){
  var out=defaultStudio(); out.tracks=[];
  if(!st||!Array.isArray(st.tracks)) return out;
  st.tracks.slice(0,16).forEach(function(x){
    var kind=x.kind==="drum"?"drum":"melodic";
    var snd=kind==="drum"?(DRUM_NAMES[x.sound]?x.sound:"1"):(C.INSTRUMENTS[x.sound]?x.sound:"piano");
    var t=newTrack(kind,snd,typeof x.name==="string"&&x.name.trim()?x.name.trim().slice(0,40):null);
    if(typeof x.id==="string"&&/^[\w-]{1,40}$/.test(x.id)&&!out.tracks.some(function(o){ return o.id===x.id; })) t.id=x.id;
    if(Array.isArray(x.steps)) for(var i=0;i<STEPS;i++) t.steps[i]=!!x.steps[i];
    if(Array.isArray(x.notes)) t.notes=x.notes.filter(function(n){ return n&&n.pitch>=MINP&&n.pitch<=MAXP&&n.step>=0&&n.step<STEPS; }).slice(0,256)
      .map(function(n){ return {pitch:Math.round(n.pitch),step:Math.round(n.step),len:clamp(Math.round(n.len)||1,1,STEPS)}; });
    if(x.root>=MINP&&x.root<=MAXP) t.root=Math.round(x.root);
    t.vol=clamp(Math.round(Number(x.vol)),0,100); if(isNaN(t.vol)) t.vol=80;
    t.mute=!!x.mute; t.solo=!!x.solo;
    out.tracks.push(t);
  });
  var m=Number(st.master); out.master=isNaN(m)?100:clamp(Math.round(m),0,100);
  if(st.letters){ var lv=Number(st.letters.vol); out.letters={vol:isNaN(lv)?100:clamp(Math.round(lv),0,100),mute:!!st.letters.mute,solo:!!st.letters.solo}; }
  out.repeats=[1,2,4,8,16].indexOf(+st.repeats)>=0?+st.repeats:4;
  return out;
}
function loadProject(p,quiet){
  if(!p||typeof p!=="object"||(p.app!=="Letter Orchestra"&&!p.studio&&!p.letters)) throw new Error("not a song");
  seqStopNow(); selNote=null;
  title=typeof p.title==="string"?p.title.slice(0,120):""; titleEl.value=title; syncTitle();
  S=cleanStudio(p.studio); liveGains={};
  if(p.letters) C.setSongState(p.letters);
  renderAll();
  if(!quiet) say("Opened "+fileBase());
}
var saveT=null, restoring=false;
function save(){ if(restoring) return; clearTimeout(saveT); saveT=setTimeout(function(){ try{ localStorage.setItem(STORE,JSON.stringify(project())); }catch(e){} },300); }
C.onChange(save);
function download(blob,name){
  var url=URL.createObjectURL(blob), a=document.createElement("a"); a.href=url; a.download=name; a.style.display="none";
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },4000);
}
$("song-save").addEventListener("click",function(){
  var name=fileBase()+".json";
  download(new Blob([JSON.stringify(project(),null,1)],{type:"application/json"}),name);
  save(); say("Saved "+name+". Check your Downloads.");
});
var fileIn=$("song-file");
$("song-open").addEventListener("click",function(){ fileIn.value=""; fileIn.click(); });
fileIn.addEventListener("change",function(){
  var f=fileIn.files&&fileIn.files[0]; if(!f) return;
  if(f.size>2000000){ say("That file is too big to be a song file."); return; }
  var r=new FileReader();
  r.onload=function(){ try{ loadProject(JSON.parse(r.result)); save(); }catch(e){ say("That file isn't a Letter Orchestra song."); } $("song-open").focus(); };
  r.onerror=function(){ say("Couldn't read that file."); };
  r.readAsText(f);
});
$("song-new").addEventListener("click",function(){
  if(!window.confirm("Start a new song? This clears the letters, the pattern and the title. Save first if you want to keep it.")) return;
  seqStopNow(); C.stopLetters(); title=""; titleEl.value=""; syncTitle(); S=defaultStudio(); liveGains={}; selNote=null;
  C.setSongState({text:"",insts:[]}); renderAll(); save(); say("New song started");
});

/* ---------- Play song (letters + pattern together) ---------- */
$("song-play").addEventListener("click",function(){
  var c=C.ensure(); if(!c){ say("This browser has no Web Audio, so no sound."); return; }
  var t0=c.currentTime+0.08, any=false;
  C.stopLetters(); seqStopNow();
  if(C.hasLetters()){ C.playLetters(t0); any=true; }
  if(!patternEmpty()){ seqStart(t0); any=true; }
  say(any?"Song playing":"Nothing to play yet. Type some letters or turn on some steps.");
});
$("song-stop").addEventListener("click",function(){ C.stopLetters(); seqStopNow(); say("Song stopped"); });
document.addEventListener("keydown",function(e){ if(e.key==="Escape"||e.key==="Esc") seqStopNow(); });

/* ---------- Download as audio (letters + pattern, WAV) ---------- */
var rendering=false;
function studioRender(){
  var reps=S.repeats||4, sd=sixteenth(), empty=patternEmpty();
  return {duration:empty?0:reps*STEPS*sd, schedule:function(off,bus,chain,t0){
    S.tracks.forEach(function(t){
      var g=off.createGain(); g.gain.value=trackGainValue(t); g.connect(bus);
      for(var r=0;r<reps;r++) for(var i=0;i<STEPS;i++) stepSounds(off,g,t,i,t0+(r*STEPS+i)*sd,sd,t.kind==="drum"?chain:null);
    });
  }};
}
function downloadAudio(otherStatus){
  if(rendering) return;
  if(!C.hasLetters()&&patternEmpty()){ say("Nothing to download yet. Type some letters or turn on some steps."); return; }
  rendering=true; say("Making your audio file, one sec.");
  if(otherStatus) otherStatus.textContent="";
  C.renderBuffer({studio:studioRender(), lettersGain:trackGainValue(S.letters)}).then(function(buf){
    rendering=false;
    if(!buf){ say("This browser can't make audio files, sorry."); return; }
    var name=fileBase()+".wav";
    download(new Blob([C.encodeWav(buf)],{type:"audio/wav"}),name);
    var msg="Downloaded "+name+", "+Math.round(buf.duration)+" seconds. Check your Downloads."; say(msg);
  },function(){ rendering=false; say("Something went wrong making the audio file."); });
}
$("song-audio").addEventListener("click",function(){ downloadAudio(); });

/* ---------- Start ---------- */
(function(){
  var raw=null; try{ raw=localStorage.getItem(STORE); }catch(e){}
  restoring=true;
  if(raw){ try{ loadProject(JSON.parse(raw),true); }catch(e){ renderAll(); } } else renderAll();
  restoring=false; syncTitle();
})();
window.LOStudio={downloadAudio:downloadAudio, fileBase:fileBase, sanitizeTitle:sanitizeTitle, project:project, loadProject:loadProject,
  state:function(){ return S; }, playing:function(){ return seqOn; }};
})();
