const express = require("express");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || "backend";
const ROLE = process.env.ROLE || "app";
const hostname = os.hostname();
const INSTANCE_ID = process.env.INSTANCE_ID || hostname.slice(-4);

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-API-Key, Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function buildMeta(req) {
  return {
    service: SERVICE_NAME,
    instanceId: INSTANCE_ID,
    role: ROLE,
    hostname,
    timestamp: new Date().toISOString(),
    clientIp: req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.ip,
    via: req.headers["via"] || null,
    forwardedFor: req.headers["x-forwarded-for"] || null,
    forwardedHost: req.headers["x-forwarded-host"] || null,
    userAgent: req.headers["user-agent"] || null,
    path: req.path,
    method: req.method,
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME, instanceId: INSTANCE_ID, hostname });
});

app.get("/api/info", (req, res) => {
  res.json({
    message: `Response from ${SERVICE_NAME} (instance ${INSTANCE_ID})`,
    component: "backend",
    meta: buildMeta(req),
  });
});

app.get("/api/users", (req, res) => {
  res.json({
    service: "users-service",
    data: [
      { id: 1, name: "Alice Chen", plan: "pro" },
      { id: 2, name: "Bob Rivera", plan: "free" },
      { id: 3, name: "Carol Singh", plan: "enterprise" },
    ],
    meta: buildMeta(req),
  });
});

app.get("/api/products", (req, res) => {
  res.json({
    service: "products-service",
    data: [
      { id: 101, name: "Wireless Headphones", price: 79.99 },
      { id: 102, name: "Mechanical Keyboard", price: 129.99 },
      { id: 103, name: "4K Monitor", price: 349.99 },
    ],
    meta: buildMeta(req),
  });
});

app.get("/api/orders", (req, res) => {
  res.json({
    service: "orders-service",
    data: [
      { id: 9001, userId: 1, total: 209.98, status: "shipped" },
      { id: 9002, userId: 2, total: 79.99, status: "processing" },
    ],
    meta: buildMeta(req),
  });
});

app.get("/api/slow", (_req, res) => {
  setTimeout(() => {
    res.json({ message: "Slow endpoint responded after 2 seconds", delayMs: 2000 });
  }, 2000);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SERVICE_NAME} [${hostname}] listening on port ${PORT}`);
});
