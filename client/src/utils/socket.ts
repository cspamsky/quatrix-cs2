import { io } from 'socket.io-client';
import { isDemoMode } from './api';

const SOCKET_URL = 'http://localhost:3001';

class MockSocket {
  private handlers: { [key: string]: Function[] } = {};
  public connected = true;

  on(event: string, fn: Function) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(fn);
  }

  off(event: string, fn?: Function) {
    if (!fn) {
      delete this.handlers[event];
    } else {
      this.handlers[event] = this.handlers[event]?.filter(h => h !== fn);
    }
  }

  emit(event: string, ...args: any[]) {
    console.log('🌟 Demo Socket Emit:', event, args);
  }

  // Simulate internal events
  _simulate(event: string, data: any) {
    this.handlers[event]?.forEach(fn => fn(data));
  }
}

let socket: any;

if (isDemoMode()) {
  socket = new MockSocket();
  
  // Simulate CPU/RAM fluctuations
  setInterval(() => {
    socket._simulate('stats', {
      cpu: (Math.random() * 15 + 5).toFixed(1),
      ram: (Math.random() * 10 + 20).toFixed(1),
      memUsed: (Math.random() * 2 + 4).toFixed(1),
      memTotal: '16.0',
      netIn: (Math.random() * 5).toFixed(2),
      netOut: (Math.random() * 3).toFixed(2)
    });
  }, 3000);

} else {
  socket = io(SOCKET_URL);
}

export default socket;
