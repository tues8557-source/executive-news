import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const cacheRoot = resolveCacheRoot();

function resolveCacheRoot() {
  if (process.env.CACHE_DIR) {
    return process.env.CACHE_DIR;
  }

  if (process.env.VERCEL) {
    return "";
  }

  return join(process.cwd(), ".cache", "executive-news");
}

function cacheFilePath(namespace, key) {
  if (!cacheRoot) return "";
  const digest = createHash("sha1").update(key).digest("hex");
  return join(cacheRoot, namespace, `${digest}.json`);
}

export async function readPersistentCache(namespace, key) {
  const filePath = cacheFilePath(namespace, key);
  if (!filePath) return null;

  try {
    const payload = JSON.parse(await readFile(filePath, "utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.expiresAt !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function writePersistentCache(namespace, key, data, ttlMs) {
  const filePath = cacheFilePath(namespace, key);
  if (!filePath) return;

  const payload = JSON.stringify({
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    data,
  });

  const tempPath = `${filePath}.tmp`;

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, filePath);
  } catch {
    // Disk persistence is best-effort.
  }
}
