import { type FC, useCallback, useEffect, useRef, useState } from 'react';
import { useYjs } from '../hooks/useYjs.js';
import type { GameToolPlugin } from './registry.js';

interface Point {
  x: number; // 0-100 percentage
  y: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: 'pen' | 'line' | 'arrow';
}

const DRAW_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ffffff'];
const LINE_WIDTHS = [2, 4, 8];
const TOOLS: { id: Stroke['tool']; label: string }[] = [
  { id: 'pen', label: 'Draw' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
];

interface StratDrawProps {
  serverUrl: string;
  roomCode: string;
  toolId: string;
}

const StratDraw: FC<StratDrawProps> = ({ serverUrl, roomCode, toolId }) => {
  const { doc, synced } = useYjs({ serverUrl, roomCode, toolId });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [selectedColor, setSelectedColor] = useState(DRAW_COLORS[0]);
  const [selectedWidth, setSelectedWidth] = useState(LINE_WIDTHS[1]);
  const [selectedTool, setSelectedTool] = useState<Stroke['tool']>('pen');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<{ active: boolean; points: Point[]; startPoint: Point | null }>({
    active: false,
    points: [],
    startPoint: null,
  });

  // Sync strokes from Yjs
  useEffect(() => {
    if (!doc) return;
    const yStrokes = doc.getArray<Stroke>('strokes');

    const update = () => setStrokes(yStrokes.toArray());
    yStrokes.observe(update);
    update();

    return () => yStrokes.unobserve(update);
  }, [doc]);

  // Render strokes to canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const w = rect.width;
    const h = rect.height;

    const drawStroke = (stroke: Stroke) => {
      if (stroke.points.length < 2) return;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'pen') {
        ctx.beginPath();
        ctx.moveTo((stroke.points[0].x / 100) * w, (stroke.points[0].y / 100) * h);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo((stroke.points[i].x / 100) * w, (stroke.points[i].y / 100) * h);
        }
        ctx.stroke();
      } else {
        // line or arrow: first point to last point
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        const sx = (start.x / 100) * w;
        const sy = (start.y / 100) * h;
        const ex = (end.x / 100) * w;
        const ey = (end.y / 100) * h;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        if (stroke.tool === 'arrow') {
          const angle = Math.atan2(ey - sy, ex - sx);
          const headLen = Math.max(10, stroke.width * 3);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
    };

    strokes.forEach(drawStroke);

    // Draw in-progress stroke
    const d = drawingRef.current;
    if (d.active && d.points.length >= 2) {
      drawStroke({
        id: 'preview',
        points: d.points,
        color: selectedColor,
        width: selectedWidth,
        tool: selectedTool,
      });
    }
  }, [strokes, selectedColor, selectedWidth, selectedTool]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => renderCanvas());
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [renderCanvas]);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    drawingRef.current = { active: true, points: [pos], startPoint: pos };
  }, [getPos]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    if (!d.active) return;
    const pos = getPos(e);

    if (selectedTool === 'pen') {
      d.points.push(pos);
    } else {
      // For line/arrow, keep start + current end
      d.points = [d.startPoint!, pos];
    }
    renderCanvas();
  }, [getPos, selectedTool, renderCanvas]);

  const onMouseUp = useCallback(() => {
    const d = drawingRef.current;
    if (!d.active || !doc) return;

    if (d.points.length >= 2) {
      const stroke: Stroke = {
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        points: [...d.points],
        color: selectedColor,
        width: selectedWidth,
        tool: selectedTool,
      };
      doc.getArray<Stroke>('strokes').push([stroke]);
    }

    drawingRef.current = { active: false, points: [], startPoint: null };
  }, [doc, selectedColor, selectedWidth, selectedTool]);

  const clearAll = useCallback(() => {
    if (!doc) return;
    const yStrokes = doc.getArray<Stroke>('strokes');
    doc.transact(() => {
      yStrokes.delete(0, yStrokes.length);
    });
  }, [doc]);

  const undoLast = useCallback(() => {
    if (!doc) return;
    const yStrokes = doc.getArray<Stroke>('strokes');
    if (yStrokes.length > 0) {
      yStrokes.delete(yStrokes.length - 1, 1);
    }
  }, [doc]);

  if (!doc) {
    return <div className="text-gray-500">Connecting...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Strategy Draw</h3>
        <div className="flex items-center gap-2">
          {!synced && <span className="text-xs text-yellow-400">Syncing...</span>}
          <button
            onClick={undoLast}
            className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
          >
            Undo
          </button>
          <button
            onClick={clearAll}
            className="rounded bg-gray-700 px-2 py-0.5 text-xs text-red-400 hover:bg-gray-600"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Tool selector */}
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTool(t.id)}
            className={`rounded px-2 py-0.5 text-xs ${
              selectedTool === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-gray-600" />
        {/* Line width */}
        {LINE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setSelectedWidth(w)}
            className={`flex h-6 w-6 items-center justify-center rounded ${
              selectedWidth === w
                ? 'bg-blue-600'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <div
              className="rounded-full bg-white"
              style={{ width: w + 2, height: w + 2 }}
            />
          </button>
        ))}
      </div>

      {/* Color picker */}
      <div className="flex gap-1">
        {DRAW_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setSelectedColor(color)}
            className={`h-5 w-5 rounded-full border-2 ${
              selectedColor === color ? 'border-blue-400' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-900">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>

      <p className="text-[10px] text-gray-500">
        Draw strats with your team. All strokes sync in real-time.
      </p>
    </div>
  );
};

export const stratDrawTool: GameToolPlugin = {
  id: 'strat-draw',
  name: 'Strats',
  games: [],
  component: StratDraw,
};
