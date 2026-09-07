# Static build served by nginx, which also reverse-proxies /api and /ws to
# the backend container — mirrors the Vite dev-server proxy in vite.config.js,
# so the frontend code needs no changes (fetch("/api/...") keeps working).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
