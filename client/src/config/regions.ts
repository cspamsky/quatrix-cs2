export const SERVER_REGIONS = [
  { id: 0, name: 'US East', code: 'us-east' },
  { id: 1, name: 'US West', code: 'us-west' },
  { id: 2, name: 'South America', code: 'south-america' },
  { id: 3, name: 'Europe', code: 'europe' },
  { id: 4, name: 'Asia', code: 'asia' },
  { id: 5, name: 'Australia', code: 'australia' },
  { id: 6, name: 'Middle East', code: 'middle-east' },
  { id: 7, name: 'Africa', code: 'africa' },
  { id: 255, name: 'World', code: 'world' },
] as const;

export type ServerRegion = (typeof SERVER_REGIONS)[number];
