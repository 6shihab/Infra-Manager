export {};

declare global {
  interface Window {
    electronAPI?: {
      getApiUrl: () => Promise<string>;
      setApiUrl: (url: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      showNativeNotification: (title: string, body: string) => void;
    };
  }
}
