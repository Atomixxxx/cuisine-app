import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import {
  deleteRemoteTask,
  fetchRemoteTasks,
  upsertRemoteTask,
} from '../../services/cloudSync';
import { sanitize } from '../../utils';
import type { AppState } from '../appStore';
import { runCloudRead, runCloudTask } from './cloudUtils';

type TaskSlice = Pick<
  AppState,
  'getTasks' | 'addTask' | 'updateTask' | 'deleteTask' | 'processRecurringTasks'
>;

export const createTaskSlice: StateCreator<AppState, [], [], TaskSlice> = () => ({
  getTasks: async (includeArchived = false) => {
    const remoteTasks = await runCloudRead('tasks:list', fetchRemoteTasks);
    if (remoteTasks) {
      if (remoteTasks.length > 0) {
        await db.tasks.clear();
        await db.tasks.bulkPut(remoteTasks);
      } else {
        const localTasks = await db.tasks.orderBy('order').toArray();
        if (localTasks.length > 0) {
          await runCloudTask('tasks:seed', async () => {
            for (const item of localTasks) await upsertRemoteTask(item);
          });
          if (includeArchived) return localTasks;
          return localTasks.filter((item) => !item.archived);
        }
      }
      if (includeArchived) return remoteTasks;
      return remoteTasks.filter((item) => !item.archived);
    }

    const localTasks = await db.tasks.orderBy('order').toArray();
    if (includeArchived) return localTasks;
    return localTasks.filter((item) => !item.archived);
  },

  addTask: async (task) => {
    const payload = {
      ...task,
      title: sanitize(task.title),
      notes: task.notes ? sanitize(task.notes) : undefined,
    };
    await db.tasks.add(payload);
    await runCloudTask('tasks:add', async () => {
      await upsertRemoteTask(payload);
    });
  },

  updateTask: async (task) => {
    const payload = {
      ...task,
      title: sanitize(task.title),
      notes: task.notes ? sanitize(task.notes) : undefined,
    };
    await db.tasks.put(payload);
    await runCloudTask('tasks:update', async () => {
      await upsertRemoteTask(payload);
    });
  },

  deleteTask: async (id) => {
    await db.tasks.delete(id);
    await runCloudTask('tasks:delete', async () => {
      await deleteRemoteTask(id);
    });
  },

  processRecurringTasks: async () => {
    const all = await db.tasks.toArray();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const task of all) {
      if (!task.recurring || !task.completed || !task.archived || !task.completedAt) continue;

      const completedAt = new Date(task.completedAt);
      const completedDate = new Date(completedAt.getFullYear(), completedAt.getMonth(), completedAt.getDate());
      const daysSinceCompleted = Math.round(
        (startOfToday.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const shouldRecreate =
        (task.recurring === 'daily' && daysSinceCompleted >= 1) ||
        (task.recurring === 'weekly' && daysSinceCompleted >= 7);

      if (!shouldRecreate) continue;

      const existingActive = all.find(
        (item) =>
          item.title === task.title &&
          item.category === task.category &&
          !item.archived &&
          !item.completed,
      );
      if (existingActive) continue;

      const count = await db.tasks.count();
      const recreatedTask = {
        id: crypto.randomUUID(),
        title: sanitize(task.title),
        category: task.category,
        priority: task.priority,
        estimatedTime: task.estimatedTime,
        notes: task.notes ? sanitize(task.notes) : undefined,
        recurring: task.recurring,
        completed: false,
        archived: false,
        createdAt: now,
        order: count,
      };
      await db.tasks.add(recreatedTask);
      await runCloudTask('tasks:recurring-recreate', async () => {
        await upsertRemoteTask(recreatedTask);
      });
    }
  },
});
