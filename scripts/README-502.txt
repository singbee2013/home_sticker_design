DecorAI 全站 502 / 登不进去 — 最常见原因
========================================

1) 在「家目录 ~」里执行了 podman-compose  
   → 报 missing files，容器根本没起来，Nginx 反代 127.0.0.1:3000 必 502。  
   正确做法：先  
   cd /home/admin/home_sticker_design_api  
   再执行 compose 或：  
   bash scripts/fix-server-502.sh /home/admin/home_sticker_design_api

2) 本机自检（在服务器上）  
   curl -sS http://127.0.0.1:3000/api/health  
   若 connection refused → 回到 (1) 启动容器。  
   若返回 {"status":"ok"} 但浏览器仍 502 → 试 SELinux：  
   sudo setsebool -P httpd_can_network_connect 1  
   sudo systemctl reload nginx

3) Podman 报 “acquiring lock … file exists”  
   已在 fix-server-502.sh 里对 decorai-app 做 stop + rm -f；仍不行可重启 podman 或整机。

4) 报「container name decorai-app is already in use」后 compose 可能只执行了 podman start：  
   会拉起旧容器（端口映射或镜像不对）→ 全站 502。  
   处理：podman rm -f decorai-app，再在项目目录执行  
   podman-compose -f docker-compose.yml up -d --force-recreate app  
   或 bash scripts/fix-server-502.sh

5) 可选 host 网络（仅当 1)+2) 仍不稳）  
   export DECORAI_USE_PODMAN_HOST_COMPOSE=1  
   bash scripts/fix-server-502.sh
