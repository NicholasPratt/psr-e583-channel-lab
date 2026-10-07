# PSR-E583 Channel Lab

A browser-based 16-channel MIDI patch and controller editor for the Yamaha PSR-E583.

## [Open the editor](https://nicholaspratt.github.io/psr-e583-channel-lab/)

The editor lets you prepare and transmit a complete 16-part setup from a desktop browser to a connected keyboard.

## Features

- 791 directly MIDI-selectable PSR-E583 voices from the Yamaha data list
- Bank Select MSB/LSB and Program Change transmission
- Volume, expression, pan, reverb send, and chorus send for every channel
- Drum setup on MIDI channel 10
- Per-channel mute, test note, and transmit controls
- Send-all and all-channel panic controls
- Local setup library with JSON import and export
- Responsive desktop and mobile interface

## Using the editor

1. Open the [live editor](https://nicholaspratt.github.io/psr-e583-channel-lab/) in Chrome or Edge on a desktop computer.
2. Connect the PSR-E583 by USB MIDI.
3. Select **Connect MIDI** and approve browser access.
4. Choose the keyboard from the MIDI output list.
5. Configure each channel and select **Send channel** or **Send all 16**.

Web MIDI support and permission are required to transmit settings. Setups can still be edited, saved locally, imported, and exported without a connected keyboard.

## Project structure

- `dist/` contains the deployable static website.
- `scripts/extract-voices.mjs` generates the voice data from text extracted from Yamaha's PSR-E583 data-list PDF.
- `.openai/hosting.json` contains the original Sites hosting configuration.

This is an independent editor and is not affiliated with or endorsed by Yamaha Corporation. Yamaha and PSR are trademarks of Yamaha Corporation.
