# My Hero Manager

A mod manager for My Hero Ultra Rumble. Still a work in progress.

## Using the app

- Windows 10/11, with the game installed
- Download the latest release: the installer, or the portable exe (no install needed)
- Run it. Your mods and app data are stored in `%LOCALAPPDATA%\MyHeroManager`

## Building from source

Prerequisites: Node.js (LTS), Rust, and the Microsoft C++ Build Tools (VS C++ x64/x86 + Windows SDK).

```bash
git clone https://github.com/regulardude1/My-Hero-Manager.git
cd My-Hero-Manager
npm install --legacy-peer-deps
```

`tools/ffmpeg.exe` is not committed (too big). Download it from https://github.com/BtbN/FFmpeg-Builds/releases and put it in `tools/`, or texture conversion won't work.

```bash
npm run tauri dev     # run in development
npm run tauri build   # build installer + portable exe (output in src-tauri/target/release/bundle/)
```

## Notes

- `tools/` contains the third-party tools the app uses (umodel, repak, UEJSON, a bundled Python runtime, ffmpeg). Everything except ffmpeg is committed.
- The dev server uses port 1420 and fails if it's already in use.

## License

MIT
