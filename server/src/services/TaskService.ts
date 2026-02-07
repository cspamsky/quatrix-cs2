import { EventEmitter } from 'events';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  message: string;
  metadata?: Record<string, unknown> | undefined;
  error?: string;
  startTime: number;
}

export class TaskService extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private io: { emit: (event: string, data: unknown) => void } | null = null;

  setSocketIO(io: { emit: (event: string, data: unknown) => void }) {
    this.io = io;
  }

  createTask(id: string, type: string, metadata?: Record<string, unknown>): Task {
    const task: Task = {
      id,
      type,
      status: 'pending',
      progress: 0,
      message: 'Initializing...',
      metadata,
      startTime: Date.now(),
    };
    this.tasks.set(id, task);
    this.emit('task_created', task);
    this.broadcast('task_started', task);
    return task;
  }

  updateTask(id: string, update: Partial<Omit<Task, 'id' | 'startTime'>>) {
    const task = this.tasks.get(id);
    if (!task) return;

    Object.assign(task, update);
    this.emit('task_updated', task);
    this.broadcast('task_progress', task);
  }

  completeTask(id: string, message: string = 'Completed successfully') {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = 'completed';
    task.progress = 100;
    task.message = message;
    this.emit('task_completed', task);
    this.broadcast('task_completed', task);

    // Optional: Auto-remove completed tasks after some time
    setTimeout(() => this.tasks.delete(id), 10000);
  }

  failTask(id: string, error: string) {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = 'failed';
    task.message = error;
    task.error = error;
    this.emit('task_failed', task);
    this.broadcast('task_failed', task);

    // Keep failed tasks around longer for user to see
    setTimeout(() => this.tasks.delete(id), 30000);
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  private broadcast(event: string, data: unknown) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}

export const taskService = new TaskService();
