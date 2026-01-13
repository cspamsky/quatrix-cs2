import { io } from 'socket.io-client';

const SOCKET_URL = 'http://127.0.0.1:3001';

// We always use the real socket now that Demo Mode is removed.
const socket = io(SOCKET_URL);

export default socket;
