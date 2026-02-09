export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');

  // Use a relative path, Vite proxy will handle redirection to http://localhost:3001
  const targetUrl = url;

  const headers = {
    ...options.headers,
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': options.body
      ? 'application/json'
      : (options.headers as Record<string, string> | undefined)?.['Content-Type'] || '',
  };

  try {
    const response = await fetch(targetUrl, { ...options, headers });

    const isLoginEndpoint = url.includes('/api/login');

    if ((response.status === 401 || response.status === 403) && !isLoginEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    return response;
  } catch (error) {
    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      console.error(
        '❌ Backend connection failed at',
        targetUrl,
        '. Please ensure the server is running on port 3001.'
      );
      throw error;
    }

    // Since demo mode is removed, we just rethrow the error
    console.error('❌ Connection failed for', targetUrl);
    throw error;
  }
};
