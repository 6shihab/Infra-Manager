export {};

declare global {
  interface Window {
    electronAPI?: {
      // Existing
      getApiUrl: () => Promise<string>;
      setApiUrl: (url: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      showNativeNotification: (title: string, body: string) => void;

      // Offline mode
      offlineRequest: (args: { method: string; endpoint: string; body?: any }) => Promise<{ data: any; status: number; headers?: Record<string, string> }>;
      getConnectivityStatus: () => Promise<{ isOnline: boolean }>;
      getSyncQueueCount: () => Promise<number>;
      triggerSync: () => Promise<void>;
      onConnectivityChange: (callback: (isOnline: boolean) => void) => () => void;
      onSyncComplete: (callback: () => void) => () => void;
      onSyncProgress: (callback: (progress: { synced: number; total: number }) => void) => () => void;
    };
  }
}
