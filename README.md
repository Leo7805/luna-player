# Luna Player 🌙

A modern, lightweight, browser-based local video player.

Open any local folder, automatically discover videos across nested subdirectories, browse them in a hierarchical playlist with natural sorting, and play them directly in your browser.

**Core Philosophy:** Simple, beautiful, private, and easy to use.

---

## ✨ Features

- **🔒 100% Client-Side & Private**
  - Zero backend services, zero tracking, and zero cloud uploads.
  - Video streams are processed strictly in-browser via Blob Object URLs directly from local disk handles.
- **📂 Local Folder Discovery & Traversal**
  - Seamless folder selection via the modern **File System Access API** (`showDirectoryPicker`).
  - Graceful fallback to directory-enabled file picker (`webkitdirectory`) on unsupported browsers.
  - Automatically filters supported video formats (`.mp4`, `.webm`, `.mkv`, `.mov`, `.avi`, `.m4v`, `.ogv`).
  - Prunes empty folders and non-video files while preserving hierarchical nested directory structure.
- **🔢 Natural Sorting & Deterministic DFS Ordering**
  - Intuitively sorts video titles numerically (e.g., `Episode 1`, `Episode 2`, ..., `Episode 10`).
  - Deterministic Depth-First Search (DFS) playback sequencing traverses season folders sequentially.
- **▶️ Seamless Playback & Flow**
  - **Instant Selection Playback**: Clicking any episode in the playlist starts playback immediately without requiring secondary clicks.
  - **Autoplay-Next**: Automatically advances through episodes upon video completion.
  - **Continuous Navigation**: Dedicated Next/Previous controls maintain playback state.
  - **Pause/Resume**: Clicking the active video resumes playback.
- **💾 Playback Persistence**
  - Collision-proof library and video hashing preserves resume positions across browser sessions.
  - Automatically restarts completed videos from the beginning.
- **🎭 Theater Mode & Fullscreen**
  - Expanded theater layout with auto-hiding floating overlays.
  - Native HTML5 video fullscreen support.
- **🎨 Glassmorphic Themes & Alpine Scenic Backdrop**
  - High-resolution Moraine Lake & alpine mountain photographic background.
  - Class-based Light and Dark themes with WCAG AA-conscious contrast and frosted-glass panels.
  - Persists theme preferences across sessions.
- **♿ Fully Keyboard Accessible**
  - Sequential Tab navigation reaches all player and overlay controls even when hidden.
  - Keyboard activation via `Enter` / `Space`.

---

## 🛠️ Technology Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **APIs**: HTML5 Video API, File System Access API, IndexedDB
- **Testing**: [Vitest](https://vitest.dev/) (Unit) & [Playwright Test](https://playwright.dev/) (Chromium E2E)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` (or `pnpm` / `yarn`)

### Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd luna-player
npm install
```

### Development Server

Start the local development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173`.

### Production Build

Create an optimized static production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 🧪 Testing

### Unit Tests (Vitest)

Run the fast unit test suite covering natural sorting, video tree construction, DFS flattening, and playback progress persistence:

```bash
npm test
```

### End-to-End Smoke Tests (Playwright)

Run the full automated browser test suite against Chromium (includes directory picker mocks, real video playback verification, auto-hide overlay interactions, and visual regression checks):

```bash
npm run test:e2e
```

---

## 📁 Project Structure

```
luna-player/
├── public/
│   └── assets/
│       ├── scenery.webp       # Photographic alpine backdrop
│       └── scenery.svg        # Scalable vector backdrop fallback
├── src/
│   ├── assets/                # Bundled assets
│   ├── components/
│   │   ├── EmptyState.tsx     # Clean empty workspace with folder picker
│   │   ├── Header.tsx         # Brand title, folder metadata, theme toggle
│   │   ├── PlayerControls.tsx # Next/Prev, playback counter, autoplay toggles
│   │   ├── Playlist.tsx       # Hierarchical tree container and search input
│   │   ├── PlaylistFolder.tsx # Collapsible directory node
│   │   ├── PlaylistItem.tsx   # Video row with progress indicator
│   │   ├── RecoveryBanner.tsx # Stored directory permission re-grant prompt
│   │   └── VideoPlayer.tsx    # HTML5 video surface, overlay controls
│   ├── hooks/
│   │   ├── usePlayback.ts     # Playback state, auto-play, resume coordination
│   │   ├── useTheme.ts        # Light/Dark scheme switcher & localStorage sync
│   │   └── useVideoLibrary.ts # FSA API scanner, tree generator, fallback picker
│   ├── services/
│   │   ├── fallbackAccess.ts  # webkitdirectory FileList parser
│   │   ├── fileSystemAccess.ts# Recursive FSA directory scanner
│   │   └── progressStorage.ts # Persistent progress & settings storage
│   ├── types/
│   │   └── video.ts           # TypeScript interfaces for video nodes & libraries
│   ├── utils/
│   │   ├── formatters.ts      # Duration and file size formatting helpers
│   │   ├── naturalSort.ts     # Numeric-aware natural string comparison
│   │   └── videoTree.ts       # Tree builder and deterministic DFS traverser
│   ├── App.tsx                # Main application layout and state wiring
│   ├── index.css              # Tailwind utilities, class variants, glassmorphism
│   └── main.tsx               # React application entry point
├── tests/
│   ├── e2e/                   # Playwright E2E smoke and regression suites
│   └── fixtures/              # Sample local library test video fixtures
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
