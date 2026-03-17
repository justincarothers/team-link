import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id: string;
}

const electronAPI = {
  getSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke('get-sources'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
