import { io } from 'socket.io-client';

// Use current origin, Vite proxy will handle redirection to http://localhost:3001
const socket = io({
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  autoConnect: true,
  transports: ['polling', 'websocket'],
  secure: true, // SSL üzerinden (wss) zorla
  rejectUnauthorized: false, // Sertifika sorunları varsa bağlantıyı kesme
});

export default socket;
