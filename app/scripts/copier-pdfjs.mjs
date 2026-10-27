import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(racine, "public", "pdfjs", version);
await mkdir(destination, { recursive: true });
await cp(join(source, "build/pdf.worker.min.mjs"), join(destination, "pdf.worker.min.mjs"));
for (const dossier of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(join(source, dossier), join(destination, dossier), { recursive: true });
}
await cp(join(source, "LICENSE"), join(destination, "LICENSE"));
console.log(`PDF.js ${version} : ressources locales prêtes.`);
