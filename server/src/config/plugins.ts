
export const pluginRegistry = {
    metamod: {
        name: 'Metamod:Source',
        currentVersion: '2.0-git1380',
        githubRepo: null,
        downloadUrl: 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git1380-linux.tar.gz',
        category: 'core'
    },
    cssharp: {
        name: 'CounterStrikeSharp',
        currentVersion: 'v1.0.355',
        githubRepo: 'roflmuffin/CounterStrikeSharp',
        assetNamePattern: 'counterstrikesharp-with-runtime-linux-{version_clean}.tar.gz',
        category: 'core'
    },
    // MetaMod Plugins
    cs2fixes: {
        name: 'CS2Fixes',
        githubRepo: 'Source2ZE/CS2Fixes',
        category: 'metamod',
        description: 'Tons of fixes and features for CS2'
    },
    playerfix: {
        name: 'ServerListPlayersFix',
        githubRepo: 'Source2ZE/ServerListPlayersFix',
        category: 'metamod',
        description: 'Fixes players not showing up in server browser'
    },
    movelock: {
        name: 'MovementUnlocker',
        githubRepo: 'Source2ZE/MovementUnlocker',
        category: 'metamod',
        description: 'Removes max speed limitation (BHOP/Surf)'
    },
    addonmanager: {
        name: 'MultiAddonManager',
        githubRepo: 'Source2ZE/MultiAddonManager',
        category: 'metamod',
        description: 'Manage multiple workshop addons'
    },
    accelerator: {
        name: 'AcceleratorCS2',
        githubRepo: 'Source2ZE/AcceleratorCS2',
        category: 'metamod',
        description: 'Generate crash dumps on server crash'
    },
    // CS# Plugins
    matchzy: {
        name: 'MatchZy',
        githubRepo: 'shobhit-pathak/MatchZy',
        category: 'cssharp',
        description: 'Practice/Pugs/Scrims/Matches management'
    },
    simpleadmin: {
        name: 'CS2-SimpleAdmin',
        githubRepo: 'daffyyyy/CS2-SimpleAdmin',
        category: 'cssharp',
        description: 'Advanced admin and player management'
    },
    weaponpaints: {
        name: 'WeaponPaints',
        githubRepo: 'Nereziel/cs2-WeaponPaints',
        category: 'cssharp',
        description: 'Skins, Gloves, Agents changer'
    },
    retakes: {
        name: 'CS2-Retakes',
        githubRepo: 'B3none/cs2-retakes',
        category: 'cssharp',
        description: 'Retake gamemode implementation'
    },
    ranks: {
        name: 'CS2-Ranks',
        githubRepo: 'partiusfabaa/cs2-ranks',
        category: 'cssharp',
        description: 'XP and Rank system (Global Elite)'
    },
    rtv: {
        name: 'RockTheVote',
        githubRepo: 'Oz-Lin/cs2-rockthevote',
        category: 'cssharp',
        description: 'Map voting and management system'
    },
    essentials: {
        name: 'CS2-Essentials',
        githubRepo: 'HvH-gg/CS2-Essentials',
        category: 'cssharp',
        description: 'Basic commands and exploit fixes'
    }
};

export type PluginId = keyof typeof pluginRegistry;
