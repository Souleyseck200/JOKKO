// mobile/src/store/serverStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const STORAGE_KEY_SERVER = 'jokko_server_url';
const DEFAULT_URL = 'http://192.168.1.10:3000';

interface ServerState {
  serverUrl: string;
  isConfigured: boolean;
  isLoading: boolean;
  error: string | null;
  loadServerUrl: () => Promise<string | null>;
  setServerUrl: (url: string) => Promise<boolean>;
  clearServerUrl: () => Promise<void>;
}

export const useServerStore = create<ServerState>((set, get) => ({
  serverUrl: DEFAULT_URL,
  isConfigured: false,
  isLoading: true,
  error: null,

  loadServerUrl: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SERVER);
      if (stored) {
        api.setBaseUrl(stored);
        set({ serverUrl: stored, isConfigured: true, isLoading: false });
        return stored;
      }
    } catch {}
    set({ isLoading: false });
    return null;
  },

  setServerUrl: async (url: string) => {
    set({ isLoading: true, error: null });
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }

    try {
      await api.checkHealth(cleanUrl);
      await AsyncStorage.setItem(STORAGE_KEY_SERVER, cleanUrl);
      api.setBaseUrl(cleanUrl);
      set({ serverUrl: cleanUrl, isConfigured: true, isLoading: false, error: null });
      return true;
    } catch (err: any) {
      set({ isLoading: false, error: err.message || 'Serveur introuvable' });
      return false;
    }
  },

  clearServerUrl: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY_SERVER);
    set({ serverUrl: DEFAULT_URL, isConfigured: false });
  },
}));
