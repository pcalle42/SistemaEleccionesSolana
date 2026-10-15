FROM node:22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @votaciones/zk-protocol build \
  && pnpm --filter @votaciones/verification-protocol build \
  && pnpm --filter @votaciones/api build
RUN pnpm --filter @votaciones/api deploy --prod --legacy /opt/votaciones-api
COPY scripts/devnet ./scripts/devnet
COPY fixtures/devnet ./fixtures/devnet

FROM node:22.23.3-alpine3.23@sha256:baf676f7d0e552f3231945c2f979055ca121bce128c152f7a34e6bd1728b1c5a AS runtime-base
ARG APP_VERSION=0.1.0-dev
ARG GIT_COMMIT=unknown
ARG RELEASE_MANIFEST_DIGEST=unreleased
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION GIT_COMMIT=$GIT_COMMIT RELEASE_MANIFEST_DIGEST=$RELEASE_MANIFEST_DIGEST
LABEL org.opencontainers.image.revision=$GIT_COMMIT \
  org.opencontainers.image.source="https://github.com/pcalle42/SistemaEleccionesSolana" \
  org.opencontainers.image.version=$APP_VERSION
WORKDIR /app
COPY --from=build --chown=node:node /opt/votaciones-api ./
COPY --from=build --chown=node:node /workspace/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM runtime-base AS devnet
COPY --from=build --chown=node:node /workspace/scripts/devnet ./scripts/devnet
COPY --from=build --chown=node:node /workspace/fixtures/devnet ./fixtures/devnet

# The default/release target deliberately excludes every devnet script and fixture.
FROM runtime-base AS runtime
