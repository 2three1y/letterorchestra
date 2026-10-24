# Letter Orchestra

I made a thing where every letter you type plays a sound. Type a text, get a song. Now it has effects, demos and multiple tracks, so it's basically turning into a tiny DAW you play by typing.

Play it here: https://2three1y.github.io/letterorchestra/

I got the idea from Orca by Hundred Rabbits, where every letter is an instrument. Mine is way simpler and way more chaotic.

## How it works

- Press Turn sound on first. It plays a little chime so you know sound works. If you hear nothing on an iPhone, flip the silent switch off.
- Letters a to z play notes from a pentatonic scale across 3 octaves, so it basically can't sound bad.
- Vowels play a soft, long pad version of the instrument. Consonants play the short, plucky version.
- Numbers are drums: 1 kick, 2 snare, 3 closed hat, 4 open hat, 5 and 6 toms, 7 8 9 0 are combos.
- Space is a rest. ! is a crash, ? is a rising blip, . is a little click.
- Every line is a track, and all lines play at the same time. Drums on one line, bass on the next, melody on the next.
- Letters remember the instrument they were typed with. Switch instruments mid-typing to stack sounds in one track. There are 17 instruments: Chiptune, Dreamy, Bass, Piano, 808 Bass, Pluck, Super Saw, Bell, Organ, Flute, Strings Pad, Steel Drum, Guitar Pluck (real Karplus-Strong string math), Choir Ooh, Wobble Bass, Keys and Reese bass.
- Play it back loops everything at your tempo (60 to 200 BPM). Stop or Escape ends it. You can edit while it plays.
- Export WAV saves one pass as letter-orchestra.wav (16-bit, 44.1 kHz stereo) with your instruments and effects, ready to drop into a DAW. The WAV encoder is hand-written, no libraries.

## Effects

Seven effects, kind of like the FL Studio mixer, each with an on button and a slider: Reverb, Delay, Distortion, Filter sweep, Chorus, Bitcrusher and Sidechain pump. They work on live typing, playback and Export WAV.

## Demos

Starter songs to learn from and remix: Lo-fi, Hip-hop boom bap, Trap, House, Synthwave, Chiptune, Drum and bass, Ambient and Hyperpop. Each one sets the tempo, instruments and effects. Load one, press Play it back, then wreck it.

## Accessibility

I use VoiceOver, so I built this to work with it. Real buttons, a real text box, real sliders and a real menu, all labelled. Nothing gets announced while you type, because the sound is the feedback. No sound plays until you press or type something. There's a Guide on the page and a Skip to guide link at the top. Light and dark mode follow your device, and Reduce Motion is respected.

## Tech

Plain HTML, CSS and JavaScript. All sounds and effects are made live with the Web Audio API: no audio files, no libraries, no trackers, no requests to anywhere else.

## License

MIT. Co-written with Tab (https://tab.bot).
