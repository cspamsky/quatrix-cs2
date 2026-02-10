# Changelog

All notable changes to Quatrix CS2 Server Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-Beta] - 2026-02-10

### Added

#### Core Features

- **Dashboard**: Real-time CPU, RAM, and network usage monitoring
- **RCON Console**: Interactive command execution with color-coded output and command history
- **Player Management**: Live player list with Steam profiles, connection times, and kick/ban controls
- **Chat Monitor**: Real-time in-game chat with player avatars and filtering
- **File Manager**: Web-based config editor supporting `.cfg`, `.json`, `.txt`, `.toml` files
- **Analytics Dashboard**: Historical system performance metrics with customizable time ranges (24h, 7d, 30d)

#### Instance Management

- **Multi-instance support**: Manage multiple CS2 servers from a single panel
- **Granular symlinking**: Share game files (`.vpk` assets) while isolating configs and plugins
- **Plugin pool**: Deploy plugins to multiple instances from a central repository
- **Auto-repair**: Validates and fixes file structure issues on server start
- **Automated backups**: Scheduled database and configuration backups with retention policies
- **Database Management**: Server provisioning with automatic MySQL credential injection for plugins

#### Administration & Security

- **ACL Permission System**: Granular access control with permissions like `servers.create`, `servers.update`, `users.manage`
- **Transparent Observer Mode**: All users can view all pages, but actions are restricted based on permissions
- **User Authentication**: JWT-based sessions with optional 2FA (TOTP)
- **Admin System**: Integrated with CounterStrikeSharp's admin framework
- **SQL Injection Protection**: Parameterized queries and structured input validation for raw SQL console
- **Multi-language Support**: English and Turkish localization (i18next)

#### Plugin Management

- **PluginManager Service**: Orchestrates plugin installation and configuration
- **PluginDatabaseInjector**: Automatically provisions and injects MySQL credentials into plugin configuration files
- **Plugin Installation Service**: Database credential injection with support for JSON and plugin-specific config formats

#### Technical Infrastructure

- **WebSocket Integration**: Real-time updates for console, chat, and player data via Socket.IO
- **SteamCMD Integration**: Automated CS2 server installation and updates
- **Steam Profile Integration**: Avatars and SteamID conversion
- **Systemd Service Management**: Automated service creation and management
- **UFW Firewall Configuration**: Automatic port management for CS2 instances

### Changed

- Enhanced README documentation with improved clarity, feature descriptions, and installation instructions
- Improved security hardening across all SQL operations
- Optimized database management with better error handling

### Security

- Implemented SQL injection protection with parameter binding
- Added structured input validation for raw SQL console feature
- Secured database credential management with environment variable isolation

---

## Release Notes

This is the first public beta release of Quatrix CS2 Server Manager. The project provides a comprehensive web-based management panel for Counter-Strike 2 dedicated servers with focus on:

- **Multi-instance efficiency**: Run multiple CS2 server instances without duplicating 60GB+ game files
- **Real-time control**: WebSocket-based live updates for console, chat, and player data
- **Modern interface**: React 19-based UI with responsive design and dark mode
- **Security-first approach**: ACL permissions, 2FA support, and SQL injection protection

### Known Limitations

- External database support (MySQL/MariaDB) for shared stats is planned but not yet implemented
- Workshop map downloader integration is in development
- REST API documentation for third-party integrations is planned

### Installation

See [README.md](README.md) for detailed installation instructions.

### Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

**Full Changelog**: Initial release
