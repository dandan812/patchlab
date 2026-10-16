ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && node node_modules/esbuild/install.js
COPY infra/fixture/index.html infra/fixture/tsconfig.json infra/fixture/vite.config.ts ./
RUN mkdir src && chown -R node:node /app
USER node
ENV NODE_ENV=development
CMD ["node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"]
