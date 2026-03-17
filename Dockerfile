FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config and lockfile first for cached dependency install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy package.json files for each workspace package
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/ui/ packages/ui/
COPY packages/server/ packages/server/
COPY packages/web/ packages/web/

# Build shared types
RUN pnpm --filter @team-link/shared build

# Build web app (Vite -> packages/web/dist)
RUN pnpm --filter @team-link/web build

# Build server (tsc -> packages/server/dist)
RUN pnpm --filter @team-link/server build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
