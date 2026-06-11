# Networking Components Demo

Interactive demo application showcasing **Forward Proxy**, **Load Balancer**, **Reverse Proxy**, **API Gateway**, and **CDN** using Nginx configurations and Docker Compose.

## Quick Start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```powershell
# From this directory
docker compose up -d --build --scale backend=3

# Open the interactive dashboard
start http://localhost:8080
```

Stop everything:

```powershell
docker compose down
```

## Architecture

```
┌─────────────┐
│  Dashboard  │  :8080  Interactive UI
└─────────────┘

┌─────────────┐     ┌──────────────────────────────────────┐
│   Client    │────▶│  Forward Proxy  :3128                │
└─────────────┘     │  (outbound traffic on behalf of user) │
                    └──────────────────┬───────────────────┘
                                       ▼
┌─────────────┐     ┌──────────────────────────────────────┐
│   Client    │────▶│  Load Balancer  :8081                │
└─────────────┘     │  → backend-1, backend-2, backend-3   │
                    └──────────────────────────────────────┘

┌─────────────┐     ┌──────────────────────────────────────┐
│   Client    │────▶│  Reverse Proxy  :8082                │
└─────────────┘     │  → backend-1 (hidden from client)    │
                    └──────────────────────────────────────┘

┌─────────────┐     ┌──────────────────────────────────────┐
│   Client    │────▶│  API Gateway    :8083                │
└─────────────┘     │  → users / products / orders         │
                    └──────────────────────────────────────┘

┌─────────────┐     ┌──────────────────────────────────────┐
│   Client    │────▶│  CDN Edge       :8084                │
└─────────────┘     │  → origin-server (cached assets)     │
                    └──────────────────────────────────────┘
```

## Port Reference

| Port | Component       | Description                          |
|------|-----------------|--------------------------------------|
| 8080 | Dashboard       | Interactive demo UI                  |
| 3128 | Forward Proxy   | Outbound proxy for client requests   |
| 8081 | Load Balancer   | Round-robin across 3 backends        |
| 8082 | Reverse Proxy   | Fronts a single backend              |
| 8083 | API Gateway     | Routes, auth, rate limiting          |
| 8084 | CDN Edge        | Caches static assets from origin     |
| 3001 | Backend Direct  | Direct backend access (comparison)   |

## Live Demos (curl)

### Load Balancer — see round-robin distribution

```powershell
# Send 6 requests — watch instanceId rotate between 1, 2, 3
1..6 | ForEach-Object { (Invoke-RestMethod http://localhost:8081/api/info).meta.instanceId }
```

### Reverse Proxy — compare proxied vs direct

```powershell
# Via reverse proxy (backend hidden)
Invoke-RestMethod http://localhost:8082/api/info

# Direct to backend (port 3001)
Invoke-RestMethod http://localhost:3001/api/info
```

### API Gateway — requires API key

```powershell
# Valid key
Invoke-RestMethod http://localhost:8083/api/users -Headers @{ "X-API-Key" = "demo-key-123" }

# Invalid key (401)
Invoke-RestMethod http://localhost:8083/api/users -Headers @{ "X-API-Key" = "wrong" }
```

### CDN — observe cache HIT/MISS

```powershell
# First request → MISS (fetched from origin)
curl -sI http://localhost:8084/assets/demo.css | Select-String "X-Cache-Status"

# Second request → HIT (served from CDN cache)
curl -sI http://localhost:8084/assets/demo.css | Select-String "X-Cache-Status"
```

### Forward Proxy — routes outbound traffic

```powershell
# Client → Forward Proxy → Load Balancer → Backends
Invoke-RestMethod http://localhost:3128/proxy/load-balancer/api/info

# Production forward proxies use CONNECT method:
# curl -x http://proxy:3128 http://target.com  (requires proxy_connect module)
```

## Nginx Config Locations

| Component       | Config File                              |
|-----------------|------------------------------------------|
| Forward Proxy   | `nginx/forward-proxy/nginx.conf`         |
| Load Balancer   | `nginx/load-balancer/nginx.conf`         |
| Reverse Proxy   | `nginx/reverse-proxy/nginx.conf`         |
| API Gateway     | `nginx/api-gateway/nginx.conf`           |
| CDN             | `nginx/cdn/nginx.conf`                   |
| Origin Server   | `nginx/origin/nginx.conf`                |

## Real-World Examples

| Company  | Components Used                                              |
|----------|--------------------------------------------------------------|
| Netflix  | CDN (Open Connect), Load Balancers, API Gateway              |
| YouTube  | Global CDN edge caching for video segments                   |
| Amazon   | ALB/ELB, CloudFront CDN, API Gateway                         |

## Project Structure

```
├── docker-compose.yml          # Orchestrates all services
├── backend/                    # Shared Node.js backend (Express)
│   ├── server.js
│   ├── Dockerfile
│   └── package.json
├── frontend/                   # Interactive demo dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── static-assets/assets/       # Files cached by CDN
├── nginx/
│   ├── forward-proxy/          # Forward proxy config + Dockerfile
│   ├── load-balancer/
│   ├── reverse-proxy/
│   ├── api-gateway/
│   ├── cdn/
│   ├── origin/
│   └── dashboard/
└── README.md
```

## Troubleshooting

**Port already in use:** Stop conflicting services or change port mappings in `docker-compose.yml`.

**CORS errors in dashboard:** Ensure all containers are running with `docker compose ps`.

**CDN always shows MISS:** Wait a moment and retry — the second request within 10 minutes should show HIT.

**Forward proxy curl fails:** Ensure `forward-proxy` container built successfully (`docker compose logs forward-proxy`).
