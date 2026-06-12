# Networking Components Demo

Interactive demo application that explains how common networking components work in practice. Each component is implemented with **Nginx** and orchestrated via **Docker Compose**, with a browser dashboard at `http://localhost:8080` for hands-on exploration.

This project covers:

- **Forward Proxy** — outbound traffic on behalf of clients
- **Load Balancer** — distributes traffic across multiple backend instances
- **Reverse Proxy** — fronts a backend and hides it from clients
- **API Gateway** — single entry point for microservices with routing, auth, and rate limiting
- **CDN** — edge caching of static assets from an origin server

---

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

> **Important:** Scale the `backend` service to 3 replicas for the load balancer demo. Other components work with the default replica count.

---

## System Architecture

All services run on a shared Docker network (`demo-net`). Clients (browser, curl, or the dashboard) reach components through published host ports.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client (Browser / curl)                        │
└───────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
        │          │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼          ▼
   Dashboard  Forward    Load      Reverse    API       CDN Edge
    :8080     Proxy      Balancer    Proxy    Gateway     :8084
              :3128       :8081      :8082     :8083         │
        │          │          │          │          │          │
        │          │          ▼          ▼          ▼          ▼
        │          │     ┌────────┐ ┌────────┐ ┌──────────────────┐
        │          │     │backend │ │backend │ │ users-service    │
        │          └──▶  │ x3     │ │(pool)  │ │ products-service │
        │                └────────┘ └────────┘ │ orders-service   │
        │                                      └──────────────────┘
        │                                                    │
        │                                                    ▼
        │                                            ┌──────────────┐
        └───────────────────────────────────────────▶│ origin-server│
                                                     │ (static CDN  │
                                                     │   source)    │
                                                     └──────────────┘
```

### Request Flow Overview

| Scenario | Path |
|----------|------|
| Load balancing | Client → Load Balancer (`:8081`) → one of 3 `backend` replicas |
| Reverse proxy | Client → Reverse Proxy (`:8082`) → `backend` pool (identity hidden) |
| API gateway | Client → API Gateway (`:8083`) → `users-service` / `products-service` / `orders-service` |
| CDN caching | Client → CDN Edge (`:8084`) → cache hit **or** fetch from `origin-server` |
| Forward proxy | Client → Forward Proxy (`:3128`) → target host (e.g. load balancer) |
| Direct comparison | Client → `backend-direct` (`:3001`) — bypasses all proxies |

---

## Networking Components — Roles & Functionality

### 1. Forward Proxy (`:3128`)

**Role:** Acts on behalf of **clients** for **outbound** requests. The client never talks to the destination server directly; it sends the request to the proxy, and the proxy forwards it.

**What it does in this demo:**

- Listens on port `3128` (the standard forward-proxy port)
- Accepts requests using path-based routing: `GET /proxy/<host>/<path>`
- Forwards the request to the named Docker service (e.g. `load-balancer`)
- Adds proxy headers (`Via`, `X-Real-IP`, `X-Forwarded-For`) so downstream services know the request was proxied

**Example flow:**

```
Client  →  GET /proxy/load-balancer/api/info  →  Forward Proxy  →  Load Balancer  →  Backend
```

**Production note:** Real forward proxies typically use the HTTP `CONNECT` method (`curl -x http://proxy:3128 http://target.com`) with the `proxy_connect` Nginx module. This demo simulates the same idea with path-based routing so it works in a browser without special client configuration.

**Common use cases:** Corporate egress proxies, developer proxies, outbound traffic logging, content filtering, hiding client IP from external sites.

**Config:** `nginx/forward-proxy/nginx.conf`

---

### 2. Load Balancer (`:8081`)

**Role:** Distributes **incoming** traffic across multiple identical backend servers to improve availability, throughput, and fault tolerance.

**What it does in this demo:**

- Uses **round-robin** DNS resolution against the scaled `backend` service (`docker compose --scale backend=3`)
- Each request may land on a different backend instance (visible via `meta.instanceId` or `meta.hostname` in the JSON response)
- Forwards client IP and protocol headers to backends
- Retries on upstream errors (`502`, `503`, timeouts)

**Example flow:**

```
Client  →  Load Balancer  →  backend-1 | backend-2 | backend-3  (rotating)
```

**Why scaling matters:** With `--scale backend=3`, Docker runs three containers behind the single service name `backend`. Nginx resolves `backend:3000` at request time and round-robins across replicas.

**Common use cases:** Amazon ALB/ELB, HAProxy, Kubernetes Services, any system that spreads HTTP load across a pool.

**Config:** `nginx/load-balancer/nginx.conf`

---

### 3. Reverse Proxy (`:8082`)

**Role:** Sits **in front of** backend servers and handles client requests on their behalf. Clients only see the proxy's address — the real backend hostname, port, and topology are hidden.

**What it does in this demo:**

- Presents a single public entry point (`localhost:8082`) while proxying to `backend:3000`
- Adds headers indicating reverse-proxy handling (`X-Reverse-Proxy`, `X-Backend-Hidden`)
- Rewrites/forwards `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`
- Strips backend-identifying headers (`Server`, `X-Powered-By`)
- Enables buffering and read timeouts (SSL termination would also happen here in production)

