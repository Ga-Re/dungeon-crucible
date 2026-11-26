# Built-in sounds (E-37, DC-104)

Seamless ambience loops shipped with the app: the built-in sounds of sound sources, the map's sound
and the soundboard (`builtin:<name>`, played by `../../app/audio.ts`). File name = name, `.ogg`
(Opus, mono, 48 kbit/s, about 21 s). The first five (`wind`, `drip`, `fire`, `rain`, `choir`) also
have a synthesised version the app falls back to when its file cannot be played.

| Name | What |
|---|---|
| `wind` | cold wind through a stone cave |
| `drip` | water dripping in an echoing cave |
| `fire` | crackling wall torches |
| `rain` | rain on stone |
| `choir` | a distant, wordless ghostly choir |
| `waterfall` | a waterfall into a rocky pool |
| `brook` | a brook over stones |
| `campfire` | a campfire at night |
| `forest` | a forest by day, leaves and distant birds |
| `storm` | wind, rain and distant thunder |
| `sea` | waves on a rocky shore |
| `tavern` | a busy tavern, murmur without words |

Only sounds whose rights allow shipping them in this public repository belong here.

## Origin

All twelve were generated for this project with Higgsfield (model Mirelo text-to-audio, 25 s each)
on 2026-11-26, on the DM's Higgsfield plan, which the DM confirmed allows shipping them in this
public repository; no third-party recording was used. Each was trimmed by 0.5 s at both ends,
loudness-normalised (EBU R128, −20 LUFS), made seamless by cross-fading its last 3 s into its start,
and encoded as mono Opus with ffmpeg.
