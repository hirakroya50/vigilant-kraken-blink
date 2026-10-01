import { createServer } from "node:http";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join } from "node:path";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
createServer(async (request, response) => {
  let path;
  try { path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1); } catch { response.writeHead(400).end(); return; }
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
  if (path.split("/").some(part => part === "." || part === "..") || path.includes("\\") || path.includes("\0")) { response.writeHead(400).end(); return; }
  if (!path || !extname(path)) path = "index.html";
  let handle;
  try {
    handle = await open(join("/artifact", path), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    if (request.method === "HEAD") response.end();
    else response.end(await handle.readFile());
  } catch { response.writeHead(404).end(); }
  finally { if (handle) await handle.close(); }
}).listen(4173, "127.0.0.1");