**Compare with direct access:** `backend-direct` is exposed on port `3001` so you can contrast proxied vs. direct backend access.

**Example flow:**

```
Client  →  Reverse Proxy (:8082)  →  backend (hidden)
Client  →  backend-direct (:3001)  →  backend (exposed)
```

**Difference from forward proxy:** A **forward** proxy serves the client going **out** to the internet. A **reverse** proxy serves the **server**, accepting **inbound** traffic from clients.

**Common use cases:** Nginx in front of Node.js/Python apps, SSL termination, compression, URL rewriting, WAF placement.

**Config:** `nginx/reverse-proxy/nginx.conf`

---

### 4. API Gateway (`:8083`)

**Role:** A **single entry point** for multiple backend microservices. It centralizes cross-cutting concerns that would otherwise be duplicated in every service.

**What it does in this demo:**

| Feature | Behavior |
|---------|----------|
| **Routing** | `/api/users` → `users-service`, `/api/products` → `products-service`, `/api/orders` → `orders-service` |
| **Authentication** | Requires `X-API-Key` header; valid keys: `demo-key-123`, `admin-key-456` |
| **Rate limiting** | 10 requests/minute per IP (`429` when exceeded) |
| **CORS** | Allows browser requests from the dashboard |
| **Observability** | Adds `X-Gateway-Route` header identifying the target service |

**Example flow:**

```
Client  →  API Gateway (:8083)  →  [auth check]  →  [rate limit]  →  microservice
```

Clients call one URL (`localhost:8083`) instead of knowing three separate service hostnames. The gateway enforces policy before traffic reaches any microservice.

**Common use cases:** Amazon API Gateway, Kong, Netflix Zuul, AWS AppSync, any microservices "front door."

**Config:** `nginx/api-gateway/nginx.conf`

---

### 5. CDN — Content Delivery Network (`:8084`)

**Role:** Caches static content at **edge servers** close to users, reducing latency and origin load. Dynamic/API traffic typically bypasses the cache.

**Components in this demo:**

| Service | Role |
|---------|------|
| **CDN Edge** (`cdn`, `:8084`) | Caches responses; serves `X-Cache-Status: HIT` or `MISS` |
| **Origin Server** (`origin-server`) | Authoritative source for static files in `static-assets/` |

**What the CDN edge does:**

- Caches `/assets/*` responses for **10 minutes** (`proxy_cache_valid 200 10m`)
- On **MISS**: fetches from `origin-server`, stores in `cdn-cache` volume, returns to client
- On **HIT**: serves directly from edge cache (faster, no origin round-trip)
- `/api/*` requests **bypass** cache (`X-Cache-Status: BYPASS`) because API data is dynamic

**Example flow:**

```
First request:   Client  →  CDN Edge  →  MISS  →  Origin Server  →  cache + respond
Second request:  Client  →  CDN Edge  →  HIT   →  respond from cache
```

**Common use cases:** Cloudflare, Amazon CloudFront, Akamai, Netflix Open Connect (video segments cached at ISP edges).

**Configs:** `nginx/cdn/nginx.conf`, `nginx/origin/nginx.conf`

---

### 6. Dashboard (`:8080`)

**Role:** Interactive web UI for exploring all components without memorizing curl commands.

**What it provides:**

- Tabbed interface for each networking component
- Live API calls to load balancer, forward proxy, API gateway, and CDN
- Visual traffic distribution chart for load balancer round-robin
- CDN cache log showing HIT/MISS/BYPASS over time

**Served by:** Nginx static file server with `frontend/index.html`, `app.js`, and `styles.css`.

**Config:** `nginx/dashboard/nginx.conf`

---

### 7. Backend Services (shared Node.js / Express)

All application logic uses a single `backend/` codebase built into multiple containers with different environment variables.

| Container | Port (host) | Purpose |
|-----------|-------------|---------|
| `backend` (×3 scaled) | internal only | Load balancer & reverse proxy targets |
| `backend-direct` | `3001` | Direct access for reverse-proxy comparison |
| `users-service` | internal | API gateway route: `/api/users` |
| `products-service` | internal | API gateway route: `/api/products` |
| `orders-service` | internal | API gateway route: `/api/orders` |

Each instance returns JSON with `meta` fields (`instanceId`, `hostname`, `clientIp`, forwarding headers) so you can trace how requests flow through the stack.

---

## How Components Interact

### Load Balancer + Backends

The load balancer is the only component that **requires** three backend replicas. Each `/api/info` call may return a different `instanceId`, demonstrating round-robin distribution.

### Forward Proxy + Load Balancer

The forward proxy demo chains two components: the client addresses the proxy, and the proxy forwards to the load balancer, which then picks a backend. This shows how outbound corporate proxies can route internal traffic through intermediate infrastructure.

### Reverse Proxy vs. Direct Backend

