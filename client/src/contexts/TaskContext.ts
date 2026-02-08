import { createContext } from 'react';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  message: string;
  metadata?: unknown;
  error?: string;
  startTime: number;
}

export interface TaskContextType {
  tasks: Task[];
}

export const TaskContext = createContext<TaskContextType | undefined>(undefined);
