# 默认静态镜像：构建阶段生成 dist，运行阶段仅由 nginx 提供静态文件。

FROM node:22-alpine AS builder

WORKDIR /app

ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG MENAV_ENABLE_SYNC=false
ARG MENAV_IMPORT_BOOKMARKS=false

RUN if [ "${MENAV_IMPORT_BOOKMARKS}" = "true" ]; then \
      MENAV_BOOKMARKS_DETERMINISTIC=1 npm run import-bookmarks; \
    fi \
    && if [ "${MENAV_ENABLE_SYNC}" = "true" ]; then \
      npm run build; \
    else \
      PROJECTS_ENABLED=false HEATMAP_ENABLED=false RSS_ENABLED=false npm run build; \
    fi

FROM nginx:1.27-alpine AS runtime

WORKDIR /usr/share/nginx/html

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
