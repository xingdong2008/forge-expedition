import type { StorageAdapter } from './types';

const KEY = 'forge-expedition-save-v1';

export class BrowserStorage implements StorageAdapter {
  load(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  save(value: string): void {
    try { localStorage.setItem(KEY, value); } catch { /* Private browsing may reject writes. */ }
  }
}

export class DouyinStorage implements StorageAdapter {
  load(): string | null {
    try { return tt.getStorageSync(KEY) || null; } catch { return null; }
  }

  save(value: string): void {
    try { tt.setStorageSync(KEY, value); } catch { /* Storage may be temporarily unavailable. */ }
  }
}

declare const tt: {
  getStorageSync(key: string): string;
  setStorageSync(key: string, value: string): void;
};

export function createPlatformStorage(): StorageAdapter {
  return typeof tt !== 'undefined' ? new DouyinStorage() : new BrowserStorage();
}

export class MemoryStorage implements StorageAdapter {
  value: string | null = null;
  load(): string | null { return this.value; }
  save(value: string): void { this.value = value; }
}
