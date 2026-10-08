FROM node:22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a AS build
WORKDIR /workspace
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/admin-web ./apps/admin-web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @votaciones/admin-web build

FROM node:22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a AS runtime
ENV NODE_ENV=production PORT=3001 API_ORIGIN=http://localhost:3000
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/admin-web/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/admin-web/server.mjs ./server.mjs
USER node
EXPOSE 3001
CMD ["node", "server.mjs"]
