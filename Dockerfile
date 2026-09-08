# Navlo backend — Express + node:sqlite. Needs Node 22+ for node:sqlite; runs
# the TypeScript source directly via tsx (same as `npm run dev`/`npm start` locally),
# no separate build step required.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
# tsx (the TS runner) is a devDependency — kept in for the same reason `npm start`
# needs it locally; this app is small enough that a slightly bigger image is fine.
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npx", "tsx", "server.ts"]
