export const pluginRegistry = {
    metamod: {
        name: 'Metamod:Source',
        currentVersion: '2.0-git1382',
        githubRepo: null,
        downloadUrl: 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1382-linux.tar.gz',
        category: 'core' as const,
        description: 'Base framework for all server mods'
    },
    cssharp: {
        name: 'CounterStrikeSharp',
        currentVersion: 'v1.0.356',
        githubRepo: 'roflmuffin/CounterStrikeSharp',
        downloadUrl: 'https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v1.0.356/counterstrikesharp-with-runtime-linux-1.0.356.zip',
        assetNamePattern: 'counterstrikesharp-with-runtime-linux-{version_clean}.zip',
        category: 'core' as const,
        description: 'C# scripting platform for CS2'
    },
    // MetaMod Plugins
    cs2fixes: {
        name: 'CS2Fixes',
        currentVersion: 'v1.17',
        githubRepo: 'Source2ZE/CS2Fixes',
        downloadUrl: 'https://github.com/Source2ZE/CS2Fixes/releases/download/v1.17/CS2Fixes-v1.17-linux.tar.gz',
        category: 'metamod' as const,
        description: 'Essential fixes and performance improvements',
        folderName: 'cs2fixes'
    },
    playerfix: {
        name: 'ServerListPlayersFix',
        currentVersion: 'v1.0.5',
        githubRepo: 'Source2ZE/ServerListPlayersFix',
        downloadUrl: 'https://github.com/Source2ZE/ServerListPlayersFix/releases/latest/download/ServerListPlayersFix-v1.0.5-linux.tar.gz',
        category: 'metamod' as const,
        description: 'Fixes players count in server browser',
        folderName: 'serverlistplayersfix_mm'
    },
    movelock: {
        name: 'MovementUnlocker',
        currentVersion: 'v1.9',
        githubRepo: 'Source2ZE/MovementUnlocker',
        downloadUrl: 'https://github.com/Source2ZE/MovementUnlocker/releases/latest/download/MovementUnlocker-v1.9-linux.tar.gz',
        category: 'metamod' as const,
        description: 'Removes max speed limitation (BHOP/Surf)',
        folderName: 'MovementUnlocker'
    },
    addonmanager: {
        name: 'MultiAddonManager',
        currentVersion: 'v1.4.8',
        githubRepo: 'Source2ZE/MultiAddonManager',
        downloadUrl: 'https://github.com/Source2ZE/MultiAddonManager/releases/latest/download/MultiAddonManager-v1.4.8-linux.tar.gz',
        category: 'metamod' as const,
        description: 'Manage multiple workshop addons',
        folderName: 'multiaddonmanager'
    },
    accelerator: {
        name: 'AcceleratorCS2',
        currentVersion: 'v2.0.4',
        githubRepo: 'Source2ZE/AcceleratorCS2',
        downloadUrl: 'https://github.com/Source2ZE/AcceleratorCS2/releases/latest/download/addons.zip',
        category: 'metamod' as const,
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
        description: 'Comp/Match management plugin',
        folderName: 'MatchZy'
    },
    simpleadmin: {
        name: 'CS2-SimpleAdmin',
        currentVersion: '1.7.8-beta-8',
        githubRepo: 'daffyyyy/CS2-SimpleAdmin',
        downloadUrl: 'https://github.com/daffyyyy/CS2-SimpleAdmin/releases/latest/download/CS2-SimpleAdmin-1.7.8-beta-8.zip',
        category: 'cssharp' as const,
        description: 'User-friendly admin management system',
        folderName: 'CS2-SimpleAdmin'
    },
    weaponpaints: {
        name: 'WeaponPaints',
        currentVersion: 'latest',
        githubRepo: 'Nereziel/cs2-WeaponPaints',
        downloadUrl: 'https://github.com/Nereziel/cs2-WeaponPaints/releases/latest/download/WeaponPaints.zip',
        category: 'cssharp' as const,
        description: 'Skins, Gloves, and Agents changer',
        folderName: 'WeaponPaints'
    },
    retakes: {
        name: 'CS2-Retakes',
        currentVersion: '3.0.2',
        githubRepo: 'B3none/cs2-retakes',
        downloadUrl: 'https://github.com/B3none/cs2-retakes/releases/latest/download/RetakesPlugin-3.0.2.zip',
        category: 'cssharp' as const,
        description: 'Retake gamemode implementation',
        folderName: 'RetakesPlugin'
    },
    ranks: {
        name: 'CS2-Ranks',
        currentVersion: 'latest',
        githubRepo: 'partiusfabaa/cs2-ranks',
        downloadUrl: 'https://github.com/partiusfabaa/cs2-ranks/releases/latest/download/Ranks.zip',
        category: 'cssharp' as const,
        description: 'XP and Rank system (Global Elite)',
        folderName: 'CS2-Ranks'
    },
    rtv: {
        name: 'RockTheVote',
        currentVersion: 'v1.9.6',
        githubRepo: 'Oz-Lin/cs2-rockthevote',
        downloadUrl: 'https://github.com/Oz-Lin/cs2-rockthevote/releases/latest/download/RockTheVote-v1.9.6.RELEASE.zip',
        category: 'cssharp' as const,
        description: 'Map voting and management system',
        folderName: 'RockTheVote'
    },
    essentials: {
        name: 'CS2-Essentials',
        currentVersion: '1.3.0',
        githubRepo: 'HvH-gg/CS2-Essentials',
        downloadUrl: 'https://github.com/HvH-gg/CS2-Essentials/releases/latest/download/CS2-Essentials-1.3.0-6eaaeb7.zip',
        category: 'cssharp' as const,
        description: 'Basic commands and exploit fixes',
        folderName: 'CS2-Essentials'
    }
} as const;

export type PluginId = keyof typeof pluginRegistry;
