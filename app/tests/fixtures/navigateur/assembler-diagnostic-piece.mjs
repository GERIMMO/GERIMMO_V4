/**
 * Assemble le même banc que le test navigateur, pour une recette via CUA.
 * Aucun navigateur n'est lancé, aucune connexion à la base ni aucun transfert.
 * Usage : node tests/fixtures/navigateur/assembler-diagnostic-piece.mjs /tmp/banc-diagnostic
 * Puis servir le dossier et ouvrir /espace/test/diagnostics/?controle=1.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sortie = resolve(process.argv[2] ?? "/tmp/gerimmo-banc-diagnostic");
const qualification = process.argv[3] === "qualification";
const page = qualification ? "qualifications" : "diagnostics";
const paquet = await rolldown({
  input: resolve(racine, `tests/fixtures/navigateur/banc-${qualification ? "qualification-diagnostics" : "diagnostic-piece"}.tsx`),
  platform: "browser",
  plugins: [{
    name: "actions-parc-neutres",
    resolveId: id => qualification && ["@/app/actions/parc", "@/app/actions/qualification-diagnostic", "@/app/actions/classe-dpe-lot"].includes(id)
      ? resolve(racine, "tests/fixtures/navigateur/actions-diagnostics-controle.ts")
      : id === "@/app/actions/parc" ? resolve(racine, "tests/fixtures/navigateur/actions-parc-neutre.ts")
      : id.endsWith("depot-direct-client") ? "\0transfert-isole" : id.endsWith(".module.css") ? "\0styles-controle" : null,
    load: id => id === "\0transfert-isole"
      ? "export async function preparerDepotsDirects() {} export class ErreurDepotDirect extends Error {}"
      : id === "\0styles-controle" ? "export default new Proxy({}, {get: (_, cle) => cle});" : null,
  }],
  resolve: { alias: {
    "@": resolve(racine, "src"),
    "next/navigation": resolve(racine, "tests/fixtures/navigateur/next-navigation-neutre.ts"),
  } },
  transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } },
  logLevel: "silent",
});
try {
  const { output } = await paquet.generate({ format: "iife" });
  const styles = qualification ? (await readFile(resolve(racine, "src/app/agence/[orgId]/parc/[bienId]/lignes-diagnostics.module.css"), "utf8")).replaceAll(/:global\(([^)]+)\)/g, "$1") : "";
  await mkdir(resolve(sortie, `espace/test/${page}`), { recursive: true });
  await writeFile(resolve(sortie, "banc.js"), output[0].code);
  await writeFile(resolve(sortie, `espace/test/${page}/index.html`), `<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contrôle local du dépôt de diagnostic</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;color:#172b3a;background:#f5f7fa;margin:24px auto;max-width:860px;padding:0 16px}
:root{--trait:#d8e0e4;--surface:#fff;--texte-secondaire:#526574;--filet-leger:#edf1f4;--success-soft-foreground:#285943;--border:#d8e0e4}
fieldset,form{border:1px solid #cbd5df;border-radius:12px;background:white;padding:20px;margin:16px 0}
fieldset{display:flex;flex-wrap:wrap;gap:12px}button,input,select{font:inherit;min-height:40px;padding:6px 10px;border:1px solid #aebec9;border-radius:6px}
button{cursor:pointer;background:#eff5f9}label{display:block;margin:6px 0}form>div,details{margin:14px 0}input[type=date]{display:block}
input[type=checkbox]{min-height:auto}output{margin:0 12px}summary{cursor:pointer}p{font-size:14px;color:#536575}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
[role=alert]{color:#a1222d}[role=status]{color:#216543}
${styles}
ul{padding-left:0;list-style:none}form fieldset{margin:0;padding:0;border:0;display:block}.controle{font-size:13px}button,a{min-height:44px}.journal{margin-top:28px}.journal pre{font-size:12px;white-space:pre-wrap}
</style><body><h1>Contrôle local du dépôt</h1><p>Vrai formulaire et protection de saisie ; réponse simulée, aucun enregistrement.</p>
<main id="racine"></main><script src="/banc.js"></script></body></html>`);
  process.stdout.write(`${JSON.stringify({ dossier: sortie, chemin: `/espace/test/${page}/?controle=1` })}\n`);
} finally {
  await paquet.close();
}
