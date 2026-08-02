import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(join(root, "public", "icons", "icon.svg"));
const outputs = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
];

await Promise.all(outputs.map(([name, size]) => sharp(source).resize(Number(size), Number(size)).png({ compressionLevel: 9 }).toFile(join(root, "public", "icons", String(name)))));
console.log(`Generated ${outputs.length} PWA icons.`);
