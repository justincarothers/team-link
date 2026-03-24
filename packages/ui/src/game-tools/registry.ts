import type { FC } from 'react';

export interface GameToolPlugin {
  id: string;
  name: string;
  games: string[];
  component: FC<{ serverUrl: string; roomCode: string; toolId: string }>;
}

class GameToolRegistry {
  private tools: Map<string, GameToolPlugin> = new Map();

  register(tool: GameToolPlugin): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): GameToolPlugin | undefined {
    return this.tools.get(id);
  }

  getAll(): GameToolPlugin[] {
    return Array.from(this.tools.values());
  }

  getForGame(game: string): GameToolPlugin[] {
    return this.getAll().filter(
      (t) => t.games.length === 0 || t.games.includes(game),
    );
  }
}

export const gameToolRegistry = new GameToolRegistry();

// Register built-in tools (lazy import to avoid circular deps)
import('./CollabNotes.js').then((mod) => {
  gameToolRegistry.register(mod.collabNotesTool);
});

import('./ResourceMap.js').then((mod) => {
  gameToolRegistry.register(mod.resourceMapTool);
});

import('./StratDraw.js').then((mod) => {
  gameToolRegistry.register(mod.stratDrawTool);
});
