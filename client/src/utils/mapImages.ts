// CS2 Map Images - Using official Steam CDN assets only
export const mapImages: Record<string, string> = {
  'de_dust2': '/images/maps/de_dust2.webp',
  'de_mirage': '/images/maps/de_mirage.webp',
  'de_inferno': '/images/maps/de_inferno.webp',
  'de_nuke': '/images/maps/de_nuke_cs2.webp',
  'de_ancient': '/images/maps/de_ancient.webp',
  'de_anubis': '/images/maps/de_anubis.webp',
  'de_vertigo': '/images/maps/de_vertigo.webp',
  'de_overpass': '/images/maps/de_overpass.webp',
  'de_train': '/images/maps/de_train.webp',
  'cs_italy': '/images/maps/de_italy.webp',
  'cs_office': '/images/maps/de_office.webp',
  // Default fallback - Official CS2 key art/background from Steam
  'default': 'https://clan.cloudflare.steamstatic.com/images/42564148/804618e4bc392945d94726bf6fb9a5c8e14620f3.png'
}

export const getMapImage = (mapName: string): string => {
  if (!mapName) return mapImages['default'];

  // Clean the map name (extract filename from potential paths like workshop/123/de_dust2)
  const parts = mapName.split(/[/\\]/);
  let actualMapName = parts.pop() || mapName;
  
  // Handle case where it might end with .vpk or .bsp (sometimes seen in RCON)
  actualMapName = actualMapName.replace(/\.(vpk|bsp)$/i, '');
  
  const lowerMap = actualMapName.toLowerCase();

  // 1. Check if exact match exists for the cleaned name
  if (mapImages[actualMapName]) return mapImages[actualMapName];
  if (mapImages[lowerMap]) return mapImages[lowerMap];
  
  // 2. Workshop Check (If it has a workshop path or looks like an ID)
  const isWorkshop = mapName.includes('workshop') || /^\d{8,}$/.test(actualMapName);
  if (isWorkshop) {
     // If it's a workshop map but we don't have the API image yet, 
     // we return the default Steam icon
     return mapImages['default'];
  }
  
  // Final fallback (Official asset)
  return mapImages['default'];
}
