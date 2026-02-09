import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import {
  deleteRemoteEquipment,
  deleteRemoteOilChangeRecord,
  fetchRemoteEquipment,
  fetchRemoteOilChangeRecords,
  fetchRemoteTemperatureRecords,
  upsertRemoteEquipment,
  upsertRemoteOilChangeRecord,
  upsertRemoteTemperatureRecord,
} from '../../services/cloudSync';
import type { AppState } from '../appStore';
import { runCloudRead, runCloudTask } from './cloudUtils';
import { sanitize } from '../../utils';

type TemperatureSlice = Pick<
  AppState,
  | 'equipment'
  | 'loadEquipment'
  | 'addEquipment'
  | 'updateEquipment'
  | 'deleteEquipment'
  | 'addTemperatureRecord'
  | 'getTemperatureRecords'
  | 'addOilChangeRecord'
  | 'removeOilChangeRecord'
  | 'getOilChangeRecords'
>;

export const createTemperatureSlice: StateCreator<AppState, [], [], TemperatureSlice> = (set) => ({
  equipment: [],

  loadEquipment: async () => {
    const localList = await db.equipment.orderBy('order').toArray();
    const remoteList = await runCloudRead('equipment:list', fetchRemoteEquipment);

    if (remoteList && remoteList.length > 0) {
      await db.equipment.clear();
      await db.equipment.bulkPut(remoteList);
      set({ equipment: remoteList });
      return;
    }

    if (remoteList && localList.length > 0) {
      await runCloudTask('equipment:seed', async () => {
        for (const item of localList) await upsertRemoteEquipment(item);
      });
    }

    set({ equipment: localList });
  },

  addEquipment: async (equipment) => {
    const payload = { ...equipment, name: sanitize(equipment.name) };
    await db.equipment.add(payload);
    await runCloudTask('equipment:add', async () => {
      await upsertRemoteEquipment(payload);
    });
    set((state) => ({
      equipment: [...state.equipment, payload].sort((a, b) => a.order - b.order),
    }));
  },

  updateEquipment: async (equipment) => {
    const payload = { ...equipment, name: sanitize(equipment.name) };
    await db.equipment.put(payload);
    await runCloudTask('equipment:update', async () => {
      await upsertRemoteEquipment(payload);
    });
    set((state) => ({
      equipment: state.equipment
        .map((item) => (item.id === payload.id ? payload : item))
        .sort((a, b) => a.order - b.order),
    }));
  },

  deleteEquipment: async (id) => {
    await db.equipment.delete(id);
    await runCloudTask('equipment:delete', async () => {
      await deleteRemoteEquipment(id);
    });
    set((state) => ({
      equipment: state.equipment.filter((item) => item.id !== id),
    }));
  },

  addTemperatureRecord: async (record) => {
    await db.temperatureRecords.add(record);
    await runCloudTask('temperature:add', async () => {
      await upsertRemoteTemperatureRecord(record);
    });
  },

  getTemperatureRecords: async (startDate, endDate, equipmentId) => {
    const remoteRecords = await runCloudRead('temperature:list', async () =>
      fetchRemoteTemperatureRecords({ startDate, endDate, equipmentId }),
    );
    if (remoteRecords) {
      if (remoteRecords.length > 0) return remoteRecords;

      const localAll = await db.temperatureRecords.toArray();
      if (localAll.length > 0) {
        await runCloudTask('temperature:seed', async () => {
          for (const item of localAll) await upsertRemoteTemperatureRecord(item);
        });
      }
      return remoteRecords;
    }

    const hasDateFilter = Boolean(startDate || endDate);
    const minDate = startDate ?? new Date(0);
    const maxDate = endDate ?? new Date(8640000000000000);

    if (equipmentId && hasDateFilter) {
      return db.temperatureRecords
        .where('[equipmentId+timestamp]')
        .between([equipmentId, minDate], [equipmentId, maxDate], true, true)
        .reverse()
        .toArray();
    }

    if (hasDateFilter) {
      return db.temperatureRecords
        .where('timestamp')
        .between(minDate, maxDate, true, true)
        .reverse()
        .toArray();
    }

    if (equipmentId) {
      const records = await db.temperatureRecords.where('equipmentId').equals(equipmentId).toArray();
      return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return db.temperatureRecords.orderBy('timestamp').reverse().toArray();
  },

  addOilChangeRecord: async (record) => {
    await db.oilChangeRecords.add(record);
    await runCloudTask('oil-change:add', async () => {
      await upsertRemoteOilChangeRecord(record);
    });
  },

  removeOilChangeRecord: async (id) => {
    await db.oilChangeRecords.delete(id);
    await runCloudTask('oil-change:delete', async () => {
      await deleteRemoteOilChangeRecord(id);
    });
  },

  getOilChangeRecords: async (startDate, endDate, fryerId) => {
    const remoteRecords = await runCloudRead('oil-change:list', async () =>
      fetchRemoteOilChangeRecords({ startDate, endDate, fryerId }),
    );
    if (remoteRecords) {
      if (remoteRecords.length > 0) return remoteRecords;

      const localAll = await db.oilChangeRecords.toArray();
      if (localAll.length > 0) {
        await runCloudTask('oil-change:seed', async () => {
          for (const item of localAll) await upsertRemoteOilChangeRecord(item);
        });
      }
      return remoteRecords;
    }

    const hasDateFilter = Boolean(startDate || endDate);
    const minDate = startDate ?? new Date(0);
    const maxDate = endDate ?? new Date(8640000000000000);

    if (fryerId && hasDateFilter) {
      return db.oilChangeRecords
        .where('[fryerId+changedAt]')
        .between([fryerId, minDate], [fryerId, maxDate], true, true)
        .reverse()
        .toArray();
    }

    if (hasDateFilter) {
      return db.oilChangeRecords
        .where('changedAt')
        .between(minDate, maxDate, true, true)
        .reverse()
        .toArray();
    }

    if (fryerId) {
      const records = await db.oilChangeRecords.where('fryerId').equals(fryerId).toArray();
      return records.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
    }

    return db.oilChangeRecords.orderBy('changedAt').reverse().toArray();
  },
});
