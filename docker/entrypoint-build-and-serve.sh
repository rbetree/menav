#!/bin/sh
set -eu

echo "[menav] starting dynamic build mode"

if [ "${MENAV_IMPORT_BOOKMARKS:-false}" = "true" ]; then
  echo "[menav] importing bookmarks before build"
  MENAV_BOOKMARKS_DETERMINISTIC=1 npm run import-bookmarks
fi

if [ "${MENAV_ENABLE_SYNC:-false}" = "true" ]; then
  echo "[menav] syncing caches and building"
  npm run sync && npm run build
else
  echo "[menav] building with sync disabled"
  PROJECTS_ENABLED=false HEATMAP_ENABLED=false RSS_ENABLED=false npm run build
fi

echo "[menav] syncing dist to nginx web root"
mkdir -p /usr/share/nginx/html
rm -rf /usr/share/nginx/html/*
cp -a /app/dist/. /usr/share/nginx/html/

echo "[menav] serving dist with nginx"
exec nginx -g 'daemon off;'
