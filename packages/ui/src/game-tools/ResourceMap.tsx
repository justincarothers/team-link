import { type FC, useCallback, useEffect, useState, useRef } from 'react';
import { useYjs } from '../hooks/useYjs.js';
import type { GameToolPlugin } from './registry.js';

interface Marker {
  id: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  label: string;
  color: string;
}

const MARKER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];

interface ResourceMapProps {
  serverUrl: string;
  roomCode: string;
  toolId: string;
}

const ResourceMap: FC<ResourceMapProps> = ({ serverUrl, roomCode, toolId }) => {
  const { doc, synced } = useYjs({ serverUrl, roomCode, toolId });
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [selectedColor, setSelectedColor] = useState(MARKER_COLORS[0]);
  const [labelInput, setLabelInput] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  // Sync markers from Yjs
  useEffect(() => {
    if (!doc) return;

    const yMarkers = doc.getArray<Marker>('markers');

    const updateMarkers = () => {
      setMarkers(yMarkers.toArray());
    };

    yMarkers.observe(updateMarkers);
    updateMarkers();

    return () => {
      yMarkers.unobserve(updateMarkers);
    };
  }, [doc]);

  const addMarker = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!doc || !mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const marker: Marker = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x,
        y,
        label: labelInput || 'Pin',
        color: selectedColor,
      };

      doc.getArray<Marker>('markers').push([marker]);
    },
    [doc, selectedColor, labelInput],
  );

  const removeMarker = useCallback(
    (markerId: string) => {
      if (!doc) return;
      const yMarkers = doc.getArray<Marker>('markers');
      const arr = yMarkers.toArray();
      const idx = arr.findIndex((m) => m.id === markerId);
      if (idx !== -1) {
        yMarkers.delete(idx, 1);
      }
    },
    [doc],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, markerId: string) => {
      e.stopPropagation();
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      dragRef.current = {
        id: markerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragRef.current || !doc || !mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const yMarkers = doc.getArray<Marker>('markers');
      const arr = yMarkers.toArray();
      const idx = arr.findIndex((m) => m.id === dragRef.current!.id);
      if (idx !== -1) {
        doc.transact(() => {
          yMarkers.delete(idx, 1);
          yMarkers.insert(idx, [{ ...arr[idx], x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }]);
        });
      }
    },
    [doc],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!doc) {
    return <div className="text-gray-500">Connecting...</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Resource Map</h3>
        {!synced && <span className="text-xs text-yellow-400">Syncing...</span>}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="Marker label"
          className="rounded bg-gray-700 px-2 py-1 text-xs text-white placeholder:text-gray-500"
        />
        <div className="flex gap-1">
          {MARKER_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              className={`h-5 w-5 rounded-full border-2 ${
                selectedColor === color ? 'border-white' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Map area */}
      <div
        ref={mapRef}
        className="relative aspect-square w-full cursor-crosshair rounded-lg bg-gray-900 bg-[radial-gradient(circle,_rgba(255,255,255,0.05)_1px,_transparent_1px)] bg-[size:20px_20px]"
        onClick={addMarker}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {markers.map((marker) => (
          <div
            key={marker.id}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move flex-col items-center"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            onMouseDown={(e) => handleMouseDown(e, marker.id)}
          >
            <div
              className="h-4 w-4 rounded-full border-2 border-white shadow-lg"
              style={{ backgroundColor: marker.color }}
            />
            <span className="mt-0.5 whitespace-nowrap rounded bg-black/80 px-1 text-[10px] text-white">
              {marker.label}
            </span>
            <button
              className="absolute -right-3 -top-3 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white group-hover:flex"
              onClick={(e) => {
                e.stopPropagation();
                removeMarker(marker.id);
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-500">
        Click to place markers. Drag to move. Hover to reveal delete.
      </p>
    </div>
  );
};

export const resourceMapTool: GameToolPlugin = {
  id: 'resource-map',
  name: 'Map',
  games: [], // available for all games
  component: ResourceMap,
};
