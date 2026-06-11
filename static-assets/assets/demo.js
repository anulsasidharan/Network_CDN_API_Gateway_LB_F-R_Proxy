// Demo script — served from CDN origin
(function () {
  window.CDN_DEMO = {
    version: "1.0.0",
    origin: "origin-server",
    message: "This JavaScript file is cached at the CDN edge after first request",
    loadedAt: new Date().toISOString(),
  };
  console.log("[CDN Demo] demo.js loaded from origin/CDN edge");
})();
