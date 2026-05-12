# DecorAI 部署指南

## 一、本地开发（前后端热更新）

```bash
./dev.sh
```

- Vue3 前端：http://localhost:5173
- 后端 API + Swagger：http://localhost:8080/docs
- 默认账号：`admin` / `admin123`

## 二、本地一键"生产模拟"（单进程，无 Nginx）

```bash
./build_and_run.sh
# → http://localhost:8080
```

`web/dist` 由 FastAPI 直接 serve，访问 `/` 进入 Vue3 SPA。

## 三、Docker 部署（推荐）

### 1. 准备配置

```bash
cp .env.example .env
vi .env             # 填 SECRET_KEY、Azure 端点、Tenant/Client ID 等
```

### 2. 构建并启动

```bash
docker compose up -d --build
```

默认 **只启动 `app`**，监听 **`127.0.0.1:3000`**（与仓库 `docker-compose.yml` 一致）。公网 **80/443** 请用 **宿主机 Nginx** 反代到 `http://127.0.0.1:3000`（阿里云 ECS + rootless Podman 时也必须这样，容器内 Nginx 绑不了 80）。

若整机只跑本栈且使用 **rootful Docker**、希望由 compose 里的 Nginx 占 80：

```bash
docker compose --profile container-nginx up -d --build
```

服务起来后：
- 仅 `app`：浏览器经宿主机 Nginx 访问你的域名，或本机 `curl http://127.0.0.1:3000/`
- 带 `container-nginx` profile：`http://<服务器IP>/`
- API：`/api/...`；Swagger：`/docs`

### 3. 持久化

`docker-compose.yml` 已挂载：
- `./data` → SQLite 数据库
- `./static/generated`、`./static/uploads` → 生成图与上传图
- `./config` → yaml 配置（只读，改完 `docker compose restart app` 即生效）

### 3.5 反复 502（Nginx 上游连不上 3000）

含义：宿主机 Nginx 反代到 `127.0.0.1:3000`，但 **`decorai-app` 没在监听**（容器退出、Podman rootless 网络异常等）。

**立刻恢复（SSH 上执行）：**

```bash
podman rm -f decorai-app 2>/dev/null || true
cd /home/admin/home_sticker_design_api   # 按你的实际路径
docker compose up -d app
curl -fsS http://127.0.0.1:3000/api/ai/providers && echo OK
```

**不要**在出问题时执行 `podman system migrate`（部分 RHEL/CentOS 自带 Podman 会崩溃）；优先「删容器再 `compose up`」。

**降低复发：**把仓库里的 `scripts/auto-heal-decorai.sh` 拷到服务器、 `chmod +x`，crontab 每分钟跑一次（路径改成你的项目目录）。仍频繁坏时，考虑整机 **重启** 或换 **rootful Docker** / 升级 Podman。

### 4. 升级 / 回滚

```bash
git pull
docker compose up -d --build app    # 只重建 app
docker compose logs -f app
```

## 四、阿里云新加坡 ECS 部署 checklist

1. 安装 Docker：`curl -fsSL https://get.docker.com | sh && systemctl enable --now docker`
2. 安全组放行 `80`（HTTP）、`443`（HTTPS）、`22`（SSH）。**不要**对外开 8080。
3. `git clone` 项目 → `cp .env.example .env` → 填 Azure 配置
4. `docker compose up -d --build`
5. （可选）绑定域名 + Let's Encrypt：
   ```bash
   docker run --rm -v ./nginx/certs:/etc/letsencrypt/live/<domain> \
     certbot/certbot certonly --standalone -d <domain>
   ```
   然后取消 `nginx/nginx.conf` 末尾 HTTPS 段的注释，并把 `docker-compose.yml` 里 `443:443` 端口打开。

## 五、本机一键触发远端部署（可选）

适用于你在本机开发，想一条命令触发 ECS 拉代码并重建容器：

### 1. 本机配置环境变量

```bash
export SSH_DEPLOY_HOST="ubuntu@<服务器公网IP>"
export SSH_DEPLOY_PATH="/home/ubuntu/home_sticker_design"
export PM2_APP_NAME="decor-ai"  # 仅日志标识，可保持默认
```

### 2. 执行部署

```bash
bash scripts/deploy-from-local.sh
```

脚本流程：
- 本机 `git push origin main`（可用 `SKIP_PUSH=1` 跳过）
- SSH 到服务器执行 `scripts/deploy-on-server.sh`
- 服务器侧执行：`git pull --ff-only` + `docker compose up -d --build` + 健康检查

### 3. 服务器脚本可单独执行

```bash
# 登录服务器后，在项目目录执行
bash scripts/deploy-on-server.sh main decor-ai
```

说明：
- `deploy-on-server.sh` 现在会自动识别部署模式：
  - 有 `docker-compose.yml`：走 Compose 重建
  - 否则：走 PM2（首次自动 `start`，后续自动 `restart --update-env`）

### 4. 一键健康检查（服务器执行）

```bash
# 默认检查 http://127.0.0.1:3000/
bash scripts/healthcheck.sh

# 自定义端口和健康路径（示例）
APP_PORT=3000 HEALTH_PATH=/api/ai/providers bash scripts/healthcheck.sh
```

