# 🧠 FES Proxy
### Domain-Based Reverse Proxy for Full Express Server

FES Proxy is a lightweight reverse proxy built to allow multiple **FES (Full Express Server)** instances to run on a single IP using standard ports like **80** and **443**.

Instead of accessing servers with ports like `:3000` or `:81`, FES Proxy routes incoming traffic based on the **domain name** and forwards it to the correct backend server.

---

## 🚀 How It Works

```text
cooldomain.com  ─┐
dumbdomain.com  ─┼──> Proxy Server (port 80) ───> Backend FES instances
another.com     ─┘
```

### Flow:
1. A user visits `cooldomain.com`
2. DNS points the domain to your proxy server IP
3. The proxy receives the request on port `80`
4. The proxy reads the `Host` header
5. It matches the domain in `routes.json`
6. It forwards the request to the correct backend server
7. The response is returned to the client

---

## 📦 Installation

```bash
git clone https://github.com/YourUsername/FES-Proxy
cd FES-Proxy
npm install
npm start
```

> ⚠️ Port `80` may require admin/root privileges:
```bash
sudo npm start
```

---

## ⚙️ Configuration

### `routes.json`

```json
{
  "defaultTarget": null,
  "domains": {
    "cooldomain.com": {
      "ip": "127.0.0.1",
      "port": 3001
    },
    "dumbdomain.com": {
      "ip": "127.0.0.1",
      "port": 3002
    }
  }
}
```

---

### 🔑 Config Options

| Key | Description |
|-----|------------|
| `defaultTarget` | Fallback server if domain is not found |
| `domains` | Domain → backend mapping |

Each domain maps to:

```json
{
  "ip": "127.0.0.1",
  "port": 3000
}
```

---

## 🌐 Example Setup

### DNS Records

| Domain | Points To |
|--------|----------|
| `cooldomain.com` | `YOUR_SERVER_IP` |
| `dumbdomain.com` | `YOUR_SERVER_IP` |

---

### Backend Servers

```bash
FES Instance A → 127.0.0.1:3001
FES Instance B → 127.0.0.1:3002
```

---

### Result

| URL | Served By |
|-----|----------|
| `http://cooldomain.com` | FES Server on port 3001 |
| `http://dumbdomain.com` | FES Server on port 3002 |

---

## 🔌 Features

- ✅ Domain-based routing (Host header)
- ✅ Multiple FES instances on one IP
- ✅ No port exposure to clients
- ✅ WebSocket support
- ✅ Hot reload of `routes.json`
- ✅ Default fallback server
- ✅ Lightweight and fast

---

## 🔒 Security Notes

- Backend servers should **only listen on localhost (`127.0.0.1`)**
- Do NOT expose backend ports publicly
- Proxy should be the only public-facing service

---

## ⚠️ Known Limitations

- No built-in HTTPS (yet)
- No load balancing (1 domain → 1 target)

---

## 🛣️ Roadmap

- 🔐 HTTPS support (Let's Encrypt / TLS)
- 🧠 Smart routing / load balancing
- 🔄 Auto-start / service integration

---

## 💡 Notes for FES Users

FES Proxy integrates cleanly with FES:

- FES can auto-detect the proxy (via `/status`)
- Proxy can assign ports dynamically
- Works with subdomains and main domains

---

## 🧑‍💻 Development

Edit `routes.json` while running — it will auto-reload.

---

## 📄 License

MIT License