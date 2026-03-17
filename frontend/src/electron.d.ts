export {};

declare global {
  interface Window {
    electronAPI?: {
      // Existing
      getApiUrl: () => Promise<string>;
      setApiUrl: (url: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      isWebAuthnDegraded: () => Promise<boolean>;
      showNativeNotification: (title: string, body: string) => void;

      // Offline mode
      offlineRequest: (args: { method: string; endpoint: string; body?: any }) => Promise<{ data: any; status: number; headers?: Record<string, string> }>;
      getConnectivityStatus: () => Promise<{ isOnline: boolean }>;
      getSyncQueueCount: () => Promise<number>;
      triggerSync: () => Promise<void>;
      onConnectivityChange: (callback: (isOnline: boolean) => void) => () => void;
      onSyncComplete: (callback: () => void) => () => void;
      onSyncProgress: (callback: (progress: { synced: number; total: number }) => void) => () => void;

      // Session & sync log
      cacheSession: (token: string, user: { id: string; email: string; full_name: string; is_superuser: boolean; totp_enabled: boolean }) => Promise<any>;
      getSyncLogs: (limit?: number) => Promise<Array<{ id: number; timestamp: string; level: string; message: string }>>;
      clearSyncLogs: () => Promise<void>;
    };
  }
}
