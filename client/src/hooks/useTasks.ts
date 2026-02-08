import { useContext } from 'react';
import { TaskContext } from '../contexts/TaskContext.js';

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
