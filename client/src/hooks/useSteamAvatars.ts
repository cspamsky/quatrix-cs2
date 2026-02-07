import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';

/**
 * Fetches avatars for a list of SteamIDs.
 * Uses React Query for caching.
 */
export const useSteamAvatars = (steamIds: string[]) => {
  // Filter out invalid or console IDs
  const validIds = steamIds.filter(id => id && id !== '0' && id.length > 5);
  // Create a unique key based on sorted IDs to prevent redundant fetches
  const queryKey = ['steamAvatars', validIds.sort().join(',')];

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (validIds.length === 0) return {};
      
      const searchParams = new URLSearchParams();
      searchParams.append('steamIds', validIds.join(','));
      
      const res = await apiFetch(`/api/steam/avatars?${searchParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch avatars');
      return res.json() as Promise<Record<string, string>>;
    },
    enabled: validIds.length > 0,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });
};
