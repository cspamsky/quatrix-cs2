export const pluginRegistry = {
    metamod: {
        name: 'Metamod:Source',
        currentVersion: '2.0-git1382',
        githubRepo: null,
        downloadUrl: 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1382-linux.tar.gz',
        category: 'core' as const,
        tags: ['core', 'framework'],
        description: 'Base framework for all server mods'
    },
    cssharp: {
        name: 'CounterStrikeSharp',
        currentVersion: 'v1.0.356',
        githubRepo: 'roflmuffin/CounterStrikeSharp',
        downloadUrl: 'https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v1.0.356/counterstrikesharp-with-runtime-linux-1.0.356.zip',
        assetNamePattern: 'counterstrikesharp-with-runtime-linux-{version_clean}.zip',
        category: 'core' as const,
        tags: ['core', 'scripting'],
        description: 'C# scripting platform for CS2'
    },
    // MetaMod Plugins
    cs2fixes: {
        name: 'CS2Fixes',
        currentVersion: 'v1.17',
        githubRepo: 'Source2ZE/CS2Fixes',
        downloadUrl: 'https://github.com/Source2ZE/CS2Fixes/releases/download/v1.17/CS2Fixes-v1.17-linux.tar.gz',
        category: 'metamod' as const,
        tags: ['fix', 'utility', 'performance'],
        description: 'Essential fixes and performance improvements',
        folderName: 'cs2fixes'
    },
    playerfix: {
        name: 'ServerListPlayersFix',
        currentVersion: 'v1.0.5',
        githubRepo: 'Source2ZE/ServerListPlayersFix',
        downloadUrl: 'https://github.com/Source2ZE/ServerListPlayersFix/releases/latest/download/ServerListPlayersFix-v1.0.5-linux.tar.gz',
        category: 'metamod' as const,
        tags: ['fix', 'utility'],
        description: 'Fixes players count in server browser',
        folderName: 'serverlistplayersfix_mm'
    },
    movelock: {
        name: 'MovementUnlocker',
        currentVersion: 'v1.9',
        githubRepo: 'Source2ZE/MovementUnlocker',
        downloadUrl: 'https://github.com/Source2ZE/MovementUnlocker/releases/latest/download/MovementUnlocker-v1.9-linux.tar.gz',
        category: 'metamod' as const,
        tags: ['movement', 'surf', 'bhop'],
        description: 'Removes max speed limitation (BHOP/Surf)',
        folderName: 'MovementUnlocker'
    },
    addonmanager: {
        name: 'MultiAddonManager',
        currentVersion: 'v1.4.8',
        githubRepo: 'Source2ZE/MultiAddonManager',
        downloadUrl: 'https://github.com/Source2ZE/MultiAddonManager/releases/latest/download/MultiAddonManager-v1.4.8-linux.tar.gz',
        category: 'metamod' as const,
        tags: ['utility', 'workshop'],
        description: 'Manage multiple workshop addons',
        folderName: 'multiaddonmanager'
    },
    accelerator: {
        name: 'AcceleratorCS2',
        currentVersion: 'v2.0.4',
        githubRepo: 'Source2ZE/AcceleratorCS2',
        downloadUrl: 'https://github.com/Source2ZE/AcceleratorCS2/releases/latest/download/addons.zip',
        category: 'metamod' as const,
        tags: ['fix', 'utility', 'debug'],
        description: 'Generate crash dumps on server crash',
        folderName: 'AcceleratorCS2'
    },
    // CS# Plugins
    matchzy: {
        name: 'MatchZy',
        currentVersion: '0.8.15',
        githubRepo: 'shobhit-pathak/MatchZy',
        downloadUrl: 'https://github.com/shobhit-pathak/MatchZy/releases/latest/download/MatchZy-0.8.15.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'competitive', 'admin'],
        description: 'Comp/Match management plugin',
        folderName: 'MatchZy'
    },
    simpleadmin: {
        name: 'CS2-SimpleAdmin',
        currentVersion: '1.7.8-beta-8',
        githubRepo: 'daffyyyy/CS2-SimpleAdmin',
        downloadUrl: 'https://github.com/daffyyyy/CS2-SimpleAdmin/releases/latest/download/CS2-SimpleAdmin-1.7.8-beta-8.zip',
        category: 'cssharp' as const,
        tags: ['admin', 'utility'],
        description: 'User-friendly admin management system',
        folderName: 'CS2-SimpleAdmin'
    },
    weaponpaints: {
        name: 'WeaponPaints',
        currentVersion: 'latest',
        githubRepo: 'Nereziel/cs2-WeaponPaints',
        downloadUrl: 'https://github.com/Nereziel/cs2-WeaponPaints/releases/latest/download/WeaponPaints.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'skins'],
        description: 'Skins, Gloves, and Agents changer',
        folderName: 'WeaponPaints'
    },
    retakes: {
        name: 'CS2-Retakes',
        currentVersion: '3.0.2',
        githubRepo: 'B3none/cs2-retakes',
        downloadUrl: 'https://github.com/B3none/cs2-retakes/releases/latest/download/RetakesPlugin-3.0.2.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'retakes'],
        description: 'Retake gamemode implementation',
        folderName: 'RetakesPlugin'
    },
    ranks: {
        name: 'CS2-Ranks',
        currentVersion: 'latest',
        githubRepo: 'partiusfabaa/cs2-ranks',
        downloadUrl: 'https://github.com/partiusfabaa/cs2-ranks/releases/latest/download/Ranks.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'utility', 'ranking'],
        description: 'XP and Rank system (Global Elite)',
        folderName: 'CS2-Ranks'
    },
    rtv: {
        name: 'RockTheVote',
        currentVersion: 'v1.9.6',
        githubRepo: 'Oz-Lin/cs2-rockthevote',
        downloadUrl: 'https://github.com/Oz-Lin/cs2-rockthevote/releases/latest/download/RockTheVote-v1.9.6.RELEASE.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'map-voting'],
        description: 'Map voting and management system',
        folderName: 'RockTheVote'
    },
    essentials: {
        name: 'CS2-Essentials',
        currentVersion: '1.3.0',
        githubRepo: 'HvH-gg/CS2-Essentials',
        downloadUrl: 'https://github.com/HvH-gg/CS2-Essentials/releases/latest/download/CS2-Essentials-1.3.0-6eaaeb7.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'admin', 'commands'],
        description: 'Basic commands and exploit fixes',
        folderName: 'CS2-Essentials'
    },
    botai: {
        name: 'BotAI',
        currentVersion: 'V1.3',
        githubRepo: 'Austinbots/CS2-BotAI',
        downloadUrl: 'https://github.com/Austinbots/CS2-BotAI/releases/download/V1.3/BotAiV1.3.zip',
        category: 'cssharp' as const,
        tags: ['bot', 'utility', 'ai'],
        description: 'Improved Bot AI (prevents knife rushing, smarter behavior)',
        folderName: 'BotAI'
    },
    fixrandomspawn: {
        name: 'FixRandomSpawn',
        currentVersion: 'v1.1.4.1',
        githubRepo: 'qstage/CS2-FixRandomSpawn',
        downloadUrl: 'https://github.com/qstage/CS2-FixRandomSpawn/releases/download/v1.1.4.1/FixRandomSpawn.zip',
        category: 'cssharp' as const,
        tags: ['fix', 'utility', 'spawn'],
        description: 'Fixes mp_randomspawn ConVar for any game mode',
        folderName: 'FixRandomSpawn'
    },
    execafter: {
        name: 'CS2_ExecAfter',
        currentVersion: 'v1.0.0',
        githubRepo: 'kus/CS2_ExecAfter',
        downloadUrl: 'https://github.com/kus/CS2_ExecAfter/releases/download/v1.0.0/CS2_ExecAfter-1.0.0.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'admin', 'commands'],
        description: 'Executes commands after server events or delay',
        folderName: 'CS2_ExecAfter'
    },
    removemapweapons: {
        name: 'CS2 Remove Map Weapons',
        currentVersion: '1.0.1',
        githubRepo: 'kus/CS2-Remove-Map-Weapons',
        downloadUrl: 'https://github.com/kus/CS2-Remove-Map-Weapons/releases/download/v1.0.1/CS2-Remove-Map-Weapons-1.0.1.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'fix', 'weapons'],
        description: 'Removes manually placed weapons from maps',
        folderName: 'CS2-Remove-Map-Weapons'
    },
    gamemodemanager: {
        name: 'GameModeManager',
        currentVersion: 'v1.0.63',
        githubRepo: 'nickj609/GameModeManager',
        downloadUrl: 'https://github.com/nickj609/GameModeManager/releases/download/v1.0.63/GameModeManager_v1.0.63.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'admin', 'utility'],
        description: 'Manage game modes and map groups easily',
        folderName: 'GameModeManager'
    },
    inventorysim: {
        name: 'Inventory Simulator',
        currentVersion: 'v37',
        githubRepo: 'ianlucas/cs2-css-inventory-simulator',
        downloadUrl: 'https://github.com/ianlucas/cs2-css-inventory-simulator/releases/download/v37/InventorySimulator-v37.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'skins', 'inventory'],
        description: 'Skin changer (Skins, Gloves, Agents, etc)',
        folderName: 'InventorySimulator'
    },
    modelchanger: {
        name: 'PlayerModelChanger',
        currentVersion: 'v1.8.6',
        githubRepo: 'samyycX/CS2-PlayerModelChanger',
        downloadUrl: 'https://github.com/samyycX/CS2-PlayerModelChanger/releases/download/release-v1.8.6/PlayerModelChanger.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'skins', 'models'],
        description: 'Lightweight player model changer',
        folderName: 'PlayerModelChanger'
    },
    mapconfigurator: {
        name: 'MapConfigurator',
        currentVersion: '1.0.2',
        githubRepo: 'ManifestManah/MapConfigurator',
        downloadUrl: 'https://github.com/ManifestManah/MapConfigurator/archive/refs/heads/main.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'admin', 'map-config'],
        description: 'Unique configuration files for each map',
        folderName: 'MapConfigurator'
    },
    damageinfo: {
        name: 'K4-DamageInfo',
        currentVersion: '2.4.0',
        githubRepo: 'KitsuneLab-Development/K4-DamageInfo',
        downloadUrl: 'https://github.com/KitsuneLab-Development/K4-DamageInfo/releases/download/v2.4.0/K4-DamageInfo.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'combat', 'hud'],
        description: 'Detailed damage and hit group information',
        folderName: 'K4-DamageInfo'
    },
    cs2rcon: {
        name: 'CS2Rcon',
        currentVersion: '1.2.0',
        githubRepo: 'LordFetznschaedl/CS2Rcon',
        downloadUrl: 'https://github.com/LordFetznschaedl/CS2Rcon/releases/download/1.2.0/CS2Rcon-1.2.0.zip',
        category: 'cssharp' as const,
        tags: ['admin', 'utility', 'rcon'],
        description: 'Rudimentary RCON implementation via CSS',
        folderName: 'CS2Rcon'
    },
    sharptimer: {
        name: 'SharpTimer',
        currentVersion: 'v0.3.1x',
        githubRepo: 'Letaryat/poor-sharptimer',
        downloadUrl: 'https://github.com/Letaryat/poor-sharptimer/releases/download/v0.3.1x/SharpTimer_0.3.1x.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'timer', 'movement', 'surf', 'bhop'],
        description: 'Timer for Surf/KZ/Bhop/MG/Deathrun',
        folderName: 'SharpTimer'
    },
    stfixes: {
        name: 'STFixes',
        currentVersion: 'v1.0.5',
        githubRepo: 'rcnoob/STFixes',
        downloadUrl: 'https://github.com/rcnoob/STFixes/releases/download/v1.0.5/STFixes_1.0.5.zip',
        category: 'cssharp' as const,
        tags: ['fix', 'utility', 'movement'],
        description: 'Common fixes for SharpTimer servers',
        folderName: 'STFixes'
    },
    arenas: {
        name: 'K4-Arenas',
        currentVersion: 'v2.0.8',
        githubRepo: 'KitsuneLab-Development/K4-Arenas',
        downloadUrl: 'https://github.com/KitsuneLab-Development/K4-Arenas/releases/download/v2.0.8/K4-Arenas.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'arenas', 'ladder'],
        description: 'Multi-arena/Ladder gamemode',
        folderName: 'K4-Arenas'
    },
    instadefuse: {
        name: 'CS2 Instadefuse',
        currentVersion: '2.0.0',
        githubRepo: 'B3none/cs2-instadefuse',
        downloadUrl: 'https://github.com/B3none/cs2-instadefuse/releases/download/2.0.0/cs2-instadefuse-2.0.0.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'gamemode', 'bomb'],
        description: 'Instant bomb defusal when safe',
        folderName: 'cs2-instadefuse'
    },
    retakesallocator: {
        name: 'CS2 Retakes Allocator',
        currentVersion: 'v2.4.2',
        githubRepo: 'yonilerner/cs2-retakes-allocator',
        downloadUrl: 'https://github.com/yonilerner/cs2-retakes-allocator/releases/download/v2.4.2/cs2-retakes-allocator-v2.4.2.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'retakes', 'weapons'],
        description: 'Advanced weapon allocator for Retakes',
        folderName: 'cs2-retakes-allocator'
    },
    whitelist: {
        name: 'CS2 Whitelist',
        currentVersion: '1.0.0',
        githubRepo: 'PhantomYopta/CS2_WhiteList',
        downloadUrl: 'https://github.com/PhantomYopta/CS2_WhiteList/releases/download/1.0.0/WhiteList.zip',
        category: 'cssharp' as const,
        tags: ['admin', 'security', 'utility'],
        description: 'Restrict access to specific SteamIDs',
        folderName: 'WhiteList'
    },
    executes: {
        name: 'CS2 Executes',
        currentVersion: '1.1.1',
        githubRepo: 'zwolof/cs2-executes',
        downloadUrl: 'https://github.com/zwolof/cs2-executes/releases/download/1.1.1/cs2-executes-1.1.1.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'executes', 'competitive'],
        description: 'Execute site takes gamemode',
        folderName: 'cs2-executes'
    },
    advertisement: {
        name: 'CS2 Advertisement',
        currentVersion: 'v1.0.8-recompile',
        githubRepo: 'partiusfabaa/cs2-advertisement',
        downloadUrl: 'https://github.com/partiusfabaa/cs2-advertisement/releases/download/v1.0.8-recompile/Advertisement.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'ads'],
        description: 'Show ads in chat/center/panel',
        folderName: 'Advertisement'
    },
    deathmatch: {
        name: 'CS2 Deathmatch',
        currentVersion: 'v1.3.0',
        githubRepo: 'NockyCZ/CS2-Deathmatch',
        downloadUrl: 'https://github.com/NockyCZ/CS2-Deathmatch/releases/download/v1.3.0/Deathmatch.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'deathmatch'],
        description: 'Custom Deathmatch with gun selection',
        folderName: 'Deathmatch'
    },
    prefireprac: {
        name: 'OpenPrefirePrac',
        currentVersion: 'v0.1.47',
        githubRepo: 'lengran/OpenPrefirePrac',
        downloadUrl: 'https://github.com/lengran/OpenPrefirePrac/releases/download/v0.1.47/OpenPrefirePrac-v0.1.47.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'practice', 'prefire'],
        description: 'Prefire practice on competitive maps',
        folderName: 'OpenPrefirePrac'
    },
    customvotes: {
        name: 'CS2-CustomVotes',
        currentVersion: 'v1.1.4',
        githubRepo: 'imi-tat0r/CS2-CustomVotes',
        downloadUrl: 'https://github.com/imi-tat0r/CS2-CustomVotes/releases/download/v1.1.4/CS2-CustomVotes-1.1.4-c494e8a.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'votes', 'admin'],
        description: 'Create custom votes for settings',
        folderName: 'CS2-CustomVotes'
    },
    deathrun: {
        name: 'deathrun-manager',
        currentVersion: 'V0.5.1',
        githubRepo: 'leoskiline/cs2-deathrun-manager',
        downloadUrl: 'https://github.com/leoskiline/cs2-deathrun-manager/releases/download/V0.5.1/cs2-deathrun-manager-0.5.1.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'deathrun'],
        description: 'Deathrun gamemode manager',
        folderName: 'deathrun-manager'
    },
    announcement: {
        name: 'AnnouncementBroadcaster',
        currentVersion: 'v0.5',
        githubRepo: 'lengran/CS2AnnouncementBroadcaster',
        downloadUrl: 'https://github.com/lengran/CS2AnnouncementBroadcaster/releases/download/v0.5/CS2AnnouncementBroadcaster-v0.5.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'announcement', 'chat'],
        description: 'Conditional messages and timer broadcasts',
        folderName: 'CS2AnnouncementBroadcaster'
    },
    gamemodifiers: {
        name: 'CS2-GameModifiers',
        currentVersion: 'v1.0.4',
        githubRepo: 'vinicius-trev/CS2-GameModifiers-Plugin',
        downloadUrl: 'https://github.com/vinicius-trev/CS2-GameModifiers-Plugin/releases/download/v1.0.4/GameModifiers-v1.0.4.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'gamemode'],
        description: 'Random gameplay modifiers every round',
        folderName: 'GameModifiers'
    },
    funmatch: {
        name: 'CS2FunMatchPlugin',
        currentVersion: 'v1.1.1',
        githubRepo: 'TitaniumLithium/CS2FunMatchPlugin',
        downloadUrl: 'https://github.com/TitaniumLithium/CS2FunMatchPlugin/releases/download/v1.1.1/FunMatchPlugin_dll_windows_v1.1.1.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'gamemode'],
        description: 'Fun round modes (gravity, speed, etc)',
        folderName: 'FunMatchPlugin'
    },
    rtd: {
        name: 'RollTheDice',
        currentVersion: '26.01.3',
        githubRepo: 'Kandru/cs2-roll-the-dice',
        downloadUrl: 'https://github.com/Kandru/cs2-roll-the-dice/releases/download/26.01.3/cs2-roll-the-dice-release-26.01.3.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'gamemode', 'rtd'],
        description: 'Roll dice for random effects',
        folderName: 'cs2-roll-the-dice'
    },
    mutualscoring: {
        name: 'CS2-MutualScoringPlayers',
        currentVersion: 'v1.0.3',
        githubRepo: 'qstage/CS2-MutualScoringPlayers',
        downloadUrl: 'https://github.com/qstage/CS2-MutualScoringPlayers/releases/download/v1.0.3/MutualScoringPlayers.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'combat', 'scoring'],
        description: 'Track head-to-head kills between players',
        folderName: 'MutualScoringPlayers'
    },
    warcraft: {
        name: 'CS2WarcraftMod',
        currentVersion: '3.3.5',
        githubRepo: 'Wngui/CS2WarcraftMod',
        downloadUrl: 'https://github.com/Wngui/CS2WarcraftMod/releases/download/3.3.5/warcraft-plugin-3.3.5.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'rpg', 'warcraft'],
        description: 'Comprehensive Warcraft RPG system',
        folderName: 'warcraft-plugin'
    },
    advancedweapon: {
        name: 'CS2 Advanced Weapon System',
        currentVersion: 'v1.11',
        githubRepo: 'schwarper/cs2-advanced-weapon-system',
        downloadUrl: 'https://github.com/schwarper/cs2-advanced-weapon-system/releases/download/v1.11/cs2-advanced-weapon-system-v1.11.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'combat', 'weapons'],
        description: 'Advanced weapon attribute control',
        folderName: 'cs2-advanced-weapon-system'
    },
    oneinthechamber: {
        name: 'CS2 One In The Chamber',
        currentVersion: '1.0.0',
        githubRepo: 'ShookEagle/cs2-OneInTheChamber',
        downloadUrl: 'https://github.com/ShookEagle/cs2-OneInTheChamber/releases/download/1.0.0/cs2-OneInTheChamber.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'one-in-the-chamber'],
        description: 'One In The Chamber gamemode',
        folderName: 'cs2-OneInTheChamber'
    },
    quakesounds: {
        name: 'CS2 Quake Sounds',
        currentVersion: '26.01.3',
        githubRepo: 'Kandru/cs2-quake-sounds',
        downloadUrl: 'https://github.com/Kandru/cs2-quake-sounds/releases/download/26.01.3/cs2-quake-sounds-release-26.01.3.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'audio', 'quake'],
        description: 'Quake announcment sounds for kills',
        folderName: 'cs2-quake-sounds'
    },
    weaponspeed: {
        name: 'CS2-WeaponSpeed',
        currentVersion: 'v1.3',
        githubRepo: 'akanora/CS2-WeaponSpeed',
        downloadUrl: 'https://github.com/akanora/CS2-WeaponSpeed/releases/download/v1.3/WeaponSpeed.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'utility', 'speed'],
        description: 'Speed boost when firing specific weapons',
        folderName: 'WeaponSpeed'
    },
    spectatorlist: {
        name: 'SpectatorList-CS2',
        currentVersion: 'v1.0.5',
        githubRepo: 'wiruwiru/SpectatorList-CS2',
        downloadUrl: 'https://github.com/wiruwiru/SpectatorList-CS2/releases/download/build-16/SpectatorList.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'hud', 'spectator'],
        description: 'Shows real-time spectators on screen',
        folderName: 'SpectatorList'
    },
    football: {
        name: 'SLAYER_Football',
        currentVersion: 'v1.1',
        githubRepo: 'zakriamansoor47/SLAYER_Football',
        downloadUrl: 'https://github.com/zakriamansoor47/SLAYER_Football/releases/download/v1.1/CS2_SLAYER_Football_v1.1.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'fun', 'football'],
        description: 'Football game mode for CS2',
        folderName: 'SLAYER_Football'
    },
    revive: {
        name: 'SLAYER_Revive',
        currentVersion: 'v1.3.2',
        githubRepo: 'zakriamansoor47/SLAYER_Revive',
        downloadUrl: 'https://github.com/zakriamansoor47/SLAYER_Revive/releases/download/v1.3.2/CS2.SLAYER_Revive.v1.3.2.zip',
        category: 'cssharp' as const,
        tags: ['gamemode', 'utility', 'revive'],
        description: 'Revive teammates in-game',
        folderName: 'SLAYER_Revive'
    },
    teleportkill: {
        name: 'CS2-TeleportKill',
        currentVersion: 'v1.0.1',
        githubRepo: 'rodopoulos1/cs2-TeleportKill',
        downloadUrl: 'https://github.com/rodopoulos1/cs2-TeleportKill/releases/download/1.0.1/TeleportKill-1.0.1.zip',
        category: 'cssharp' as const,
        tags: ['fun', 'utility', 'teleport'],
        description: 'Teleport to victim position on kill',
        folderName: 'TeleportKill'
    },
    menumanager: {
        name: 'MenuManager',
        currentVersion: '1.4.1',
        githubRepo: 'NickFox007/MenuManagerCS2',
        downloadUrl: 'https://github.com/NickFox007/MenuManagerCS2/releases/download/1.4.1/MenuManager.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'menu', 'library'],
        description: 'Advanced menu management system for CS2',
        folderName: 'MenuManager'
    },
    playersettings: {
        name: 'PlayerSettings',
        currentVersion: '0.9.3',
        githubRepo: 'NickFox007/PlayerSettingsCS2',
        downloadUrl: 'https://github.com/NickFox007/PlayerSettingsCS2/releases/download/0.9.3/PlayerSettings.zip',
        category: 'cssharp' as const,
        tags: ['utility', 'settings', 'persistence'],
        description: 'Persistent player settings and preferences',
        folderName: 'PlayerSettings'
    },
    anybaselib: {
        name: 'AnyBaseLib',
        currentVersion: '0.9.4',
        githubRepo: 'NickFox007/AnyBaseLibCS2',
        downloadUrl: 'https://github.com/NickFox007/AnyBaseLibCS2/releases/download/0.9.4/AnyBaseLib.zip',
        category: 'cssharp' as const,
        tags: ['library', 'utility', 'core'],
        description: 'Base library for NickFox007 plugins',
        folderName: 'AnyBaseLib'
    }
} as const;

export type PluginId = keyof typeof pluginRegistry;
