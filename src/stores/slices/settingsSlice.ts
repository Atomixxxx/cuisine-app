import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import { fetchRemoteSettings, upsertRemoteSettings } from '../../services/cloudSync';
import type { AppState } from '../appStore';
import { runCloudRead, runCloudTask } from './cloudUtils';

type SettingsSlice = Pick<
  AppState,
  'settings' | 'darkMode' | 'activeTab' | 'loadSettings' | 'updateSettings' | 'setDarkMode' | 'setActiveTab'
>;

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
  settings: null,
  darkMode: true,
  activeTab: 'temperature',

  loadSettings: async () => {
    let settings = await db.settings.get('default');

    const remoteSettings = await runCloudRead('settings:list', fetchRemoteSettings);
    if (remoteSettings && remoteSettings.length > 0) {
      settings = remoteSettings.find((entry) => entry.id === 'default') ?? remoteSettings[0];
      await db.settings.clear();
      await db.settings.bulkPut(remoteSettings);
    } else if (remoteSettings && settings) {
      const localSettings = settings;
      await runCloudTask('settings:seed', async () => {
        await upsertRemoteSettings(localSettings);
      });
    }

    if (settings) {
      set({ settings, darkMode: settings.darkMode });
      if (settings.darkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return;
    }

    document.documentElement.classList.add('dark');
  },

  updateSettings: async (partial) => {
    const current = await db.settings.get('default');
    if (!current) return;

    const updated = { ...current, ...partial };
    await db.settings.put(updated);
    await runCloudTask('settings:upsert', async () => {
      await upsertRemoteSettings(updated);
    });

    set({ settings: updated });
    if (partial.darkMode !== undefined) {
      set({ darkMode: partial.darkMode });
      if (partial.darkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  },

  setDarkMode: (v) => {
    if (v) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set((state) => ({
      darkMode: v,
      settings: state.settings ? { ...state.settings, darkMode: v } : state.settings,
    }));
    void db.settings.update('default', { darkMode: v });
    void runCloudTask('settings:darkMode', async () => {
      const current = await db.settings.get('default');
      if (current) await upsertRemoteSettings({ ...current, darkMode: v });
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
});
