interface SteamPlayerSummary {
    steamid: string;
    personaname: string;
    avatar: string;
    avatarmedium: string;
    avatarfull: string;
}

/**
 * Steam Web API kullanarak oyuncu avatar'ını çeker
 * @param steamId64 - Steam64 ID (17 haneli)
 * @returns Avatar URL veya null
 */
export async function getPlayerAvatar(steamId64: string): Promise<string | null> {
    try {
        // .env dosyasından Steam API key'i al
        const apiKey = process.env.STEAM_API_KEY;
        
        if (!apiKey) {
            console.warn('[Steam API] No API key configured');
            return null;
        }
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId64}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[Steam API] Failed to fetch avatar for ${steamId64}: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        const players = data.response?.players as SteamPlayerSummary[];
        
        if (players && players.length > 0) {
            const player = players[0];
            return player?.avatarfull || player?.avatarmedium || player?.avatar || null;
        }

        return null;
    } catch (error) {
        console.error('[Steam API] Error fetching avatar:', error);
        return null;
    }
}

/**
 * Birden fazla Steam ID için avatar'ları toplu olarak çeker
 * @param steamIds - Steam64 ID'leri dizisi
 * @returns SteamID -> Avatar URL map'i
 */
export async function getPlayerAvatars(steamIds: string[]): Promise<Map<string, string>> {
    const avatarMap = new Map<string, string>();
    
    if (steamIds.length === 0) return avatarMap;

    try {
        // .env dosyasından Steam API key'i al
        const apiKey = process.env.STEAM_API_KEY;
        
        if (!apiKey) {
            console.warn('[Steam API] No API key configured in .env file');
            console.warn('[Steam API] Please add STEAM_API_KEY to your .env file');
            console.warn('[Steam API] Get your key from: https://steamcommunity.com/dev/apikey');
            return avatarMap;
        }

        console.log(`[Steam API] API key found, fetching avatars for ${steamIds.length} players`);
        
        // Steam API maksimum 100 ID'yi aynı anda kabul eder
        const chunks = [];
        for (let i = 0; i < steamIds.length; i += 100) {
            chunks.push(steamIds.slice(i, i + 100));
        }

        for (const chunk of chunks) {
            const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${chunk.join(',')}`;
            
            console.log(`[Steam API] Fetching ${chunk.length} player summaries...`);
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                const players = data.response?.players as SteamPlayerSummary[];
                
                if (players) {
                    console.log(`[Steam API] Received ${players.length} player profiles`);
                    players.forEach(player => {
                        const avatarUrl = player.avatarfull || player.avatarmedium || player.avatar;
                        if (avatarUrl) {
                            avatarMap.set(player.steamid, avatarUrl);
                        }
                    });
                } else {
                    console.warn('[Steam API] No players data in response');
                }
            } else {
                console.error(`[Steam API] Request failed with status ${response.status}: ${response.statusText}`);
            }
        }
        
        console.log(`[Steam API] Total avatars fetched: ${avatarMap.size}`);
    } catch (error) {
        console.error('[Steam API] Error fetching avatars:', error);
    }

    return avatarMap;
}
