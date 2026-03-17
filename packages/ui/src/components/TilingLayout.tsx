import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react';

interface TilingLayoutProps {
  streamIds: string[];
  renderStream: (streamId: string) => ReactNode;
  className?: string;
}

/**
 * Find the best cols x rows grid for `count` items inside a container
 * of `containerW x containerH`, minimizing wasted space.
 *
 * For each candidate (cols, rows) that fits `count`, compute the cell
 * size and how much of the container area the items actually fill.
 * Pick the one with the highest area utilization.
 */
function bestGrid(count: number, containerW: number, containerH: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };

  let best = { cols: 1, rows: count };
  let bestScore = 0;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = containerW / cols;
    const cellH = containerH / rows;

    // Assume 16:9 stream aspect ratio as a baseline.
    // Scale the stream to fit inside the cell (object-contain).
    const streamAspect = 16 / 9;
    const cellAspect = cellW / cellH;

    let usedW: number, usedH: number;
    if (cellAspect > streamAspect) {
      // Cell is wider than stream — stream is height-constrained
      usedH = cellH;
      usedW = cellH * streamAspect;
    } else {
      // Cell is taller than stream — stream is width-constrained
      usedW = cellW;
      usedH = cellW / streamAspect;
    }

    // Total utilized area across all items
    const utilizedArea = usedW * usedH * count;
    const totalArea = containerW * containerH;
    const score = utilizedArea / totalArea;

    if (score > bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }

  return best;
}

export const TilingLayout: FC<TilingLayoutProps> = ({ streamIds, renderStream, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1920, h: 1080 });
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ w: rect.width, h: rect.height });
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleDoubleClick = useCallback((streamId: string) => {
    setMaximizedId((prev) => (prev === streamId ? null : streamId));
  }, []);

  const displayIds = maximizedId ? [maximizedId] : streamIds;
  const count = displayIds.length;

  const { cols, rows } = useMemo(
    () => bestGrid(count, containerSize.w, containerSize.h),
    [count, containerSize.w, containerSize.h],
  );

  if (streamIds.length === 0) {
    return (
      <div
        ref={containerRef}
        className={`flex h-full items-center justify-center text-gray-500 ${className ?? ''}`}
      >
        No streams available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${className ?? ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '4px',
      }}
    >
      {displayIds.map((id) => (
        <div
          key={id}
          onDoubleClick={() => handleDoubleClick(id)}
          className="min-h-0 min-w-0"
        >
          {renderStream(id)}
        </div>
      ))}
    </div>
  );
};
