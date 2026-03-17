import { useEffect, useRef, type FC } from 'react';

interface StreamViewProps {
  stream: MediaStream | null;
  label?: string;
  monitorName?: string;
  muted?: boolean;
  onDoubleClick?: () => void;
}

export const StreamView: FC<StreamViewProps> = ({
  stream,
  label,
  monitorName,
  muted = true,
  onDoubleClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg bg-gray-900"
      onDoubleClick={onDoubleClick}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="h-full w-full object-contain"
      />
      {(label || monitorName) && (
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {label}
          {monitorName && label ? ` — ${monitorName}` : monitorName}
        </div>
      )}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          No stream
        </div>
      )}
    </div>
  );
};
