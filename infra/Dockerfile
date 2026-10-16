ARG NODE_IMAGE=node:24-bookworm-slim
ARG DOCKER_CLI_IMAGE=docker:29-cli
FROM ${DOCKER_CLI_IMAGE} AS docker-cli
FROM ${NODE_IMAGE} AS build
WORKDIR /opt/patchlab
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /opt/patchlab
RUN apt-get update && apt-get install -y --no-install-recommends docker.io tini && rm -rf /var/lib/apt/lists/*
COPY --from=build /opt/patchlab /opt/patchlab
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN npx playwright install --with-deps chromium && chmod -R a+rX /opt/browsers
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
ENV NODE_ENV=production PATCHLAB_DATA=/data PATCHLAB_SANDBOX=docker
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
