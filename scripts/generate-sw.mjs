import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const rootPath = fileURLToPath(root);
const distPath = fileURLToPath(dist);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  }));
  return nested.flat();
}

const all = await files(distPath);
const shell = all
  .filter((file) => /\.(?:html|js|css|png|svg|webmanifest)$/.test(file))
  .map((file) => `/BarveGurujiAi/${relative(distPath, file).replaceAll("\\", "/")}`)
  .filter((url) => !url.endsWith("/sw.js"));

const source = `
const VERSION = ${JSON.stringify(pkg.version)};
const CACHE = \`barve-guruji-static-\${VERSION}\`;
const BASE = "/BarveGurujiAi/";
const APP_SHELL = ${JSON.stringify(shell, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("barve-guruji-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.hostname.endsWith("googleapis.com")) return;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === "navigate" || url.pathname === BASE || url.pathname.endsWith("/index.html")) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(BASE, response.clone()));
      return response;
    }).catch(() => caches.match(BASE).then((cached) => cached || caches.match(\`\${BASE}index.html\`)).then((cached) => cached || Response.error())));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    });
    return cached || network;
  }));
});
`;

await writeFile(join(distPath, "sw.js"), source.trimStart());
console.log(`Generated scoped service worker ${pkg.version} with ${shell.length} assets from ${rootPath}.`);
