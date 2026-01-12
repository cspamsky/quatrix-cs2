import { MOCK_INSTANCES, MOCK_SYSTEM_INFO, MOCK_LOGS } from './demoData';

export const isDemoMode = () => {
  // Never demo on localhost unless explicitly forced
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return localStorage.getItem('demo_mode') === 'true';
  }

  // Auto-demo on Vercel/Netlify hostnames
  const isVercel = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('netlify.app');
  const forceDemo = localStorage.getItem('demo_mode') === 'true';
  
  return forceDemo || isVercel;
};

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  
  // Demo Mode logic: intercept calls to backend
  if (isDemoMode()) {
    console.log('🌟 Quatrix Demo Mode: Intercepting', url);
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate latency
    
    let mockData: any = {};
    if (url.includes('/api/servers')) mockData = MOCK_INSTANCES;
    if (url.includes('/api/system-info')) mockData = MOCK_SYSTEM_INFO;
    if (url.includes('/api/logs')) mockData = MOCK_LOGS;
    if (url.includes('/api/login')) mockData = { token: 'demo-token', user: { username: 'DemoUser' } };
    
    return {
      ok: true,
      status: 200,
      json: async () => mockData
    } as Response;
  }

  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': options.body ? 'application/json' : (options.headers as any)?.['Content-Type'] || '',
  };

  try {
    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    
    return response;
  } catch (error) {
    console.warn('Backend reach failed, switching to Demo Mode...');
    localStorage.setItem('demo_mode', 'true');
    window.location.reload();
    throw error;
  }
};
