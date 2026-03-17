import { useState, type FC } from 'react';
import type * as Y from 'yjs';
import { gameToolRegistry, type GameToolPlugin } from '../game-tools/registry.js';

interface GameToolPanelProps {
  serverUrl: string;
  roomCode: string;
  isOpen: boolean;
  onToggle: () => void;
}

export const GameToolPanel: FC<GameToolPanelProps> = ({
  serverUrl,
  roomCode,
  isOpen,
  onToggle,
}) => {
  const tools = gameToolRegistry.getAll();
  const [activeToolId, setActiveToolId] = useState<string>(tools[0]?.id ?? '');

  const activeTool = tools.find((t) => t.id === activeToolId);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-lg bg-gray-700 px-2 py-4 text-white hover:bg-gray-600"
        title={isOpen ? 'Close tools' : 'Open tools'}
      >
        {isOpen ? '>' : '<'}
      </button>

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-40 flex h-full w-96 flex-col bg-gray-800 text-white shadow-xl transition-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Tab bar */}
        <div className="flex border-b border-gray-700">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveToolId(tool.id)}
              className={`flex-1 px-3 py-2 text-sm ${
                activeToolId === tool.id
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tool.name}
            </button>
          ))}
        </div>

        {/* Tool content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTool && (
            <activeTool.component
              serverUrl={serverUrl}
              roomCode={roomCode}
              toolId={activeTool.id}
            />
          )}
        </div>
      </div>
    </>
  );
};
