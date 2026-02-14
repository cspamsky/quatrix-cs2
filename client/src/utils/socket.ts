import { io } from 'socket.io-client';

// Use current origin, Vite proxy will handle redirection to http://localhost:3001
const socket = io({
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  autoConnect: true,
  transports: ['polling', 'websocket'],
  secure: true, // Force over SSL (wss)
  rejectUnauthorized: false, // Don't disconnect if there are certificate issues
});

export default socket;
