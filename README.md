# Time Tracker (v1.0) ⚡

A high-performance, native desktop time tracking application built with **Rust**, **Tauri v2**, **React**, and **TypeScript**. 

It automatically detects your active windows, tracks the time spent on each application, and visualizes your daily productivity through a stunning, glassmorphism-inspired UI.

## ✨ Features (v1.0)

- **Native App Tracking**: Uses Rust and Windows API for seamless, lightweight background tracking of active windows.
- **Fast Icon Extraction**: Native GDI-based executable icon extraction, instantly cached and displayed in a beautifully rendered dashboard.
- **Smart AFK Detection**: Automatically stops tracking when your keyboard and mouse go idle, preventing skewed data. Customizable from 1 to 30 minutes.
- **Micro-Session Filtering**: Ignores rapid Alt-Tabbing and transient windows to keep your dashboard clean.
- **Process Classification**: Intelligently categorizes 60+ popular development, browsing, and productivity tools, mapping them to uniform brand colors.
- **History & Analytics**: Interactive trend charts showing 7-day retrospective data and a chronological session timeline for any given day.
- **Premium Glassmorphism UI**: Built with Tailwind CSS, Framer Motion, and Recharts, featuring smooth animations, soft gradients, and modern frosted glass layers.

## 🛠️ Technology Stack

- **Core Framework**: [Tauri v2](https://v2.tauri.app/) (Rust + Webview)
- **Frontend**: React 18, Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Charting**: Recharts
- **Icons**: Lucide React
- **Database**: SQLite (via `@tauri-apps/plugin-sql`)
- **System API**: `windows` crate for deep OS-level integration

## 🚀 Getting Started

### Prerequisites

Ensure you have the required build tools for Tauri installed on your system.
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v18+)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/182376/time-tracking.git
   cd time-tracking
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the application in development mode:
   ```bash
   npm run tauri dev
   ```

4. Build for production:
   ```bash
   npm run tauri build
   ```

## 🗺️ Roadmap (Upcoming Features)
* **System Tray Integration**: Run entirely in the background and auto-start on boot.
* **Window Details**: Deep dive into specific applications (e.g., track time spent per project inside VS Code).
* **Time Goals**: Set and monitor daily limits for specific app categories.
* **Data Export**: Export your historical data to JSON/CSV.

## 📄 License
MIT License
