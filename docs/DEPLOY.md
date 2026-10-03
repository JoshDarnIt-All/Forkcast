# Deploying Forkcast

Forkcast is one Docker container. It stores everything in one folder (`data/`): the database and recipe photos.

## 0. What you need
- A Proxmox host with a Linux VM or LXC (Debian 12 or Ubuntu 24.04 is fine), amd64.
- Docker + the Compose plugin on that VM/LXC. (LXC: enable "Nesting" and "keyctl" under Options > Features.)
- A Cloudflare account with `example.com` on it.

## 1. Install Docker (on the VM/LXC)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out and back in
docker compose version             # should print a version
```

## 2. Get the files onto the server
```bash
sudo git clone https://github.com/JoshDarnIt-All/Forkcast.git /opt/forkcast
sudo chown -R $USER /opt/forkcast
```
To update later: `cd /opt/forkcast && git pull && docker compose up -d --build` (your `data/` folder is untouched).

## 3. Configure
```bash
cd /opt/forkcast
mkdir -p data && sudo chown 1000:1000 data     # the container runs as user 1000
openssl rand -hex 24                           # prints a random token; copy it
nano .env
```
Put this in `.env` (paste your token):
```
FORKCAST_SHARE_TOKEN=paste-the-random-token-here
FORKCAST_AI_ENABLED=false
```

## 4. Build and start
```bash
docker compose up -d --build
docker compose ps            # STATUS should say "healthy" after ~30 s
curl http://localhost:8000/api/health
```
Open `http://SERVER-IP:8000` on your home network to test. Update later with `git pull`/rsync, then `docker compose up -d --build`.

### Building on your Mac (arm64) for the server (amd64)
Your Mac is arm64 and the server is amd64, so an image built on the Mac will not run on the server unless you say so. Simplest: build on the server (step 4). To build on the Mac anyway:
```bash
docker buildx build --platform linux/amd64 -t forkcast:latest --output type=docker,dest=forkcast.tar .
scp forkcast.tar user@SERVER:/opt/forkcast/ && ssh user@SERVER "docker load -i /opt/forkcast/forkcast.tar"
```
(`--platform linux/amd64,linux/arm64` builds both, but needs a registry to push to.) The image is pure Python, so both work.

## 5. Cloudflare Tunnel (no ports opened on your router)
1. Cloudflare dashboard > **Zero Trust** > **Networks** > **Tunnels** > **Create a tunnel** > Cloudflared.
2. Name it `forkcast`. Copy the install command it shows and run it on the server (installs `cloudflared`).
3. **Public hostname**: subdomain `forkcast`, domain `example.com`, service type `HTTP`, URL `localhost:8000` (or `forkcast:8000` if cloudflared runs in the same compose network).
4. Save. `https://forkcast.example.com` now reaches the app.

## 6. Cloudflare Access (login in front of the app)
Forkcast has no passwords of its own, so **do this before sharing the link**.
1. Zero Trust > **Access** > **Applications** > **Add an application** > Self-hosted.
2. Application domain: `forkcast.example.com`. Session duration: 1 month (so nobody is nagged).
3. Add a policy: Action **Allow**, Include **Emails** = your email and your wife's. Save.

### Let the iPhone Shortcut through (`/api/share`)
The Shortcut cannot log in through a web page, so give that one path its own rule. `/api/share` is still protected by the secret `X-Share-Token` from your `.env`.

**Option A (simplest): bypass for that path only**
1. Access > Applications > Add application > Self-hosted, domain `forkcast.example.com`, **path** `api/share`.
2. Policy: Action **Bypass**, Include **Everyone**. Save.
(More specific paths win, so the main app stays protected.)

**Option B (stricter): service token**
1. Access > **Service Auth** > **Service Tokens** > Create. Copy the Client ID and Secret (shown once).
2. Same `api/share` application, policy Action **Service Auth**, Include that token.
3. In the Shortcut, add two more headers: `CF-Access-Client-Id` and `CF-Access-Client-Secret`.

## 7. Backups
Everything is in `/opt/forkcast/data`. Back it up with the container stopped for a perfectly safe copy:
```bash
cd /opt/forkcast && docker compose stop && tar czf ~/forkcast-backup-$(date +%F).tgz data && docker compose start
```
Automate weekly (`crontab -e`):
```
0 3 * * 0 cd /opt/forkcast && docker compose stop && tar czf /mnt/backup/forkcast-$(date +\%F).tgz data && docker compose start
```
Also consider a Proxmox VM/LXC snapshot or Proxmox Backup job. **Restore:** stop, replace the `data` folder with the one from the archive, `chown -R 1000:1000 data`, start.

## 8. Optional AI (off by default)
Set `FORKCAST_AI_ENABLED=true` in `.env` plus `FORKCAST_AI_BASE_URL`, `FORKCAST_AI_MODEL` (and `FORKCAST_AI_KEY` if needed), e.g. an Ollama server at `http://192.168.1.50:11434/v1`. Then `docker compose up -d`.

## Troubleshooting
- `docker compose logs -f forkcast` shows errors.
- "permission denied" on `/data`: run `sudo chown -R 1000:1000 data`.
- Some recipe sites (Allrecipes, Serious Eats, Budget Bytes) block servers and datacenter addresses. If an import says "blocks automatic downloads", use **Paste text** in the app.
