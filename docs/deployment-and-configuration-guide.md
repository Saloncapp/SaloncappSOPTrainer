# Saloncapp SOP Trainer Deployment and Configuration Guide

## Purpose

`SaloncappSOPTrainer` is an independently deployable Node.js/Express microservice used by the Training module in `SaloncappStaffApp`.

It must run beside the monolithic `SaloncappRepo` service on the same three servers, but as a separate PM2 process, separate release directory, separate MongoDB database, and separate public Training API host.

## Environment Mapping

| Environment | Branch | GitHub Environment | Server | Public Training API URL | PM2 Process | Local Port |
| --- | --- | --- | --- | --- | --- | --- |
| Development | `dev` | `development` | Development server | `https://training.saloonstaff.in` | `saloncapp-sop-trainer` | `4010` |
| Pre-production | `preprod` | `preprod` | Pre-production server | `https://training.saloonstaff.com` | `saloncapp-sop-trainer` | `4010` |
| Production | `production` | `production` | Production server | `https://training.saloncapp.com` | `saloncapp-sop-trainer` | `4010` |

`main` is CI-only. Pushes to `main` run tests and build, but do not deploy.

## Branch Setup

Create the deploy branches from `main` after the repository is pushed to GitHub:

```bash
git checkout main
git pull origin main

git checkout -b dev
git push -u origin dev

git checkout main
git checkout -b preprod
git push -u origin preprod

git checkout main
git checkout -b production
git push -u origin production
```

After these branches exist, every push to `dev`, `preprod`, or `production` triggers deployment to its mapped server.

## GitHub Configuration

Create these GitHub Environments in the `SaloncappSOPTrainer` repository:

- `development`
- `preprod`
- `production`

Add these environment secrets:

| Environment | Required Secrets |
| --- | --- |
| `development` | `DEV_HOST`, `DEV_USER`, `DEV_SSH_KEY` |
| `preprod` | `PREPROD_HOST`, `PREPROD_USER`, `PREPROD_SSH_KEY` |
| `production` | `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_SSH_KEY` |

The workflow does not store app secrets in GitHub. Runtime app secrets are read from `~/SaloncappSOPTrainer/shared/.env` on each server.

## Server Directory Layout

Create this once on every server:

```bash
mkdir -p ~/SaloncappSOPTrainer/shared/logs
mkdir -p ~/SaloncappSOPTrainer/releases
```

The GitHub Actions deploy job manages this layout:

```text
~/SaloncappSOPTrainer/
├── current -> releases/saloncapp-sop-trainer-{git-sha}/
├── shared/
│   ├── .env
│   └── logs/
└── releases/
    ├── saloncapp-sop-trainer-{sha-1}/
    ├── saloncapp-sop-trainer-{sha-2}/
    └── ...
```

## Server Runtime Requirements

Each server must already have:

- Ubuntu 24.04 LTS or compatible Linux host
- Node.js `20.19.4` through `nvm`
- PM2 installed globally
- Nginx enabled
- The existing wildcard TLS certificate for the environment domain

Install PM2 if missing:

```bash
npm install -g pm2
```

## Server Environment File

Create this file on each server:

```bash
nano ~/SaloncappSOPTrainer/shared/.env
```

Minimum required values:

```bash
NODE_ENV=production
PORT=4010

# Dedicated SOP Trainer database only.
# Do not point this at the main SaloncappRepo database.
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/saloncapp_sop_trainer_ENV?retryWrites=true&w=majority

# Must match SaloncappRepo NEXTAUTH_SECRET in the same environment.
NEXTAUTH_SECRET=replace-with-the-same-secret-used-by-saloncapprepo

GEMINI_API_KEY=replace-with-gemini-key
GEMINI_MODEL=gemini-2.5-flash-lite

# Native mobile does not need browser CORS, but this keeps future web/admin usage explicit.
CORS_ORIGIN=*

ASSESSMENT_QUESTION_COUNT=5
ASSESSMENT_TIME_LIMIT_SECONDS=300
```

Recommended database names:

| Environment | Database Name |
| --- | --- |
| Development | `saloncapp_sop_trainer_dev` |
| Pre-production | `saloncapp_sop_trainer_preprod` |
| Production | `saloncapp_sop_trainer_production` |

The service shares the Staff app JWT issued by `SaloncappRepo`, so `NEXTAUTH_SECRET` must stay identical between `SaloncappRepo` and `SaloncappSOPTrainer` for the same environment.

## Nginx Configuration

Keep the monolith proxy on port `3000`. Add a separate `server` block for the Training API host that proxies to SOP Trainer on port `4010`.

Recommended approach: use a subdomain such as `training.saloncapp.com`, not the server IP address. Direct IP URLs are useful only for temporary private testing. A subdomain gives you HTTPS, Cloudflare protection, stable mobile app configuration, and the freedom to move the service to another server later without shipping a new app build just because the IP changed.

Do not rewrite the existing SaloncappRepo `location /` block. Add a new Nginx `server` block for the Training host. If the Training API is hosted on its own subdomain, no path rewrite is needed.

This does not break existing SaloncappRepo subdomain login. If SaloncappRepo already has a wildcard block such as `server_name saloncapp.com *.saloncapp.com;`, Nginx will still route `training.saloncapp.com` to this exact Training server block because exact `server_name` matches win over wildcard matches.

Development:

