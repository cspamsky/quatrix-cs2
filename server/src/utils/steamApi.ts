interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
}

/**
 * Fetches player avatar using Steam Web API
 * @param steamId64 - Steam64 ID (17 digits)
 * @returns Avatar URL or null
 */
export async function getPlayerAvatar(steamId64: string): Promise<string | null> {
  try {
    // Get Steam API key from .env file
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
 * Fetches avatars in bulk for multiple Steam IDs
 * @param steamIds - Array of Steam64 IDs
 * @returns Map of SteamID -> Avatar URL
 */
export function steam3To64(steam3: string): string {
  if (!steam3 || !steam3.startsWith('[U:1:')) return steam3;
  try {
    const parts = steam3.split(':');
    if (parts.length < 3) return steam3;
    // Use regex to replace all closing brackets globally
    const accountId = parts[2]?.replace(/]/g, '');
    if (!accountId) return steam3;
    // SteamID64 conversion: 76561197960265728 + AccountID
    return (BigInt('76561197960265728') + BigInt(accountId)).toString();
  } catch {
    return steam3;
  }
}

export async function getPlayerAvatars(steamIds: string[]): Promise<Map<string, string>> {
  const avatarMap = new Map<string, string>();

  // Let's create a mapping of RequestID to SearchID
  const searchMap = new Map<string, string>();
  const idsToQuery = new Set<string>();

  steamIds.forEach((id) => {
    const steam64 = steam3To64(id);
    if (steam64 && steam64 !== '0') {
      searchMap.set(id, steam64);
      idsToQuery.add(steam64);
    }
  });

  const uniqueIds = Array.from(idsToQuery);
  if (uniqueIds.length === 0) return avatarMap;

  try {
    // Get Steam API key from .env file
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
      console.warn('[Steam API] No API key configured in .env file');
      console.warn('[Steam API] Please add STEAM_API_KEY to your .env file');
      return avatarMap;
    }

    console.log(`[Steam API] Fetching avatars for ${uniqueIds.length} players`);

    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 100) {
      chunks.push(uniqueIds.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${chunk.join(',')}`;

      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        const players = data.response?.players as SteamPlayerSummary[];

        if (players) {
          players.forEach((player) => {
            const avatarUrl = player.avatarfull || player.avatarmedium || player.avatar;
            if (avatarUrl) {
              // Map back to ALL original IDs that resolved to this Steam64
              for (const [originalId, searchId] of searchMap.entries()) {
                if (searchId === player.steamid) {
                  avatarMap.set(originalId, avatarUrl);
                }
              }
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('[Steam API] Error fetching avatars:', error);
  }

  return avatarMap;
}
