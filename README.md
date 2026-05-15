![My Hero Manager Banner](./banner.png)

# 🦸‍♂️ My Hero Manager

> [!IMPORTANT]
> 🚧 **Work In Progress**: This project is currently under active development. Many features are in an experimental state or are being actively implemented.

A high-performance, intelligent mod manager for **My Hero Ultra Rumble**. Built with efficiency and user experience in mind, this tool streamlines the process of discovering, downloading, and organizing your game modifications.

---

## ✨ Key Features

- **🧠 Mod Intelligence**: Automatically scans and categorizes mods into Skins, Emotes, and Voices using deep-dive analysis.
- **🌐 Discord Mod Store**: Integrated scraper to browse, search, and download the latest community mods directly from Discord archives.
- **🔍 Deep Search**: A powerful global search system to find specific mods or character-related content instantly.
- **⚡ Performance First**: Optimized for low RAM usage and stability, ensuring the manager doesn't slow down your system.
- **📁 Organized Management**: Easily enable or disable mods, with an automated directory structure that keeps your game files clean.
- **🖼️ 3D Preview (Upcoming)**: Support for viewing character models and modded assets before installation.

---

## 🛠️ Technology Stack

- **Frontend**: [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **Runtime**: [Tauri](https://tauri.app/) (Rust-based back-end for native performance)
- **Styling**: Modern, responsive CSS with a focus on premium aesthetics.
- **Build Tool**: [Vite](https://vitejs.dev/)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS)
- [Rust](https://www.rust-lang.org/) (for building the Tauri backend)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/regulardude1/My-Hero-Manager.git
   ```
2. Install dependencies:
   ```bash
   npm install
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

---

## 🤝 Contributing

Feel free to open issues or submit pull requests to help improve the manager!

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
