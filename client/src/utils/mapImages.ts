// CS2 Map Images - Using official Steam CDN assets for an authentic look
export const mapImages: Record<string, string> = {
  'de_dust2': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_dust2_png.png',
  'de_mirage': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_mirage_png.png',
  'de_inferno': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_inferno_png.png',
  'de_nuke': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_nuke_png.png',
  'de_ancient': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_ancient_png.png',
  'de_anubis': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_anubis_png.png',
  'de_vertigo': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_vertigo_png.png',
  'de_overpass': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_overpass_png.png',
  'de_train': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_train_png.png',
  'de_cache': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_cache_png.png',
  'de_cbble': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_de_cbble_png.png',
  'cs_italy': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_cs_italy_png.png',
  'cs_office': 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/map_icons/map_cs_office_png.png',
  // Default fallback
  'default': 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800'
}

export const getMapImage = (mapName: string): string => {
  // If it's a workshop map (has ID in name) but doesn't have an image from API yet
  const workshopMatch = mapName.match(/workshop\/(\d+)/) || mapName.match(/(\d{8,})/);
  if (workshopMatch && workshopMatch[1]) {
    // We can't easily get the image without API, but we can't do it synchronously here.
    // However, the ServerCard component handles instance.workshop_map_image separately.
    return mapImages['default'];
  }

  // Check if exact match exists
  if (mapImages[mapName]) return mapImages[mapName];
  
  // Smart fallbacks for custom maps based on prefix
  const lowerMap = mapName.toLowerCase();
  
  if (lowerMap.startsWith('awp_')) {
    return 'https://images.unsplash.com/photo-1595590424283-b8f17842773f?auto=format&fit=crop&q=80&w=800';
  } else if (lowerMap.startsWith('aim_')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800';
  } else if (lowerMap.startsWith('surf_')) {
    return 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=800';
  }
  
  // Final fallback
  return mapImages['default'];
}
