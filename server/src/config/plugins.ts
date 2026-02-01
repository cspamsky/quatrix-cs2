export const pluginRegistry = {
    metamod: {
        name: 'Metamod:Source',
        currentVersion: '2.0-git1383',
        folderName: 'metamod',
        category: 'core' as const,
        tags: ['core', 'framework'],
        description: 'Base framework for all server mods'
    },
    cssharp: {
        name: 'CounterStrikeSharp',
        currentVersion: '1.0.362',
        folderName: 'counterstrikesharp',
        category: 'core' as const,
        tags: ['core', 'scripting'],
        description: 'C# scripting platform for CS2'
    },
    // MetaMod Plugins
    cs2fixes: {
        name: 'CS2Fixes',
        currentVersion: '1.17',
        category: 'metamod' as const,
        tags: ['fix', 'utility', 'performance'],
        description: 'Essential fixes and performance improvements',
        folderName: 'cs2fixes'
    },
    playerfix: {
        name: 'ServerListPlayersFix',
        currentVersion: '1.0.5',
        category: 'metamod' as const,
        tags: ['fix', 'utility'],
        description: 'Fixes players count in server browser',
        folderName: 'serverlistplayersfix_mm'
    },
    movelock: {
        name: 'MovementUnlocker',
        currentVersion: '1.9',
        category: 'metamod' as const,
        tags: ['movement', 'surf', 'bhop'],
        description: 'Removes max speed limitation (BHOP/Surf)',
        folderName: 'MovementUnlocker'
    },
    addonmanager: {
        name: 'MultiAddonManager',
        currentVersion: '1.4.8',
        category: 'metamod' as const,
        tags: ['utility', 'workshop'],
        description: 'Manage multiple workshop addons',
        folderName: 'multiaddonmanager'
    },
    accelerator: {
        name: 'AcceleratorCS2',
        currentVersion: '2.0.4',
        category: 'metamod' as const,
        tags: ['fix', 'utility', 'debug'],
        description: 'Generate crash dumps on server crash',
        folderName: 'AcceleratorCS2'
    },
    // CS# Plugins
    matchzy: {
        name: 'MatchZy',
        currentVersion: '0.8.15',
        category: 'cssharp' as const,
        tags: ['gamemode', 'competitive', 'admin'],
        description: 'Comp/Match management plugin',
        folderName: 'MatchZy'
    },
    simpleadmin: {
        name: 'CS2-SimpleAdmin',
        currentVersion: '1.7.8-beta-10b1',
        category: 'cssharp' as const,
        tags: ['admin', 'utility'],
        description: 'User-friendly admin management system',
        folderName: 'CS2-SimpleAdmin'
    },
    weaponpaints: {
        name: 'WeaponPaints',
        currentVersion: 'latest',
        category: 'cssharp' as const,
        tags: ['fun', 'skins'],
        description: 'Skins, Gloves, and Agents changer',
        folderName: 'WeaponPaints'
    },
    retakes: {
        name: 'CS2-Retakes',
        currentVersion: '3.0.2',
        category: 'cssharp' as const,
        tags: ['gamemode', 'retakes'],
        description: 'Retake gamemode implementation',
        folderName: 'RetakesPlugin'
    },
    ranks: {
        name: 'CS2-Ranks',
        currentVersion: 'latest',
        category: 'cssharp' as const,
        tags: ['fun', 'utility', 'ranking'],
        description: 'XP and Rank system (Global Elite)',
        folderName: 'CS2-Ranks'
    },
    rtv: {
        name: 'RockTheVote',
        currentVersion: '1.8.5',
        category: 'cssharp' as const,
        tags: ['utility', 'map-voting'],
        description: 'Map voting and management system',
        folderName: 'RockTheVote'
    },
    essentials: {
        name: 'CS2-Essentials',
        currentVersion: '1.3.0',
        category: 'cssharp' as const,
        tags: ['utility', 'admin', 'commands'],
        description: 'Basic commands and exploit fixes',
        folderName: 'CS2-Essentials'
    },
    botai: {
        name: 'BotAI',
        currentVersion: '1.3',
        category: 'cssharp' as const,
        tags: ['bot', 'utility', 'ai'],
        description: 'Improved Bot AI (prevents knife rushing, smarter behavior)',
        folderName: 'BotAI'
    },
    fixrandomspawn: {
        name: 'FixRandomSpawn',
        currentVersion: '1.1.4.1',
        category: 'cssharp' as const,
        tags: ['fix', 'utility', 'spawn'],
        description: 'Fixes mp_randomspawn ConVar for any game mode',
        folderName: 'FixRandomSpawn'
    },
    execafter: {
        name: 'CS2_ExecAfter',
        currentVersion: '1.0.0',
        category: 'cssharp' as const,
        tags: ['utility', 'admin', 'commands'],
        description: 'Executes commands after server events or delay',
        folderName: 'CS2_ExecAfter'
    },
    removemapweapons: {
        name: 'CS2 Remove Map Weapons',
        currentVersion: '1.0.1',
        category: 'cssharp' as const,
        tags: ['utility', 'fix', 'weapons'],
        description: 'Removes manually placed weapons from maps',
        folderName: 'CS2-Remove-Map-Weapons'
    },
    gamemodemanager: {
        name: 'GameModeManager',
        currentVersion: '1.0.63',
        category: 'cssharp' as const,
        tags: ['gamemode', 'admin', 'utility'],
        description: 'Manage game modes and map groups easily',
        folderName: 'GameModeManager'
    },
    inventorysim: {
        name: 'Inventory Simulator',
        currentVersion: '37',
        category: 'cssharp' as const,
        tags: ['fun', 'skins', 'inventory'],
        description: 'Skin changer (Skins, Gloves, Agents, etc)',
        folderName: 'InventorySimulator'
    },
    modelchanger: {
        name: 'PlayerModelChanger',
        currentVersion: '1.8.6',
        category: 'cssharp' as const,
        tags: ['fun', 'skins', 'models'],
        description: 'Lightweight player model changer',
        folderName: 'PlayerModelChanger'
    },
    mapconfigurator: {
        name: 'MapConfigurator',
        currentVersion: '1.0.2',
        category: 'cssharp' as const,
        tags: ['utility', 'admin', 'map-config'],
        description: 'Unique configuration files for each map',
        folderName: 'MapConfigurator'
    },
    damageinfo: {
        name: 'K4-DamageInfo',
        currentVersion: '2.4.0',
        category: 'cssharp' as const,
        tags: ['utility', 'combat', 'hud'],
        description: 'Detailed damage and hit group information',
        folderName: 'K4-DamageInfo'
    },
    cs2rcon: {
        name: 'CS2Rcon',
        currentVersion: '1.2.0',
        category: 'cssharp' as const,
        tags: ['admin', 'utility', 'rcon'],
        description: 'Rudimentary RCON implementation via CSS',
        folderName: 'CS2Rcon'
    },
    sharptimer: {
        name: 'SharpTimer',
        currentVersion: '0.3.1x',
        category: 'cssharp' as const,
        tags: ['gamemode', 'timer', 'movement', 'surf', 'bhop'],
        description: 'Timer for Surf/KZ/Bhop/MG/Deathrun',
        folderName: 'SharpTimer'
    },
    stfixes: {
        name: 'STFixes',
        currentVersion: '1.0.5',
        category: 'cssharp' as const,
        tags: ['fix', 'utility', 'movement'],
        description: 'Common fixes for SharpTimer servers',
        folderName: 'STFixes'
    },
    arenas: {
        name: 'K4-Arenas',
        currentVersion: '2.0.8',
        category: 'cssharp' as const,
        tags: ['gamemode', 'arenas', 'ladder'],
        description: 'Multi-arena/Ladder gamemode',
        folderName: 'K4-Arenas'
    },
    instadefuse: {
        name: 'CS2 Instadefuse',
        currentVersion: '2.0.0',
        category: 'cssharp' as const,
        tags: ['utility', 'gamemode', 'bomb'],
        description: 'Instant bomb defusal when safe',
        folderName: 'cs2-instadefuse'
    },
    retakesallocator: {
        name: 'CS2 Retakes Allocator',
        currentVersion: '2.4.2',
        category: 'cssharp' as const,
        tags: ['gamemode', 'retakes', 'weapons'],
        description: 'Advanced weapon allocator for Retakes',
        folderName: 'cs2-retakes-allocator'
    },
    whitelist: {
        name: 'CS2 Whitelist',
        currentVersion: '1.0.0',
        category: 'cssharp' as const,
        tags: ['admin', 'security', 'utility'],
        description: 'Restrict access to specific SteamIDs',
        folderName: 'WhiteList'
    },
    executes: {
        name: 'CS2 Executes',
        currentVersion: '1.1.1',
        category: 'cssharp' as const,
        tags: ['gamemode', 'executes', 'competitive'],
        description: 'Execute site takes gamemode',
        folderName: 'cs2-executes'
    },
    advertisement: {
        name: 'CS2 Advertisement',
        currentVersion: '1.0.8-recompile',
        category: 'cssharp' as const,
        tags: ['utility', 'ads'],
        description: 'Show ads in chat/center/panel',
        folderName: 'Advertisement'
    },
    deathmatch: {
        name: 'CS2 Deathmatch',
        currentVersion: '1.3.0',
        category: 'cssharp' as const,
        tags: ['gamemode', 'deathmatch'],
        description: 'Custom Deathmatch with gun selection',
        folderName: 'Deathmatch'
    },
    prefireprac: {
        name: 'OpenPrefirePrac',
        currentVersion: '0.1.47',
        category: 'cssharp' as const,
        tags: ['gamemode', 'practice', 'prefire'],
        description: 'Prefire practice on competitive maps',
        folderName: 'OpenPrefirePrac'
    },
    customvotes: {
        name: 'CS2-CustomVotes',
        currentVersion: '1.1.4',
        category: 'cssharp' as const,
        tags: ['utility', 'votes', 'admin'],
        description: 'Create custom votes for settings',
        folderName: 'CS2-CustomVotes'
    },
    deathrun: {
        name: 'deathrun-manager',
        currentVersion: '0.5.1',
        category: 'cssharp' as const,
        tags: ['gamemode', 'deathrun'],
        description: 'Deathrun gamemode manager',
        folderName: 'deathrun-manager'
    },
    announcement: {
        name: 'AnnouncementBroadcaster',
        currentVersion: '0.5',
        category: 'cssharp' as const,
        tags: ['utility', 'announcement', 'chat'],
        description: 'Conditional messages and timer broadcasts',
        folderName: 'CS2AnnouncementBroadcaster'
    },
    gamemodifiers: {
        name: 'CS2-GameModifiers',
        currentVersion: '1.0.4',
        category: 'cssharp' as const,
        tags: ['fun', 'gamemode'],
        description: 'Random gameplay modifiers every round',
        folderName: 'GameModifiers'
    },
    funmatch: {
        name: 'CS2FunMatchPlugin',
        currentVersion: '1.1.1',
        category: 'cssharp' as const,
        tags: ['fun', 'gamemode'],
        description: 'Fun round modes (gravity, speed, etc)',
        folderName: 'FunMatchPlugin'
    },
    rtd: {
        name: 'RollTheDice',
        currentVersion: '26.01.3',
        category: 'cssharp' as const,
        tags: ['fun', 'gamemode', 'rtd'],
        description: 'Roll dice for random effects',
        folderName: 'cs2-roll-the-dice'
    },
    mutualscoring: {
        name: 'CS2-MutualScoringPlayers',
        currentVersion: '1.0.3',
        category: 'cssharp' as const,
        tags: ['utility', 'combat', 'scoring'],
        description: 'Track head-to-head kills between players',
        folderName: 'MutualScoringPlayers'
    },
    warcraft: {
        name: 'CS2WarcraftMod',
        currentVersion: '3.3.5',
        category: 'cssharp' as const,
        tags: ['gamemode', 'rpg', 'warcraft'],
        description: 'Comprehensive Warcraft RPG system',
        folderName: 'warcraft-plugin'
    },
    advancedweapon: {
        name: 'CS2 Advanced Weapon System',
        currentVersion: '1.11',
        category: 'cssharp' as const,
        tags: ['utility', 'combat', 'weapons'],
        description: 'Advanced weapon attribute control',
        folderName: 'cs2-advanced-weapon-system'
    },
    oneinthechamber: {
        name: 'CS2 One In The Chamber',
        currentVersion: '1.0.0',
        category: 'cssharp' as const,
        tags: ['gamemode', 'one-in-the-chamber'],
        description: 'One In The Chamber gamemode',
        folderName: 'cs2-OneInTheChamber'
    },
    quakesounds: {
        name: 'CS2 Quake Sounds',
        currentVersion: '26.01.3',
        category: 'cssharp' as const,
        tags: ['fun', 'audio', 'quake'],
        description: 'Quake announcment sounds for kills',
        folderName: 'cs2-quake-sounds'
    },
    weaponspeed: {
        name: 'CS2-WeaponSpeed',
        currentVersion: '1.3',
        category: 'cssharp' as const,
        tags: ['fun', 'utility', 'speed'],
        description: 'Speed boost when firing specific weapons',
        folderName: 'WeaponSpeed'
    },
    spectatorlist: {
        name: 'SpectatorList-CS2',
        currentVersion: '1.0.5',
        category: 'cssharp' as const,
        tags: ['utility', 'hud', 'spectator'],
        description: 'Shows real-time spectators on screen',
        folderName: 'SpectatorList'
    },
    football: {
        name: 'SLAYER_Football',
        currentVersion: '1.1',
        category: 'cssharp' as const,
        tags: ['gamemode', 'fun', 'football'],
        description: 'Football game mode for CS2',
        folderName: 'SLAYER_Football'
    },
    revive: {
        name: 'SLAYER_Revive',
        currentVersion: '1.3.2',
        category: 'cssharp' as const,
        tags: ['gamemode', 'utility', 'revive'],
        description: 'Revive teammates in-game',
        folderName: 'SLAYER_Revive'
    },
    teleportkill: {
        name: 'CS2-TeleportKill',
        currentVersion: '1.0.1',
        category: 'cssharp' as const,
        tags: ['fun', 'utility', 'teleport'],
        description: 'Teleport to victim position on kill',
        folderName: 'TeleportKill'
    },
    menumanager: {
        name: 'MenuManager',
        currentVersion: '1.4.1',
        category: 'cssharp' as const,
        tags: ['utility', 'menu', 'library'],
        description: 'Advanced menu management system for CS2',
        folderName: 'MenuManager'
    },
    playersettings: {
        name: 'PlayerSettings',
        currentVersion: '0.9.3',
        category: 'cssharp' as const,
        tags: ['utility', 'settings', 'persistence'],
        description: 'Persistent player settings and preferences',
        folderName: 'PlayerSettings'
    },
    anybaselib: {
        name: 'AnyBaseLib',
        currentVersion: '0.9.4',
        category: 'cssharp' as const,
        tags: ['library', 'utility', 'core'],
        description: 'Base library for NickFox007 plugins',
        folderName: 'AnyBaseLib'
    },
    afkmanager: {
        name: 'AFKManager',
        currentVersion: '0.2.8',
        category: 'cssharp' as const,
        tags: ['utility', 'afk', 'management'],
        description: 'Detects and manages AFK players (kick/move to spec)',
        folderName: 'AFKManager'
    }
} as const;

export type PluginId = keyof typeof pluginRegistry;
