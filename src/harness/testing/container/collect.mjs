import { readdir, lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export async function collectFiles(root, totalLimit, fileLimit) {
  const files = []; let total = 0;
  async function collect(directory, prefix = "") {
    for (const name of (await readdir(directory)).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (!/^[a-zA-Z0-9_./@-]+$/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Unsafe output path");
      const absolute = join(directory, name); const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error("Output symlink rejected");
      if (info.isDirectory()) { await collect(absolute, path); continue; }
      if (!info.isFile() || info.size > fileLimit || files.length >= 2000) throw new Error("Output limit exceeded");
      const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      let data;
      try {
        const actual = await handle.stat();
        if (!actual.isFile() || actual.size > fileLimit) throw new Error("Output changed while reading");
        const buffer = Buffer.alloc(fileLimit + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const result = await handle.read(buffer, offset, buffer.length - offset, offset);
          if (!result.bytesRead) break;
          offset += result.bytesRead;
        }
        if (offset > fileLimit) throw new Error("Output exceeds file limit");
        data = buffer.subarray(0, offset);
      } finally { await handle.close(); }
      total += data.length;
      if (total > totalLimit) throw new Error("Output exceeds total limit");
      files.push({ path, data: data.toString("base64") });
    }
  }
  await collect(root);
  return files;
}