## 六、Azure GPT-Image 鉴权

容器内的 `DefaultAzureCredential` 按以下顺序自动选用：

1. **环境变量服务主体**（最常用，已在 `.env.example` 中预留）：
   `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`
2. **Workload Identity / Managed Identity**（Azure 内部署）
3. `az login` 缓存（仅本地开发）

记得给执行身份在 Foundry 资源上分配：
```
Cognitive Services OpenAI User
```

切换到密钥模式：把 `.env` 里 `AZURE_OPENAI_USE_ENTRA_ID=false` 并填 `AZURE_OPENAI_API_KEY`。

## 七、常用故障排查

| 现象 | 排查 |
|---|---|
| 前端打开后白屏 | 检查 `web/dist` 是否存在；`docker compose logs app` 看是否报 SPA 未挂载警告 |
| AI 生成 401/403 | Azure 身份缺 `Cognitive Services OpenAI User` 角色 |
| AI 生成 404 deployment | `AZURE_OPENAI_DEPLOYMENT` 与 Foundry 中的部署名不一致 |
| 上传图过大 | `nginx.conf` `client_max_body_size` 已设 64M，可加大 |
| 想换 Postgres | 把 `DATABASE_URL` 改为 `postgresql+psycopg://...`，并在 compose 里加 postgres service |

## 八、SSH 变慢、容器反复退出、502 — 处理思路

### 1）本机 `ssh` 要等好几秒

常见原因是客户端在做 **GSSAPI/Kerberos** 或 **DNS 反向解析**。在本机 `~/.ssh/config` 为该机单独关掉 GSSAPI、缩短握手（示例把 `HostName` 换成你的公网 IP）：

```
Host sticker-sg
  HostName 43.98.182.55
  User admin
  IdentityFile ~/.ssh/id_ed25519_sg
  GSSAPIAuthentication no
  PreferredAuthentications publickey
  ConnectTimeout 10
  ServerAliveInterval 30
  ServerAliveCountMax 4
```

之后用 `ssh sticker-sg` 登录。若仍慢，在服务器 **root** 侧可把 `sshd_config` 里 `UseDNS no` 打开（需重启 `sshd`），减少服务端对客户端 IP 的反查等待。

### 2）容器反复退出（根治方向）

- **先看退出原因**：`podman inspect decorai-app --format '{{.State.ExitCode}} {{.State.Error}}'`；再看日志 `podman logs --tail 200 decorai-app`。若是 **OOM**，在 ECS 上升级内存或对 Podman 设内存上限前先减负。
- **数据库路径**：容器内请使用 compose 默认的绝对路径 **`sqlite:////app/data/app.db`**（四个斜杠）。不要用依赖当前工作目录的 `sqlite:///./data/...`，避免偶发路径不一致。
- **Podman rootless 不稳定**（slirp4netns、DNS）：仓库 `scripts/auto-heal-decorai.sh` 可在 **crontab 每分钟**跑（`DECORAI_HOME` 指向项目根），探测 **`http://127.0.0.1:3000/api/health`**，失败则删容器再 `podman-compose up -d app`。长期更稳可考虑 **rootful Docker** 或 **Podman quadlet/systemd 用户单元** 托管 compose。
- **不要**混用 root 与普通用户的同名容器（`deploy-on-server.sh` 里已有 root 旧容器清理逻辑）；混用会导致端口上跑到旧进程、表象像「刚部署又挂」。
- **勿把 `generativelanguage.googleapis.com` 长期写死成单个 IP**（`extra_hosts`）：Google IP 会变，轻则超时重则拖垮请求；优先用 compose 里已配的 DNS `8.8.8.8` / `1.1.1.1`。

### 3）浏览器 Nginx 502（根治方向）

502 表示 **Nginx 连不上上游**。在「宿主机 Nginx → `127.0.0.1:3000`」架构下必须同时满足：

1. **`decorai-app` 在跑且映射 `127.0.0.1:3000→8080`**：`podman ps` 里为 `Up`；`curl -fsS http://127.0.0.1:3000/api/health` 返回 `{"status":"ok"}`。
2. **站点 `server` 块里 `proxy_pass` 指向 `http://127.0.0.1:3000`**（不要仍指向旧端口或 Docker 内部名 `app:8080`——那是 **容器内 Nginx** 用的，拷到宿主机上会直接 502）。
3. **`location ^~ /api/`（及 `/`）** 为长耗时接口配置足够超时，例如 `proxy_connect_timeout 30s;`、`proxy_read_timeout 300s;`、`proxy_send_timeout 300s;`（与仓库 `nginx/nginx.conf` 思路一致）。

部署脚本里的 Compose 健康检查默认连 **`http://127.0.0.1:${APP_PORT:-3000}`**，依次尝试 **`/api/health`**（新代码）与 **`/api/ai/providers`**（兼容尚未重建的旧镜像）。若检查必须经宿主机 Nginx，可 `export COMPOSE_HEALTH_URL=http://127.0.0.1/api/ai/providers` 再执行 `deploy-on-server.sh`。
