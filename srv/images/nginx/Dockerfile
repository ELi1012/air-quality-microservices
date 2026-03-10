FROM alpine:3.23

RUN set -eux; \
    apk --no-cache add \
        nginx \
        nginx-mod-http-headers-more \
        gettext-envsubst; \
    \
    rm -rf \
        /var/www/localhost

COPY etc /etc/

STOPSIGNAL SIGTERM

EXPOSE 80/tcp

HEALTHCHECK --interval=300s --timeout=5s \
    CMD wget -q --spider http://localhost:8888/healthcheck || exit 1

CMD ["nginx", "-g", "daemon off;"]
