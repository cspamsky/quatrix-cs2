# <img src="assets/logo.png" width="38" height="38" /> Quatrix CS2 Server Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.6.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

![Quatrix Dashboard](https://raw.githubusercontent.com/cspamsky/quatrix/main/assets/Dashboard.png)

A web-based management panel for Counter-Strike 2 dedicated servers. Quatrix provides real-time monitoring, RCON console, player management, and multi-instance support through a modern web interface.

**Target users:** CS2 server administrators running Linux dedicated servers  
**Scope:** Server-side management only (no client modifications or exploits)

---

## Why Quatrix

Quatrix addresses common pain points in CS2 server management:

- **Multi-instance efficiency**: Run multiple CS2 server instances without duplicating 60GB+ game files
- **Plugin management**: Centralized plugin pool with per-instance configuration
- **Real-time control**: WebSocket-based live updates for console, chat, and player data
- **Modern interface**: React-based UI with responsive design and dark mode

---

## ✨ Features

### Core Functionality

- **Dashboard**: Real-time CPU, RAM, and network usage monitoring
- **RCON Console**: Interactive command execution with color-coded output and command history
- **Player Management**: Live player list with Steam profiles, connection times, and kick/ban controls
- **Chat Monitor**: Real-time in-game chat with player avatars and filtering
- **File Manager**: Web-based config editor (supports `.cfg`, `.json`, `.txt`, `.toml`)

### Instance Management

- **Multi-instance support**: Manage multiple CS2 servers from one panel
- **Granular symlinking**: Shares game files (`.vpk` assets) while isolating configs and plugins
- **Plugin pool**: Deploy plugins to multiple instances from a central repository
- **Auto-repair**: Validates and fixes file structure issues on server start

### Administration

- **Admin system**: Integrated with CounterStrikeSharp's admin framework
- **User authentication**: JWT-based sessions with optional 2FA (TOTP)
- **Role-based access**: Per-user permissions for server control
- **Multi-language**: English and Turkish localization (i18next)

---

## 🏗️ Architecture

```
┌─────────────┐
│  React UI   │ ← WebSocket/REST → ┌──────────────┐
└─────────────┘                     │  Node.js API │
                                    └──────┬───────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼─────┐          ┌────▼────┐           ┌─────▼─────┐
              │ SQLite DB │          │ Plugins │           │ CS2 Core  │
              └───────────┘          │  Pool   │           │  (60GB+)  │
                                     └─────────┘           └─────┬─────┘
                                                                 │
                                                    ┌────────────┴────────────┐
                                                    │                         │
                                              ┌─────▼──────┐          ┌──────▼─────┐
                                              │ Instance 1 │          │ Instance 2 │
                                              │ (symlinks) │          │ (symlinks) │
                                              └────────────┘          └────────────┘
```

**Stack:**

- **Frontend**: React 19, Vite 7, Tailwind CSS, Socket.IO client
- **Backend**: Node.js 20+, Express, Socket.IO 4.8, better-sqlite3
- **Automation**: SteamCMD integration, systemd service management

---

## 📦 Installation

### Prerequisites

- Ubuntu 20.04+ or Debian 11+ (64-bit)
- Root or sudo access
- At least 70GB free disk space (for CS2 server files)

### Automated Installation

```bash
curl -sSL https://raw.githubusercontent.com/cspamsky/quatrix/main/install.sh | sudo bash
```

This script will:

1. Install Node.js 20, .NET 8 SDK, and required 32-bit libraries
2. Create a `quatrix` system user
3. Clone the repository to `/home/quatrix/quatrix`
4. Install dependencies and build the frontend
5. Configure a systemd service
6. Set up UFW firewall rules for CS2 ports

### Manual Installation

```bash
# Install dependencies
sudo apt update
sudo apt install -y curl git build-essential lib32gcc-s1

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and setup
git clone https://github.com/cspamsky/quatrix.git
cd quatrix
npm install
cd client && npm install && npm run build && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start
```

### Post-Installation

Access the panel at `http://your-server-ip:3001`

Default credentials are created on first run. Check the console output for login details.

---

## 🎮 Usage

### Managing Servers

1. **Create an instance**: Dashboard → Instances → Add New
2. **Configure settings**: Set server name, port, game mode, and map
3. **Install plugins**: Use the plugin pool to deploy Metamod:Source and CounterStrikeSharp
4. **Start server**: Click Start button in the instance card

### RCON Console

Execute commands directly from the web interface:

```
changelevel de_dust2
sv_cheats 1
mp_warmup_end
```

### Plugin Management

- Upload plugins to the central pool: `Plugins → Upload`
- Deploy to instances: Select plugin → Choose instances → Deploy
- Edit configs: File Manager → Navigate to plugin folder → Edit `.json`/`.cfg`

---

## 📁 Project Structure

```
quatrix/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Route pages
│   │   └── services/    # API clients
│   └── dist/            # Production build
├── server/              # Node.js backend
│   ├── routes/          # Express routes
│   ├── services/        # Business logic
│   ├── database/        # SQLite schema
│   └── utils/           # Helpers
├── instances/           # CS2 server instances
├── plugins/             # Central plugin pool
└── install.sh           # Automated installer
```

---

## 🗺️ Roadmap

**Completed:**

- ✅ Multi-instance management with symlink optimization
- ✅ Real-time RCON console and chat monitoring
- ✅ Steam profile integration (avatars, SteamID conversion)
- ✅ Plugin pool and deployment system
- ✅ Web-based file editor
- ✅ Admin permission management
- ✅ 2FA authentication

**Planned:**

- [ ] Automated backup system for configs and database
- [ ] Workshop map downloader integration
- [ ] External database support (MySQL/MariaDB) for shared stats
- [ ] REST API for third-party integrations
- [ ] Server performance analytics and graphs

---

## 🤝 Contributing

Contributions are welcome. Please follow these guidelines:

1. **Fork the repository** and create a feature branch
2. **Follow existing code style**: ESLint for JS/TS, Prettier for formatting
3. **Test your changes**: Ensure the panel builds and runs without errors
4. **Write clear commit messages**: Use conventional commits format
5. **Submit a pull request**: Describe what your changes do and why

### Development Setup

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Run in development mode
npm run dev          # Backend (port 3001)
cd client && npm run dev  # Frontend (port 5173)
```

### Reporting Issues

- Check existing issues before creating a new one
- Include CS2 server version, OS version, and Node.js version
- Provide error logs from `journalctl -u quatrix` or console output

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

**Author:** cspamsky  
**Repository:** [github.com/cspamsky/quatrix](https://github.com/cspamsky/quatrix)

---

## ⚠️ Disclaimer

This project is not affiliated with Valve Corporation. Counter-Strike 2 is a trademark of Valve Corporation.

Quatrix is designed for legitimate server administration only. Do not use this software for cheating, exploits, or any activities that violate Valve's terms of service.
