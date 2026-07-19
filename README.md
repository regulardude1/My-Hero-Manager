# My Hero Manager

> [!IMPORTANT]
> 🚧 **Work In Progress**: This project is currently under active development. Many features are in an experimental state or are being actively implemented.

A high-performance, intelligent mod manager for **My Hero Ultra Rumble**. Built with efficiency and user experience in mind, this tool streamlines the process of discovering, downloading, and organizing your game modifications.

---

## ✨ Key Features

- ** Mod Intelligence**: Automatically scans and categorizes mods into Skins, Emotes, and Voices using deep-dive analysis.
- ** Discord Mod Store**: Integrated scraper to browse, search, and download the latest community mods directly from Discord archives.
- ** Deep Search**: A powerful global search system to find specific mods or character-related content instantly.
- ** Performance First**: Optimized for low RAM usage and stability, ensuring the manager doesn't slow down your system.
- ** Organized Management**: Easily enable or disable mods, with an automated directory structure that keeps your game files clean.
- ** 3D Preview (Upcoming)**: Support for viewing character models and modded assets before installation.

---

## 🛠️ Technology Stack

- **Frontend**: [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **Runtime**: [Tauri](https://tauri.app/) (Rust-based back-end for native performance)
- **Styling**: Modern, responsive CSS with a focus on premium aesthetics.
- **Build Tool**: [Vite](https://vitejs.dev/)

---

##  Getting Started

### Prerequisites

#### For Normal Users
- **My Hero Ultra Rumble**: The game must be installed via Steam.
- **Pre-built Executable**: You don't need any special tools. Simply download the latest release installer (e.g., `.msi` or `.exe`), install it, and run the manager!

#### For Developers
- [Node.js](https://nodejs.org/) (Latest LTS)
- [Rust](https://www.rust-lang.org/) (Latest stable, for building the Tauri backend)
- **Windows Build Tools**: If you're on Windows, you will need to install the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (make sure to select the "MSVC - VS C++ x64/x86 build tools" and "Windows SDK" components) to compile Rust properly.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/regulardude1/My-Hero-Manager.git
   ```
2. Install dependencies (we recommend using `--legacy-peer-deps` to resolve any React peer dependency conflicts):
   ```bash
   npm install --legacy-peer-deps
   ```
3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

---

## 📂 Project Structure

- `src/`: React frontend components and UI logic.
- `src-tauri/`: Rust backend, including mod scanning and file system operations.
- `mods/`: Your mod installation directory.
- `cache/`: Temporary storage for mod previews and analysis data.
- `tools/`: Required third-party executables and scripts.

---

## 🧰 Third-Party Tools & Dependencies

My Hero Manager relies on several external tools (located in the `tools/` directory) to parse and modify Unreal Engine assets:

- **umodel (UE Viewer)**: Used by the backend to scan `.pak` files and intelligently determine if a mod contains skins, emotes, or audio, and for which character.
- **repak**: A fast `.pak` file unpacker and packer. Used heavily by the Skin Swapper to extract mod contents.
- **UnrealPak**: Official/community `.pak` packing tool used by the Skin Swapper to rebuild modified skin assets.
- **UEJSON**: A utility that converts `.uasset` files into readable `.json` files and compiles them back. Essential for modifying internal mesh paths.
- **SkinSwapperEngine.py**: A custom Python script that orchestrates the JSON modification of mesh assets to swap costumes.
- **Embedded Python**: A bundled Python runtime ensuring `SkinSwapperEngine.py` can execute without requiring the user to install Python on their system.
- **FFmpeg**: Used for converting and handling various media and texture assets.

---

## 🤝 Contributing

Feel free to open issues or submit pull requests to help improve the manager!

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
