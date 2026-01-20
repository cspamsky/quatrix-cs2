# <img src="client/public/favicon.svg" width="32" height="32" /> Quatrix CS2 Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.6.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF.svg)](https://vitejs.dev/)

**Quatrix** is an elite, real-time web orchestration platform for Counter-Strike 2 server clusters. Designed for professional administrators who demand a premium, high-performance interface with zero-latency feedback.

![Quatrix Dashboard](assets/Dashboard.png)

## 🔥 Why Quatrix?

Game server management shouldn't feel like 1999. Quatrix bridges the gap between raw CLI power and modern UI aesthetics, offering a "glassmorphism" inspired dashboard that puts total control at your fingertips.

### 🚀 Core Performance Features

- **Elite Dashboard**: Live telemetry streams (CPU/RAM/Network) with delta-accurate traffic monitoring.
- **Smart RCON Orchestration**: High-speed console with intelligent auto-scroll, full ANSI color support, and spawngroup-aware status parsing.
- **Live Player Intelligence**: Real-time player list with Steam avatars, accurate connection duration, and latency tracking.
- **Plugin Marketplace**: One-click installation for Metamod, CounterStrikeSharp, and core community plugins (MatchZy, SimpleAdmin, etc.).
- **Dynamic Asset Engine**: Real-time map synchronization with automated themed visuals for the entire official CS2 map pool.
- **Unified File Manager**: A web-native explorer for live configuration editing without SFTP baggage.
- **Self-Healing Deployment**: Intelligent setup scripts with automated SteamCMD provisioning and dependency resolution.

### 🔒 Enterprise-Grade Security

- **Centralized Environment**: All configurations managed via a single, secure root `.env` file.
- **JWT-Powered Auth**: Stateless, secure authentication with bcrypt password hashing.
- **Path Confinement**: Strict directory traversal protection for all file system operations.
- **Rate Limiting**: Layered API protection against brute-force and DDoS attempts.

---

## 🛠️ Technology Stack

| Layer              | Technology                                           |
| :----------------- | :--------------------------------------------------- |
| **Frontend**       | React 19, Vite 7, Tailwind CSS, Lucide Icons         |
| **Backend**        | Node.js (ESM), Express 5, Socket.IO 4.8              |
| **Database**       | Better-SQLite3 (Synchronous Performance)             |
| **Protocols**      | RCON (Persistent Pooling), WebSockets, Steam Web API |
| **Infrastructure** | SystemInformation API, SteamCMD, Child Process Spawn |

---

## 🏃 Quick Start

### 1. Prerequisites

- **Node.js**: v20.6.0+ (Required for native `--env-file` support)
- **OS**: Linux (Ubuntu 22.04+ RECOMMENDED) or Windows
- **Linux Deps**: `lib32gcc-s1`, `lib32stdc++6`, `libc6-i386` (Required for SteamCMD)

### 2. Rapid Installation

Quatrix features an automated "Setup Wizard":

```bash
# Clone the vision
git clone https://github.com/cspamsky/quatrix.git
cd quatrix

# Automated Setup & Dependency Resolution
# This will: Initialize .env, Generate Secrets, and Install all Packages
npm run setup
```

### 3. Configuration

Edit the `.env` file in the root directory:

- Add your `STEAM_API_KEY` for player avatars.
- Configure `PORT` and `VITE_PORT` if needed.

### 4. Running the Hub

**For Development:**

```bash
npm run dev
```

**For Production (Recommended):**

```bash
npm run build
npm start
```

- **Unified Hub**: `http://localhost:3001` (Serves both API and UI in production)

---

## 📁 Architecture Overview

```text
quatrix/                     # Root Hub
├── .env                     # Centralized Configuration (Root)
├── scripts/                 # Automation & Maintenance Scripts
├── client/                  # Frontend Application (React Hub)
│   └── dist/                # Production UI Build
├── server/                  # Backend Engine (Node Service)
│   ├── data/                # Database & Global Assets
│   └── src/                 # RCON Orchestrator & API Logic
└── instances/               # Isolated CS2 Server Folders
```

---

## 🗺️ Roadmap: The Future of Server Management

- [] **Live Player Manager**: RCON status integration, Avatars, and Moderation tools.
- [] **Plugin Marketplace**: One-click install for CSS, MM, and top-tier plugins.
- [ ] **Steam Workshop Bridge**: Native workshop browser for automated map deployments.
- [ ] **Snapshot Backups**: Automated backups of configurations and plugin data.
- [ ] **Discord Integration**: Real-time alerts for server status and player sessions.

## 🤝 Contribution & Support

Quatrix is built by specialists for specialists. Whether it's a bug report, a feature request, or a PR, follow our [Contribution Guidelines](CONTRIBUTING.md).

Developed with precision for Quatrix. ⚡

---

_License: [MIT](LICENSE)_
