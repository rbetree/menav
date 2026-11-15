# 默认静态镜像：构建阶段生成 dist，运行阶段仅由 nginx 提供静态文件。

# node:22-alpine 浮动到 22.x 最新补丁，下限由 package.json engines 约束。
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
      npm run sync && npm run build; \
    else \
      PROJECTS_ENABLED=false HEATMAP_ENABLED=false RSS_ENABLED=false npm run build; \
    fi

FROM nginx:1.30-alpine AS runtime

WORKDIR /usr/share/nginx/html

COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

EXPOSE 8080

# 运行阶段降权；nginx.conf 已把 pid 与临时目录指向 /tmp
USER nginx

# 以运行用户校验配置，同时让 /tmp 下的 nginx 临时目录归属该用户
RUN nginx -t

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
