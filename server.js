const http = require("http");
const fs = require("fs");
const path = require("path");

/** Servidor estático simples. Para desenvolvimento com hot reload use: npm run dev (Vite). Para produção local após build: sirva a pasta dist/ (ex.: npx serve dist). */
const PORT = 8000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split("?")[0];
  const requestedPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const safePath = path.normalize(path.join(ROOT, requestedPath));

  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Acesso negado");
    return;
  }

  fs.readFile(safePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Arquivo nao encontrado");
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Agendixx rodando em http://localhost:${PORT}`);
});