```nginx
server {
    listen 80;
    server_name training.saloonstaff.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name training.saloonstaff.in;

    ssl_certificate      /etc/letsencrypt/live/saloonstaff.in/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/saloonstaff.in/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass              http://127.0.0.1:4010;
        proxy_http_version      1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

### Nginx Setup Commands

Run only the block that matches the server environment.

### Production Nginx Commands

```bash
sudo tee /etc/nginx/sites-available/saloncapp-sop-trainer >/dev/null <<'EOF'
server {
    listen 80;
    server_name training.saloncapp.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name training.saloncapp.com;

    ssl_certificate      /etc/letsencrypt/live/saloncapp.com/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/saloncapp.com/privkey.pem;
    include              /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam          /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass              http://127.0.0.1:4010;
        proxy_http_version      1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/saloncapp-sop-trainer /etc/nginx/sites-enabled/saloncapp-sop-trainer
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://training.saloncapp.com/health
```

### Pre-production Nginx Commands

```bash
sudo tee /etc/nginx/sites-available/saloncapp-sop-trainer >/dev/null <<'EOF'
server {
    listen 80;
    server_name training.saloonstaff.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name training.saloonstaff.com;

    ssl_certificate      /etc/letsencrypt/live/saloonstaff.com/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/saloonstaff.com/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass              http://127.0.0.1:4010;
        proxy_http_version      1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/saloncapp-sop-trainer /etc/nginx/sites-enabled/saloncapp-sop-trainer
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://training.saloonstaff.com/health
```

### Development Nginx Commands

```bash
sudo tee /etc/nginx/sites-available/saloncapp-sop-trainer >/dev/null <<'EOF'
server {
    listen 80;
    server_name training.saloonstaff.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name training.saloonstaff.in;

    ssl_certificate      /etc/letsencrypt/live/saloonstaff.in/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/saloonstaff.in/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass              http://127.0.0.1:4010;
        proxy_http_version      1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/saloncapp-sop-trainer /etc/nginx/sites-enabled/saloncapp-sop-trainer
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://training.saloonstaff.in/health
```

## Cloudflare DNS

Add an `A` record for each Training host:

| Environment | Record | Target |
| --- | --- | --- |
| Development | `training.saloonstaff.in` | Development server public IP |
| Pre-production | `training.saloonstaff.com` | Pre-production server public IP |
| Production | `training.saloncapp.com` | Production server public IP |

Use the same proxy mode as the main app host. SSL/TLS mode should remain `Full`.

## Staff App Configuration

Set the Training API URL separately from the main Saloncapp API URL.

Development build:

```bash
EXPO_PUBLIC_TRAINING_API_URL=https://training.saloonstaff.in
```

Pre-production build:

```bash
EXPO_PUBLIC_TRAINING_API_URL=https://training.saloonstaff.com
```

Production build:

```bash
EXPO_PUBLIC_TRAINING_API_URL=https://training.saloncapp.com
```

Do not change `EXPO_PUBLIC_API_BASE_URL` for normal Staff app APIs. Only Training calls should use `EXPO_PUBLIC_TRAINING_API_URL`.

## CI/CD Flow

The workflow is defined in `.github/workflows/deploy.yml`.

For every push:

```text
checkout
npm ci
npm test
npm run build
```

For `dev`, `preprod`, and `production` only:

```text
npm prune --omit=dev
create release tarball
scp release to ~/SaloncappSOPTrainer/releases/
extract into immutable release directory
link shared/.env and shared/logs
update ~/SaloncappSOPTrainer/current
pm2 startOrReload ecosystem.config.js --update-env
curl http://127.0.0.1:4010/health
retain the latest 5 releases
```

## First Deployment Checklist

Run this checklist for each server:

- Confirm Node `20.19.4` and PM2 are installed.
- Create `~/SaloncappSOPTrainer/shared/.env`.
- Create Cloudflare `training.*` DNS record.
- Add the Nginx Training API server block.
- Run `sudo nginx -t`.
- Reload Nginx.
- Configure GitHub Environment SSH secrets.
- Push to the matching branch.
- Verify health: `https://training.<domain>/health`.
- Verify PM2: `pm2 status`.

## Rollback

SSH to the affected server:

```bash
cd ~/SaloncappSOPTrainer
ls -dt releases/saloncapp-sop-trainer-*
```

Point `current` to a known-good release:

```bash
ln -sfn ~/SaloncappSOPTrainer/releases/saloncapp-sop-trainer-{good-sha} ~/SaloncappSOPTrainer/current
cd ~/SaloncappSOPTrainer/current
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
```

Verify:

```bash
curl -fsS http://127.0.0.1:4010/health
pm2 logs saloncapp-sop-trainer --lines 80 --nostream
```

## Operational Notes

- `SaloncappRepo` remains the monolith and continues to serve all existing APIs on port `3000`.
- `SaloncappSOPTrainer` runs independently on port `4010`.
- The Training service should not write to the main Saloncapp database.
- The Training service must use the same `NEXTAUTH_SECRET` as `SaloncappRepo` so Staff JWT validation works.
- The Staff app should send the existing Staff JWT and `x-tenant-id` header to the Training service.
- If `SaloncappRepo` and `SaloncappSOPTrainer` run under the same Linux user and the same PM2 daemon, any `pm2 kill` command from the SaloncappRepo deployment can stop the SOP Trainer too. Prefer either a separate deploy/Linux user for SOP Trainer, or update the SaloncappRepo deploy script so it restarts only its managed app names instead of killing the entire PM2 daemon.
- Add monitoring later for `/health`, process uptime, and PM2 logs.
