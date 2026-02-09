import { logger } from '../../services/logger';
import { isCloudSyncEnabled } from '../../services/cloudSync';

const CLOUD_SYNC_ENABLED = isCloudSyncEnabled();

function isCloudSyncActive(): boolean {
  return CLOUD_SYNC_ENABLED;
}

export async function runCloudTask(taskName: string, fn: () => Promise<void>): Promise<boolean> {
  if (!isCloudSyncActive()) return false;
  try {
    await fn();
    return true;
  } catch (error) {
    logger.warn(`cloud sync failed: ${taskName}`, { error });
    return false;
  }
}

export async function runCloudRead<T>(taskName: string, fn: () => Promise<T>): Promise<T | null> {
  if (!isCloudSyncActive()) return null;
  try {
    return await fn();
  } catch (error) {
    logger.warn(`cloud read failed: ${taskName}`, { error });
    return null;
  }
}
