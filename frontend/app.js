// Tab navigation
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

function showResult(elementId, data, isError = false) {
  const el = document.getElementById(elementId);
  el.classList.remove("empty", "success", "error");
  el.classList.add(isError ? "error" : "success");
  el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

async function fetchJSON(url, resultId, options = {}) {
  const el = document.getElementById(resultId);
  el.textContent = "Loading…";
  el.classList.remove("empty", "success", "error");

  try {
    const res = await fetch(url, options);
    const headers = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    const body = res.headers.get("content-type")?.includes("json")
      ? await res.json()
      : await res.text();

    showResult(resultId, { status: res.status, headers, body });
    return { res, body, headers };
  } catch (err) {
    showResult(resultId, `Error: ${err.message}\n\nMake sure Docker Compose is running:\n  docker compose up -d`, true);
  }
}

async function fetchDirect(url, resultId) {
  return fetchJSON(url, resultId);
}

// Load Balancer demo
async function fetchLB() {
  await fetchJSON("http://localhost:8081/api/info", "lb-result");
}

async function fetchLBMultiple(count) {
  const el = document.getElementById("lb-result");
  const chart = document.getElementById("lb-chart");
  el.textContent = `Sending ${count} requests…`;
  chart.classList.remove("hidden");

  const distribution = {};
  const results = [];

  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch("http://localhost:8081/api/info");
      const body = await res.json();
      const instance = body.meta?.hostname || body.meta?.instanceId || "unknown";
      distribution[instance] = (distribution[instance] || 0) + 1;
      results.push({ request: i + 1, instance, instanceId: body.meta?.instanceId });
    } catch (err) {
      showResult("lb-result", `Error: ${err.message}`, true);
      return;
    }
  }

  showResult("lb-result", { message: `${count} requests completed`, distribution, results });

  const max = Math.max(...Object.values(distribution));
  chart.innerHTML = "<h3 style='margin-bottom:0.75rem;font-size:0.9rem'>Traffic Distribution</h3>";
  Object.entries(distribution).forEach(([instance, count]) => {
    const pct = max > 0 ? (count / max) * 100 : 0;
    chart.innerHTML += `
      <div class="bar-row">
        <span class="bar-label">${instance}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="bar-count">${count}</span>
      </div>`;
  });
}

// Forward Proxy — client sends request to proxy, proxy forwards to target
async function demoForwardProxy() {
  await fetchJSON("http://localhost:3128/proxy/load-balancer/api/info", "fp-result");
}

// API Gateway
async function fetchGateway(path, overrideKey) {
  const key = overrideKey || document.getElementById("api-key").value;
  await fetchJSON(`http://localhost:8083${path}`, "gw-result", {
    headers: { "X-API-Key": key },
  });
}

// CDN
const cdnLog = [];

async function fetchCDN(path, append = false) {
  const el = document.getElementById("cdn-result");
  el.textContent = "Loading…";

  try {
    const res = await fetch(`http://localhost:8084${path}`);
    const cacheStatus = res.headers.get("x-cache-status") || "UNKNOWN";
    const body = path.endsWith(".css") || path.endsWith(".js")
      ? await res.text()
      : await res.headers.get("content-type")?.includes("json")
        ? await res.json()
        : await res.text();

    const entry = { path, cacheStatus, timestamp: new Date().toISOString() };
    cdnLog.push(entry);
    updateCDNLog();

    const output = {
      path,
      cacheStatus,
      explanation: cacheStatus === "HIT"
        ? "Served from CDN edge cache (fast!)"
        : cacheStatus === "MISS"
          ? "Not in cache — fetched from origin, now cached"
          : "API/dynamic content — cache bypassed",
      body: typeof body === "string" && body.length > 200 ? body.slice(0, 200) + "…" : body,
    };

    if (append) {
      showResult("cdn-result", { ...output, note: "Second request should show HIT if within TTL" });
    } else {
      showResult("cdn-result", output);
    }
  } catch (err) {
    showResult("cdn-result", `Error: ${err.message}`, true);
  }
}

function updateCDNLog() {
  const logEl = document.getElementById("cdn-cache-log");
  logEl.innerHTML = "<h3 style='margin-bottom:0.5rem;font-size:0.85rem;color:var(--muted)'>Cache Log</h3>";
  cdnLog.slice(-8).reverse().forEach((e) => {
    const cls = e.cacheStatus === "HIT" ? "hit" : e.cacheStatus === "MISS" ? "miss" : "bypass";
    logEl.innerHTML += `<div class="cache-entry ${cls}">${e.timestamp.slice(11, 19)} | ${e.path} | <strong>${e.cacheStatus}</strong></div>`;
  });
}
