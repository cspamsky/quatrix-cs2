import { io } from 'socket.io-client';

// Use current origin, Vite proxy will handle redirection to http://localhost:3001
const socket = io();


export default socket;