Hitting `:8082` goes through the reverse proxy (backend hidden, extra headers added). Hitting `:3001` reaches `backend-direct` with no intermediary — useful for comparing security and header behavior.

### API Gateway + Microservices

The gateway decouples clients from service topology. Adding a new microservice in production would mean updating gateway routes, not changing every client application.

### CDN + Origin

The CDN shields the origin from repeated static asset requests. Only cache misses and bypassed paths reach `origin-server`, mirroring how production CDNs reduce origin bandwidth costs.

---

## Port Reference

| Port | Component | Description |
|------|-----------|-------------|
| 8080 | Dashboard | Interactive demo UI |
| 3128 | Forward Proxy | Outbound proxy for client requests |
| 8081 | Load Balancer | Round-robin across 3 `backend` replicas |
| 8082 | Reverse Proxy | Fronts backend pool; hides server identity |
| 8083 | API Gateway | Routes, API-key auth, rate limiting |
| 8084 | CDN Edge | Caches static assets from origin |
| 3001 | Backend Direct | Direct backend access (comparison baseline) |

---

## Live Demos (curl / PowerShell)

### Load Balancer — round-robin distribution

```powershell
# Send 6 requests — watch instanceId rotate across backends
1..6 | ForEach-Object { (Invoke-RestMethod http://localhost:8081/api/info).meta.instanceId }
```

### Reverse Proxy — proxied vs. direct

```powershell
# Via reverse proxy (backend hidden)
Invoke-RestMethod http://localhost:8082/api/info

# Direct to backend (port 3001)
Invoke-RestMethod http://localhost:3001/api/info
```

### API Gateway — API key required

```powershell
# Valid key
Invoke-RestMethod http://localhost:8083/api/users -Headers @{ "X-API-Key" = "demo-key-123" }

# Invalid key (401)
Invoke-RestMethod http://localhost:8083/api/users -Headers @{ "X-API-Key" = "wrong" }
```

### CDN — cache HIT vs. MISS

```powershell
# First request → MISS (fetched from origin)
curl -sI http://localhost:8084/assets/demo.css | Select-String "X-Cache-Status"

# Second request → HIT (served from CDN cache)
curl -sI http://localhost:8084/assets/demo.css | Select-String "X-Cache-Status"
```

### Forward Proxy — chained outbound routing

```powershell
# Client → Forward Proxy → Load Balancer → Backends
Invoke-RestMethod http://localhost:3128/proxy/load-balancer/api/info
```

---

## Nginx Config Locations

| Component | Config File |
|-----------|-------------|
| Forward Proxy | `nginx/forward-proxy/nginx.conf` |
| Load Balancer | `nginx/load-balancer/nginx.conf` |
| Reverse Proxy | `nginx/reverse-proxy/nginx.conf` |
| API Gateway | `nginx/api-gateway/nginx.conf` |
| CDN Edge | `nginx/cdn/nginx.conf` |
| Origin Server | `nginx/origin/nginx.conf` |
| Dashboard | `nginx/dashboard/nginx.conf` |

---

## Real-World Examples

| Company | Components | How they use them |
|---------|------------|-------------------|
| **Netflix** | CDN (Open Connect), Load Balancers, API Gateway | Open Connect appliances at ISPs cache video near viewers; load balancers spread API traffic; Zuul/API layers route microservice calls |
| **YouTube** | Global CDN | Video segments cached at edge locations worldwide so playback starts quickly regardless of user location |
| **Amazon** | ALB/ELB, CloudFront CDN, API Gateway | ELB distributes traffic across EC2 targets; CloudFront caches static assets and API responses at edge; API Gateway manages public REST/WebSocket APIs with throttling and keys |

---

## Project Structure

```
├── docker-compose.yml          # Orchestrates all services and networking
├── backend/                    # Shared Node.js backend (Express)
│   ├── server.js               # API endpoints + request metadata
│   ├── Dockerfile
│   └── package.json
├── frontend/                   # Interactive demo dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── static-assets/assets/       # Files cached by CDN (demo.css, demo.js)
├── nginx/
│   ├── forward-proxy/          # Forward proxy config + Dockerfile
│   ├── load-balancer/
│   ├── reverse-proxy/
│   ├── api-gateway/
│   ├── cdn/
│   ├── origin/
│   └── dashboard/
├── networking_components_architecture.html  # Visual architecture reference
└── README.md
```

---

## Troubleshooting

**Port already in use:** Stop conflicting services or change port mappings in `docker-compose.yml`.

**Load balancer always returns the same instance:** Ensure you started with `--scale backend=3`. Verify with `docker compose ps`.

**CORS errors in dashboard:** Ensure all containers are running (`docker compose ps`). Restart with `docker compose up -d --build --scale backend=3`.

**CDN always shows MISS:** Wait a moment and retry — the second request within the 10-minute TTL should show HIT.

**API Gateway returns 401:** Include header `X-API-Key: demo-key-123`.

**API Gateway returns 429:** Rate limit is 10 requests/minute per IP. Wait and retry.

**Forward proxy request fails:** Check `docker compose logs forward-proxy` and confirm `load-balancer` is healthy.
