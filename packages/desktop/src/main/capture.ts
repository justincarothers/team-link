import { desktopCapturer, screen } from 'electron';

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id: string;
  isScreen: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export async function getCaptureSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });

  const displays = screen.getAllDisplays();

  return sources.map((source) => {
    const display = displays.find((d) => String(d.id) === source.display_id);
    return {
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      display_id: source.display_id,
      isScreen: source.id.startsWith('screen:'),
      bounds: display?.bounds,
    };
  });
}

export function getMonitorCount(): number {
  return screen.getAllDisplays().length;
}
