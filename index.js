const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec, spawnSync } = require("child_process");

const PORT = 80;
const ROUTES_FILE = path.join(__dirname, "src/routes.json");
const PROXY_CONFIG_FILE = path.join(__dirname, "src/ProxyConfig.json");
const BUNPATH = process.env.BUN_PATH || "bun";

console.clear(); //[TheFlagen430297] If you don't know what this is... I can't help you XD JK

let packageManager;

function checkPackageManager(manager) { const result = spawnSync(manager, ["--version"], { shell: true, stdio: "ignore" }); return result.status === 0; }

if (checkPackageManager(BUNPATH)) packageManager = `"${BUNPATH}" add`;
else if (checkPackageManager('npm')) packageManager = 'npm install';
else { console.log('No known package managers are installed, please install Bun or npm.'); process.exit(1); }


if (!fs.existsSync(PROXY_CONFIG_FILE)) {
  console.clear();
  console.log(`=+=+=+=+=+=+=+=+=+=+=+=+=\n  Welcome to FES Proxy!\n=+=+=+=+=+=+=+=+=+=+=+=+=\n\nThis is the server's first start.\nSetting up needed files and downloading dependencies... This may take a moment.`);

  exec(`${packageManager} http-proxy flaggedapi express tcp-port-used`, (error, stdout, stderr) => {
    if (error) return console.error(`Error installing dependencies: ${error.message}`);
    fs.mkdirSync(path.join(__dirname, "src"), { recursive: true });
    fs.writeFileSync(PROXY_CONFIG_FILE, JSON.stringify({ "log_timestamps": false, "advanced_logging": false }, null, 2));

    fs.writeFileSync(ROUTES_FILE, JSON.stringify(
      {
        "defaultTarget": null,
        "domains": {
          "localhost": {
            "ip": "127.0.0.1",
            "port": 82
          },
          "example.com": {
            "ip": null,
            "port": 3000
          }
        }
      }, null, 2)
    );

    console.log("Setup complete! Please edit src/routes.json to configure your proxy routes, then restart the server.");
    process.exit(0);
  });
} else StartService();

