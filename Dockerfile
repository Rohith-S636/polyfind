FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
COPY --from=build /app/package*.json ./
# tsx and typescript are needed to run scripts/start.ts
RUN npm ci --include=dev

ENV NODE_ENV=production
ENV CATALOG_MODE=live

COPY --from=build /app/web/.next ./web/.next
COPY --from=build /app/web ./web
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
EXPOSE 3001

CMD ["npm", "run", "start"]
