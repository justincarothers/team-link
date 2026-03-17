interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id: string;
}

interface Window {
  electronAPI: {
    getSources: () => Promise<DesktopSource[]>;
  };
}
