import db from '../db.js';

export async function registerWorkshopMap(workshopId: string, discoveredMapFile?: string) {
  if (!workshopId || workshopId === '0') return null;

  try {
    // Fetch details from Steam Web API
    let name = `Workshop Map ${workshopId}`;
    let image_url: string | null = null;
    let map_file: string | null = discoveredMapFile || null;

    try {
      const apiKey = process.env.STEAM_API_KEY;
      const url = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';

      const params = new URLSearchParams();
      params.append('itemcount', '1');
      params.append('publishedfileids[0]', workshopId);
      if (apiKey) params.append('key', apiKey);

      const steamResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (steamResponse.ok) {
        const data = (await steamResponse.json()) as {
          response?: {
            publishedfiledetails?: Array<{
              result: number;
              title?: string;
              preview_url?: string;
              filename?: string;
            }>;
          };
        };
        const details = data?.response?.publishedfiledetails?.[0];

        if (details && details.result === 1) {
          name = details.title || name;
          image_url = (details.preview_url as string) || null;

          // Extract map filename from Steam data if not provided
          if (!map_file) {
            const steamFilename = (details.filename as string) || null;
            if (steamFilename && (steamFilename.includes('/') || steamFilename.includes('\\'))) {
              const parts = steamFilename.split(/[/\\]/);
              const lastPart = parts.pop();
              if (lastPart) {
                map_file = lastPart.replace('.vpk', '').replace('.bsp', '');
              }
            } else if (steamFilename) {
              map_file = steamFilename.replace('.vpk', '').replace('.bsp', '');
            }
          }
        }
      }
    } catch (steamErr) {
      console.warn(
        `[WORKSHOP] Failed to fetch Steam workshop details for ${workshopId}:`,
        steamErr
      );
    }

    db.prepare(
      `
            INSERT INTO workshop_maps (workshop_id, name, image_url, map_file)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(workshop_id) DO UPDATE SET
                name = excluded.name,
                image_url = excluded.image_url,
                map_file = COALESCE(excluded.map_file, workshop_maps.map_file)
        `
    ).run(workshopId, name, image_url, map_file);

    return { name, image_url, map_file };
  } catch (error) {
    console.error(`[WORKSHOP] Add workshop map error for ${workshopId}:`, error);
    return null;
  }
}
