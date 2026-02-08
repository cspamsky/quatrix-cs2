import React, { createContext, useEffect, useState } from 'react';
import socket from '../utils/socket';

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

interface TaskContextType {
  tasks: Task[];
}

export const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const useTasks = () => {
  const context = React.useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    // Initial tasks on connection
    socket.on('active_tasks', (initialTasks: Task[]) => {
      setTasks(initialTasks);
    });

    socket.on('task_started', (task: Task) => {
      setTasks((prev) => [...prev.filter((t) => t.id !== task.id), task]);
    });

    socket.on('task_progress', (updatedTask: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    });

    socket.on('task_completed', (task: Task) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...task, status: 'completed', progress: 100 } : t))
      );
      // Remove completed task after 5 seconds to let user see "Finished"
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      }, 5000);
    });

    socket.on('task_failed', (task: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...task, status: 'failed' } : t)));
      // Keep failed tasks longer (15s) for user to read error
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      }, 15000);
    });

    return () => {
      socket.off('active_tasks');
      socket.off('task_started');
      socket.off('task_progress');
      socket.off('task_completed');
      socket.off('task_failed');
    };
  }, []);

  return <TaskContext.Provider value={{ tasks }}>{children}</TaskContext.Provider>;
};
