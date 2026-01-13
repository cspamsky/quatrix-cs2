export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // Resolve absolute URL for localhost if relative path is provided
  const targetUrl = isLocalhost && !url.startsWith('http')
    ? `http://127.0.0.1:3001${url}`
    : url;

  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': options.body ? 'application/json' : (options.headers as any)?.['Content-Type'] || '',
  };

  try {
    const response = await fetch(targetUrl, { ...options, headers });
    
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    
    return response;
  } catch (error) {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      console.error('❌ Backend connection failed at', targetUrl, '. Please ensure the server is running on port 3001.');
      throw error;
    }

    // Since demo mode is removed, we just rethrow the error
    console.error('❌ Connection failed for', targetUrl);
    throw error;
  }
};
