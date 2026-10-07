FROM node:22.22.0-alpine3.23 AS build
WORKDIR /workspace
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ARG VITE_ARTIFACT_BASE_URL=/artifacts/anonymous-single-choice-v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_ARTIFACT_BASE_URL=$VITE_ARTIFACT_BASE_URL
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/voter-web ./apps/voter-web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @votaciones/zk-protocol build
RUN pnpm --filter @votaciones/voter-web build

FROM node:22.22.0-alpine3.23 AS runtime
ENV NODE_ENV=production PORT=3002 API_ORIGIN=http://localhost:3000
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/voter-web/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/voter-web/server.mjs ./server.mjs
USER node
EXPOSE 3002
CMD ["node", "server.mjs"]