function StartService() {

  /** The **FlaggedAPI** library */
  const { log } = require("flaggedapi");

  /** The **Proxy Config** file */
  let ProxyConfig = require("./src/ProxyConfig.json");

  /** The **http-proxy** library */
  const proxy = require("http-proxy").createProxyServer({ xfwd: true, ws: true, changeOrigin: false });

  /** The **Express** framework */
  const express = require("express");

  /** The **tcp-port-used** library */
  const { check } = require("tcp-port-used");

  /** The **Routes** configuration */
  let routeConfig = loadRoutes();

  /** The **Express** application */
  const app = express();

  app.use((req, res) => {
    if (req.path === "/status") {
      const uptime = process.uptime();

      res.status(200).json({
        status: 200,
        type: "FES Proxy",
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        routes: Object.keys(routeConfig.domains).length,
        defaultTarget: routeConfig.defaultTarget || "None"
      });
    } else if (req.path === "/assign") {
      const params = req.query;
      const routes = readRoutesFile();

      if (!params.domain) return res.status(400).json({ status: 400, message: "Missing 'domain' query parameter" });

      const domain = String(params.domain).trim().toLowerCase();
      const existingRoute = routes.domains[domain];
      const incomingIP = params.serverInternalIP;
      const assignedIP = getRouteIP(existingRoute, incomingIP);

      function FindOpenPort(ip) {
        let port = params?.port ? parseInt(params.port) : 7000;

        if (Number.isNaN(port)) return Promise.reject("Invalid 'port' query parameter");

        return new Promise((resolve, reject) => {
          const usedPorts = [];

          Object.entries(routes.domains).forEach(([routeDomain, route]) => {
            if (routeDomain === domain) return;
            if (route?.port) usedPorts.push(Number(route.port));
          });

          loop();

          function loop() {
            check(port, ip)
              .then(inUse => {
                if (usedPorts.includes(port)) return reject(`Port ${port} is already assigned to another domain, and therefore cannot be used for this assignment.`);
                if (inUse && params.port) return reject(`Port ${port} is already in use, and since you specified a port, the route assignment has been cancelled.`);

                if (inUse) { port++; loop(); }
                else resolve(port);
              })
              .catch(error => { console.error(error); reject("There was an unexpected error, and therefore, the server was closed."); });
          }
        });
      }

      // Existing route behavior:
      // 1. If routes.json already has an IP, keep it.
      // 2. If routes.json has no IP, use the incoming server IP.
      // 3. If both are empty, use 127.0.0.1.
      if (existingRoute) {
        const finalPort = existingRoute.port || (params?.port ? parseInt(params.port) : 7000);

        if (Number.isNaN(Number(finalPort))) return res.status(400).json({ status: 400, message: "Invalid route port" });

        routes.domains[domain] = { ...existingRoute, ip: assignedIP, port: Number(finalPort) };

        fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
        routeConfig = loadRoutes();

        log(`The Server for the Domain ${domain} is online at ${assignedIP}:${finalPort}`, { type: "success" });

        return res.status(200).json({ status: 200, ip: assignedIP, port: Number(finalPort), message: `Existing domain using ${assignedIP}:${finalPort}` });
      }

      FindOpenPort(assignedIP)
        .then(port => {
          routes.domains[domain] = { ip: assignedIP, port: port };

          fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
          routeConfig = loadRoutes();

          res.status(200).json({ status: 200, ip: assignedIP, port: port, message: `Domain assigned to ${assignedIP}:${port}` });
          log(`Assigned domain ${domain} to ${assignedIP}:${port}`, { type: "success" });
        })
        .catch(err => {
          proxyLog(`Error finding open port: ${err}`);

          res.status(500).json({
            status: 500,
            message: `Internal Server Error: ${err}`
          });
        });
    } else res.status(404).json({ status: 404, message: "Not Found" });
  });

  app.listen(81, () => { log("API Endpoint opened on port 81", { type: "info" }); }).on("error", err => { proxyLog(`API endpoint error: ${err.message}`); });

  function proxyLog(message) { log(`${ProxyConfig.log_timestamps ? `[${new Date().toISOString()}] ` : ""}${message}`); }

  function readRoutesFile() {
    try {
      const raw = fs.readFileSync(ROUTES_FILE, "utf8");
      const parsed = JSON.parse(raw);

      if (!parsed.defaultTarget) parsed.defaultTarget = null;
      if (!parsed.domains || typeof parsed.domains !== "object" || Array.isArray(parsed.domains)) parsed.domains = {};

      return parsed;
    } catch (error) {
      proxyLog(`Failed to read routes.json: ${error.message}`);
      return { defaultTarget: null, domains: {} };
    }
  }

  function isValidIPv4(ip) { if (typeof ip !== "string") return false; return /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(ip.trim()); }

  function getRouteIP(route, incomingIP) {
    // 1. IP from routes.json wins no matter what.
    if (route?.ip && isValidIPv4(route.ip)) return route.ip.trim();

    // 2. IP sent by the incoming server.
    if (incomingIP && isValidIPv4(String(incomingIP))) return String(incomingIP).trim();

    // 3. Default fallback.
    return "127.0.0.1";
  }

  function loadRoutes() {
    try {
      const raw = fs.readFileSync(ROUTES_FILE, "utf8");
      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("routes.json must be a valid object");
      if (!parsed.domains || typeof parsed.domains !== "object" || Array.isArray(parsed.domains)) throw new Error('routes.json must contain a "domains" object');

      const normalizedDomains = {};

      for (const [domain, value] of Object.entries(parsed.domains)) {
        if (typeof value === "string") {
          normalizedDomains[domain] = value;
          continue;
        }

        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Domain "${domain}" must be a string or an object with ip and port`);

        const { ip, port } = value;

        // This allows ip to be null/undefined/empty in routes.json.
        // When that happens, routing falls back to 127.0.0.1.
        const finalIP = ip && typeof ip === "string" && ip.trim() ? ip.trim() : "127.0.0.1";

        if (!isValidIPv4(finalIP)) throw new Error(`Domain "${domain}" has an invalid ip`);

        if ((typeof port !== "number" && typeof port !== "string") || String(port).trim() === "") throw new Error(`Domain "${domain}" is missing a valid port`);
        normalizedDomains[domain] = `http://${finalIP}:${port}`;
      }

      let defaultTarget = parsed.defaultTarget;

      if (defaultTarget && typeof defaultTarget === "object" && !Array.isArray(defaultTarget)) {
        const { ip, port } = defaultTarget;
        const finalDefaultIP = ip && typeof ip === "string" && ip.trim() ? ip.trim() : "127.0.0.1";

        if (!isValidIPv4(finalDefaultIP)) throw new Error("defaultTarget has an invalid ip");

        if ((typeof port !== "number" && typeof port !== "string") || String(port).trim() === "") throw new Error("defaultTarget is missing a valid port");

        defaultTarget = `http://${finalDefaultIP}:${port}`;
      }

      log("Routes loaded successfully.");

      return { defaultTarget: defaultTarget ?? null, domains: normalizedDomains };
    } catch (error) {
      log(`Failed to load routes.json: ${error.message}`);
      return { defaultTarget: null, domains: {} };
    }
  }

  function getHostname(req) { const hostHeader = req.headers.host; if (!hostHeader || typeof hostHeader !== "string") return null; return hostHeader.split(":")[0].trim().toLowerCase(); }

  function getTarget(hostname) { if (!hostname) return routeConfig.defaultTarget || null; return routeConfig.domains[hostname] || routeConfig.defaultTarget || null; }

  function send404(res, hostname) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: 404, message: `The domain "${hostname || "unknown"}" does not exist on this proxy` }, null, 2));
  }

  function handleProxyError(err, req, res, target) {
    proxyLog(`Proxy error for ${req.method} ${req.url} -> ${target}: ${err.message}`);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: 502, message: "Bad Gateway", error: err.message }, null, 2));
  }

  proxy.on("error", handleProxyError);

  proxy.on("proxyReq", (proxyReq, req, res, options) => {
    const hostname = getHostname(req);
    proxyReq.setHeader("X-Forwarded-Host", req.headers.host || "");
    proxyReq.setHeader("X-Forwarded-Proto", "http");
    proxyReq.setHeader("X-Proxy-By", "FES Proxy");
    ProxyConfig.advanced_logging ? proxyLog(`HTTP ${req.method} ${hostname}${req.url} -> ${options.target}`) : null;
  });

  const server = http.createServer((req, res) => {
    let hostname = /^(?:[a-zA-Z0-9-]+\.)+([a-zA-Z0-9-]+\.[a-zA-Z]{2,})$/;
    hostname.test(getHostname(req)) ? hostname = hostname.exec(getHostname(req))?.[1] : hostname = getHostname(req);

    const target = getTarget(hostname);

    if (!target) {
      ProxyConfig.advanced_logging ? proxyLog(`No route found for domain: ${hostname}`) : null;
      return send404(res, hostname);
    }

    proxy.web(req, res, { target });
  });

  server.on("upgrade", (req, socket, head) => {
    let hostname = /^(?:[a-zA-Z0-9-]+\.)+([a-zA-Z0-9-]+\.[a-zA-Z]{2,})$/;
    hostname.test(getHostname(req)) ? hostname = hostname.exec(getHostname(req))?.[1] : hostname = getHostname(req);

    const target = getTarget(hostname);

    if (!target) {
      ProxyConfig.advanced_logging ? proxyLog(`No WebSocket route found for domain: ${hostname}`) : null;
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    proxy.ws(req, socket, head, { target });
  });

  server.listen(PORT, () => {
    log(`Proxy server is running on port ${PORT}`, { type: "success" });
  }).on("error", err => {
    log(`${err.message}`, { type: "error", color: "F00" });
    process.exit(1);
  });

  fs.watchFile(ROUTES_FILE, { interval: 1000 }, () => {
    proxyLog("Detected change in routes.json, reloading...");
    routeConfig = loadRoutes();
  });

  fs.watchFile(PROXY_CONFIG_FILE, { interval: 1000 }, () => {
    proxyLog("Detected change in ProxyConfig.json, reloading...");
    ProxyConfig = JSON.parse(fs.readFileSync(PROXY_CONFIG_FILE, "utf8"));
    proxyLog("ProxyConfig reloaded.");
  });
}