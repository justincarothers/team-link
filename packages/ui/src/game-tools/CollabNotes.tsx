import { type FC } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useYjs } from '../hooks/useYjs.js';
import type { GameToolPlugin } from './registry.js';

const COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

interface CollabNotesProps {
  serverUrl: string;
  roomCode: string;
  toolId: string;
}

const CollabNotes: FC<CollabNotesProps> = ({ serverUrl, roomCode, toolId }) => {
  const { doc, synced, provider } = useYjs({ serverUrl, roomCode, toolId });

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }),
        ...(doc
          ? [
              Collaboration.configure({ document: doc }),
              ...(provider
                ? [
                    CollaborationCursor.configure({
                      provider,
                      user: { name: 'Peer', color: randomColor() },
                    }),
                  ]
                : []),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class:
            'prose prose-invert max-w-none min-h-[200px] p-3 bg-gray-900 rounded-lg focus:outline-none',
        },
      },
    },
    [doc, provider],
  );

  if (!doc) {
    return <div className="text-gray-500">Connecting...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Collaborative Notes</h3>
        {!synced && <span className="text-xs text-yellow-400">Syncing...</span>}
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex gap-1">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rounded px-2 py-1 text-xs ${
              editor.isActive('bold') ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rounded px-2 py-1 text-xs italic ${
              editor.isActive('italic') ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            I
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`rounded px-2 py-1 text-xs ${
              editor.isActive('bulletList') ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`rounded px-2 py-1 text-xs ${
              editor.isActive('heading', { level: 2 }) ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            H2
          </button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
};

export const collabNotesTool: GameToolPlugin = {
  id: 'collab-notes',
  name: 'Notes',
  games: [], // available for all games
  component: CollabNotes,
};
