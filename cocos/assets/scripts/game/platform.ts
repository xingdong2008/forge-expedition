import { createPlatformStorage } from './storage';
import type { StorageAdapter } from './types';

export type Session = { provider: 'guest' } | { provider: 'douyin'; authorizationCode: string };

export interface PlatformServices {
  storage: StorageAdapter;
  signIn(): Promise<Session>;
}

declare const tt: {
  login(options: { success(result: { code?: string }): void; fail(error: unknown): void }): void;
};

export function createPlatformServices(): PlatformServices {
  const storage = createPlatformStorage();
  if (typeof tt === 'undefined') {
    return { storage, async signIn() { return { provider: 'guest' }; } };
  }
  return {
    storage,
    signIn() {
      return new Promise<Session>((resolve, reject) => {
        tt.login({
          success(result) {
            if (result.code) resolve({ provider: 'douyin', authorizationCode: result.code });
            else reject(new Error('Douyin login returned no authorization code'));
          },
          fail: reject,
        });
      });
    },
  };
}
