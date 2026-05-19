const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec, spawnSync } = require("child_process");
const PORT = 80;
const ROUTES_FILE = path.join(__dirname, "src/routes.json");
const bunPath = process.env.BUN_PATH || 'bun';

console.clear(); //[TheFlagen430297] If you don't know what this is... I can't help you XD JK

let packageManager
function checkPackageManager(manager) { const result = spawnSync(manager, ['--version'], { shell: true, stdio: 'ignore' }); return result.status === 0; }
if (checkPackageManager(bunPath)) packageManager = `"${bunPath}" add`;
else if (checkPackageManager('npm')) packageManager = 'npm install';
else { console.log('No known package managers are installed, please install Bun or npm.'); process.exit(1); }


if (!fs.existsSync(path.join(__dirname, `src/ProxyConfig.json`))) {
  console.clear();
  console.log(`=+=+=+=+=+=+=+=+=+=+=+=+=\n  Welcome to FES Proxy!\n=+=+=+=+=+=+=+=+=+=+=+=+=\n\nThis is the server's first start.\nSetting up needed files and downloading dependencies... This may take a moment.`);
  exec(`${packageManager} http-proxy flaggedapi express tcp-port-used`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error installing dependencies: ${error.message}`);
      return;
    }
    fs.mkdirSync(path.join(__dirname, `src`), { recursive: true });
    fs.writeFileSync(path.join(__dirname, `src/ProxyConfig.json`), JSON.stringify({ "log_timestamps": false, "advanced_logging": false }, null, 2));
    fs.writeFileSync(path.join(__dirname, `src/routes.json`), JSON.stringify({ "defaultTarget": null, "domains": { "localhost": { "ip": "127.0.0.1", "port": 82 }, "example.com": { "ip": "127.0.0.1", "port": 3000 } } }, null, 2));
    console.log(`Setup complete! Please edit src/routes.json to configure your proxy routes, then restart the server.`); 
    process.exit(0);
  });
} else StartService();


function StartService() {
  const { log } = require(`flaggedapi`);
  let ProxyConfig = require("./src/ProxyConfig.json");
  const httpProxy = require("http-proxy");
  /**The **tcp-port-used** library*/
  const { check } = require('tcp-port-used');
  let routeConfig = loadRoutes();
  const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true, changeOrigin: false });

  const express = require("express");
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
    } else if (req.path === `/assign`) {
      const params = req.query;
      let routes = require("./src/routes.json");
      if(!params.domain) {
        res.status(400).json({ status: 400, message: "Missing 'domain' query parameter" });
        return;
      }
      
      if (loadRoutes().domains[params.domain]) { log(`The Server for the Domain ${params.domain} is online`, { type: `success` }); res.status(200).json({ status: 200, port: routes.domains[params.domain].port }); return; }
      function FindOpenPort(ip) { 
        let port = params?.port ? parseInt(params.port) : 7000;
        return new Promise((resolve , reject) => {
          let usedPorts = []
          Object.values(routes.domains).forEach(route => {usedPorts.push(route.port)});
            loop();
            function loop() {
                check(port, ip).then(inUse => {
                  if (usedPorts.includes(port)) return reject(`Port ${port} is already assigned to another domain, and therefore cannot be used for this assignment.`);
                  if(inUse && params.port) return reject(`Port ${port} is already in use, and since you specified a port, the route assignment has been cancelled.`);
                  if (inUse) { port++; loop(); }
                  else resolve(port);
                }).catch(Error => {
                  console.error(Error);
                  reject(`There was an unexpected error, and therefore, the server was closed.`);
                });
            };
        }); 
      }

      FindOpenPort(`127.0.0.1`).then(port => {
        routes.domains[params.domain] = { ip: "127.0.0.1", port: port };
        fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
        res.status(200).json({ port: port, status: 200, message: `Domain assigned to port ${port}` });
        log(`Assigned domain ${params.domain} to port ${port}`, { type: `success` });
      }).catch(err => {
        proxyLog(`Error finding open port: ${err}`);
        res.status(500).json({ status: 500, message: `Internal Server Error: ${err}` });
      });

    } else {
      res.status(404).json({ status: 404, message: "Not Found" });
    }
  });
  app.listen(81, () => { log("API Endpoint opened on port 81", { type: `info`}); }).on("error", (err) => { proxyLog(`API endpoint error: ${err.message}`); });

  
  function proxyLog(message) { log(`${ProxyConfig.log_timestamps ? `[${new Date().toISOString()}] ` : ``}${message}`); }
  
  function loadRoutes() {
    try {
      const raw = fs.readFileSync(ROUTES_FILE, "utf8");
      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("routes.json must be a valid object");
      if (!parsed.domains || typeof parsed.domains !== "object" || Array.isArray(parsed.domains)) { throw new Error('routes.json must contain a "domains" object'); };

      const normalizedDomains = {};

      for (const [domain, value] of Object.entries(parsed.domains)) {
        if (typeof value === "string") { normalizedDomains[domain] = value; continue; }
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Domain "${domain}" must be a string or an object with ip and port`);

        const { ip, port } = value;

        if (typeof ip !== "string" || !ip.trim()) throw new Error(`Domain "${domain}" is missing a valid ip`);
        if ((typeof port !== "number" && typeof port !== "string") || String(port).trim() === "") throw new Error(`Domain "${domain}" is missing a valid port`);

        normalizedDomains[domain] = `http://${ip}:${port}`;
      }

      let defaultTarget = parsed.defaultTarget;

      if (defaultTarget && typeof defaultTarget === "object" && !Array.isArray(defaultTarget)) {
        const { ip, port } = defaultTarget;

        if (typeof ip !== "string" || !ip.trim()) throw new Error('defaultTarget is missing a valid ip');
        if ((typeof port !== "number" && typeof port !== "string") ||String(port).trim() === "") throw new Error('defaultTarget is missing a valid port');

        defaultTarget = `http://${ip}:${port}`;
      }

      log("Routes loaded successfully.");

      return {
        defaultTarget: defaultTarget ?? null,
        domains: normalizedDomains
      };
    } catch (error) { log(`Failed to load routes.json: ${error.message}`); return { defaultTarget: null, domains: {} }; };
  };
  
  function getHostname(req) {
    const hostHeader = req.headers.host;
    if (!hostHeader || typeof hostHeader !== "string") return null;
    return hostHeader.split(":")[0].trim().toLowerCase();
  }
  
  function getTarget(hostname) {
    if (!hostname) return routeConfig.defaultTarget || null;
    return routeConfig.domains[hostname] || routeConfig.defaultTarget || null;
  }
  
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
    const hostname = getHostname(req);
    const target = getTarget(hostname);
    if (!target) { proxyLog(`No route found for domain: ${hostname}`); return send404(res, hostname); }
    proxy.web(req, res, { target });
  });
  
  server.on("upgrade", (req, socket, head) => {
    const hostname = getHostname(req);
    const target = getTarget(hostname);

    if (!target) {
      proxyLog(`No WebSocket route found for domain: ${hostname}`);
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    proxy.ws(req, socket, head, {
      target
    });
  });
  
  server.listen(PORT, () => { log(`Proxy server is running on port ${PORT}`, { type: `success` }) }).on("error", (err) => { log(`${err.message}`, { type: "error", color: "F00"}); process.exit(1);});
  
  fs.watchFile(ROUTES_FILE, { interval: 1000 }, () => { proxyLog("Detected change in routes.json, reloading..."); routeConfig = loadRoutes(); });
  fs.watchFile(path.join(__dirname, `src/ProxyConfig.json`), { interval: 1000 }, () => { proxyLog("Detected change in ProxyConfig.json, reloading..."); ProxyConfig = JSON.parse(fs.readFileSync(path.join(__dirname, `src/ProxyConfig.json`), "utf8")); proxyLog("ProxyConfig reloaded.");});
}
