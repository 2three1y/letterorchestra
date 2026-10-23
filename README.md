# Letter Orchestra

I made a thing where every letter you type plays a sound. Type a text, get a song. That's it, that's the whole idea, and it slaps.

Play it here: https://2three1y.github.io/letterorchestra/

I got the idea from Orca by Hundred Rabbits, where every letter is an instrument. Mine is way simpler and way more chaotic.

## How it works

- Letters a to z play notes from a pentatonic scale across 3 octaves, so it basically can't sound bad.
- Vowels get a soft pad. Consonants get a plucky sound, and the Instrument menu changes it: Chiptune, Dreamy or Bass.
- Space is a rest.
- Numbers are drums: 1 kick, 2 snare, 3 hats, and the rest are combos.
- ! is a crash, ? is a rising blip, . is a little click.
- Play it back loops your whole text at whatever tempo you set (60 to 200 BPM). Stop or Escape ends it.
- Export WAV saves one pass of your text as letter-orchestra.wav (16-bit, 44.1 kHz stereo) at your tempo and instrument, ready to drop into a DAW. The WAV encoder is hand-written, no libraries.

## Accessibility

I use VoiceOver, so I built this to work with it. Real buttons, a real text box, a real slider and a real menu, all labelled. Nothing gets announced while you type, because the sound is the feedback. No sound plays until you press or type something. Light and dark mode follow your device, and Reduce Motion is respected.

## Tech

Plain HTML, CSS and JavaScript. All sounds are made live with the Web Audio API: no audio files, no libraries, no trackers, no requests to anywhere else.

## License

MIT. Co-written with Tab (https://tab.bot).
