FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .

# Allow branding to be set at build time for Next.js public envs.
ARG APP_NAME=StreamCore
ARG NEXT_PUBLIC_API_URL

# Server-only internal URL can be provided at runtime; build does not need it.
ENV NODE_ENV=production
ENV INTERNAL_API_URL=http://backend:3000
# Next.js requires NEXT_PUBLIC_ prefix for client-side env vars
ENV APP_NAME=$APP_NAME
ENV NEXT_PUBLIC_APP_NAME=$APP_NAME
# CRITICAL: NEXT_PUBLIC_API_URL must be set at build time for client-side code
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/package-lock.json /app/package-lock.json
COPY --from=build /app/next.config.js /app/next.config.js
COPY --from=build /app/server.js /app/server.js
COPY --from=build /app/public /app/public
COPY --from=build /app/.next /app/.next
COPY --from=build /app/node_modules /app/node_modules

EXPOSE 5000

CMD ["npm", "run", "start"]
