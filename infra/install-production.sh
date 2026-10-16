#!/usr/bin/env bash
set -euo pipefail
root=/opt/patchlab
stage=/home/ubuntu/patchlab-stage-20261002
test "$(id -u)" = 0
test "$(curl --max-time 5 -fsS http://127.0.0.1:8080/health)" = '{"status":"ok"}'
test ! -e "$root/deployment.env"
test ! -e /etc/systemd/system/patchlab.slice
test ! -e /etc/caddy/patchlab.Caddyfile
test "$(df --output=avail -B1 /opt | tail -1)" -gt 10000000000
test -z "$(ss -H -lnt 'sport = :4310 or sport = :55432')"
cd "$stage"
sha256sum -c images.tar.gz.sha256
nice -n 10 ionice -c 2 -n 7 docker load -i images.tar.gz
install -d -m 750 -o ubuntu -g ubuntu "$root"
install -d -m 750 -o 1000 -g 1000 "$root/data"
install -m 600 -o ubuntu -g ubuntu deployment.env "$root/deployment.env"
install -m 644 compose.production.yaml "$root/compose.yaml"
install -m 644 verify-deployment.py "$root/verify-deployment.py"
install -m 644 patchlab.slice /etc/systemd/system/patchlab.slice
systemctl daemon-reload
systemctl enable --now patchlab.slice
docker compose --env-file "$root/deployment.env" -f "$root/compose.yaml" config --quiet
docker compose --env-file "$root/deployment.env" -f "$root/compose.yaml" up -d --no-build --pull never --wait --wait-timeout 120
curl --max-time 5 -fsS http://127.0.0.1:4310/api/health
curl --max-time 5 -fsS http://127.0.0.1:8080/health
