# Letter Orchestra

I made a thing where every letter you type plays a sound. Type a text, get a song. Now it has effects, demos and multiple tracks, and now a real studio side too: a step sequencer, a piano roll and a mixer. I want it to be FL Studio grade, but one you can actually use with VoiceOver.

Play it here: https://2three1y.github.io/letterorchestra/

Now it's a beat studio first: the center of all musical chaos. Letters and the classic sequencer are still here, one tap away.

I got the idea from Orca by Hundred Rabbits, where every letter is an instrument. Mine is way simpler and way more chaotic.

## Beat studio (the main mode)

- Five tracks, 16 steps: Kick, Clap, Hi-hat, 808 and Lead. Every step is a real button that says what it is, like "Kick, step 5, on" or "808, step 14, on, E 1, slides in".
- Patterns A and B, for drop 1 and drop 2. While it plays, press the other pattern and it switches on the next bar, after the switch FX. Auto switch flips every 4 or 8 bars. Copy to other pattern makes drop 2 a remix of drop 1 in one tap.
- Hi-hat rolls: single hits, rolls in 32nds and triplet rolls.
- 808 with slides: a slide note glides into its pitch instead of hitting again. It's in the key you pick.
- Lead synth: saw, square or pluck, locked to the scale (minor or major, any root), so notes always fit. Chaos melody writes a new one for you.
- Tempo 60 to 200 BPM, swing 0 to 60%.
- Transition FX: tape stop, stutter, filter sweep, reverse and riser.
- Presets from our sound bible: Dark 145 C# minor, Digicore 160 D major, Jerk 150 F# minor. Each one has a drop 1 and a drop 2.
- Pattern readout: the whole pattern in words, so I can hear what's where without checking 80 buttons.
- Export WAV renders drop 1, the switch FX and drop 2 (or just one pattern) as a 16-bit, 44.1 kHz stereo WAV, mastered around -9 LUFS, ending on a dead stop.
- Projects autosave in the browser, Save in this browser keeps named beats, and Download project file / Open project file move them anywhere.
- Keyboard: Space plays and stops, Escape stops, arrows move around the grid, Enter flips a step, R changes a hat roll, plus and minus change a note, S turns an 808 slide on or off.

## How it works

- Press Turn sound on first. It plays a little chime so you know sound works. If you hear nothing on an iPhone, flip the silent switch off.
- Letters a to z play notes from a pentatonic scale across 3 octaves, so it basically can't sound bad.
- Vowels play a soft, long pad version of the instrument. Consonants play the short, plucky version.
- Numbers are drums: 1 kick, 2 snare, 3 closed hat, 4 open hat, 5 and 6 toms, 7 8 9 0 are combos.
- Space is a rest. ! is a crash, ? is a rising blip, . is a little click.
- Every line is a track, and all lines play at the same time. Drums on one line, bass on the next, melody on the next.
- Letters remember the instrument they were typed with. Switch instruments mid-typing to stack sounds in one track. There are 17 instruments: Chiptune, Dreamy, Bass, Piano, 808 Bass, Pluck, Super Saw, Bell, Organ, Flute, Strings Pad, Steel Drum, Guitar Pluck (real Karplus-Strong string math), Choir Ooh, Wobble Bass, Keys and Reese bass.
- Play it back loops everything at your tempo (60 to 200 BPM). Stop or Escape ends it. You can edit while it plays.
- Name your song in Song title and the files get that name. Call it Tab and you get Tab.wav and Tab.json.
- Save song downloads a song file you can open later with Open song. It also autosaves in your browser.
- Download as audio (or Export WAV) makes a WAV (16-bit, 44.1 kHz stereo) of the letters plus the pattern, with effects and mixer, ready to drop into a DAW. The WAV encoder is hand-written, no libraries.

## Classic studio

- Step sequencer: tracks of 16 steps. Every step is a button that says what it is, like "Kick, step 5, on". Arrow keys work too.
- Piano roll: any note from C2 to C6 on instrument tracks. Notes are a list you can read and edit (Note up, Longer, Move later and so on), plus a grid of buttons one octave at a time.
- Mixer: volume, Mute and Solo for every track and for the letters, plus master volume.
- Play song plays the letters and the pattern together.

## Effects

Seven effects, kind of like the FL Studio mixer, each with an on button and a slider: Reverb, Delay, Distortion, Filter sweep, Chorus, Bitcrusher and Sidechain pump. They work on live typing, playback, the pattern and the audio file.

## Demos

Starter songs to learn from and remix: Lo-fi, Hip-hop boom bap, Trap, House, Synthwave, Chiptune, Drum and bass, Ambient and Hyperpop. Each one sets the tempo, instruments and effects. Load one, press Play it back, then wreck it.

## Accessibility

I use VoiceOver, so I built this to work with it. Real buttons, a real text box, real sliders and a real menu, all labelled. Nothing gets announced while you type, because the sound is the feedback. Studio changes get one short message in a single status spot, nothing more. No sound plays until you press or type something. There's a Guide on the page and a Skip to guide link at the top. Light and dark mode follow your device, and Reduce Motion is respected.

## Tech

Plain HTML, CSS and JavaScript. All sounds and effects are made live with the Web Audio API: no audio files, no libraries, no trackers, no requests to anywhere else.

## License

MIT. Co-written with Tab (https://tab.bot).
