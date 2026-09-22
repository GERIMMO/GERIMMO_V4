import { writeFile, appendFile, mkdir } from "node:fs/promises";
import { controlerPublication, optionsValides } from "./controle.mjs";

const env = process.env;
const o = optionsValides({ sha: env.RELEASE_SHA || "", deploymentId: env.RELEASE_DEPLOYMENT_ID || "", ciRunId: env.RELEASE_CI_RUN_ID || "", repository: env.GITHUB_REPOSITORY || "", projectId: env.VERCEL_PROJECT_ID || "", productionOrigin: env.GERIMMO_PRODUCTION_ORIGIN || "https://www.gerimmo.app", publish: env.RELEASE_PUBLISH === "true", databaseCompatible: env.RELEASE_DATABASE_COMPATIBLE === "true" });
if (env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch") throw new Error("Ce contrôle doit être lancé manuellement depuis la branche principale.");
if (!env.VERCEL_TOKEN || !env.GITHUB_TOKEN || env.GERIMMO_RELEASE_ENABLED !== "true") throw new Error("La connexion du contrôle de publication n’est pas activée.");
const team = env.VERCEL_TEAM_ID || "";
if (team && !/^team_[A-Za-z0-9]+$/.test(team)) throw new Error("Équipe Vercel invalide.");

async function json(url, headers, method = "GET") {
  const response = await fetch(url, { method, headers, redirect: "error", signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) throw new Error(`Le service de publication n’a pas confirmé l’opération (${response.status}).`);
  return response.status === 204 ? {} : response.json();
}
const gh = path => json(`https://api.github.com/repos/${o.repository}/${path}`, { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const vercel = (path, method) => {
  const u = new URL(path, "https://api.vercel.com");
  if (u.origin !== "https://api.vercel.com") throw new Error("Adresse du prestataire refusée.");
  if (team) u.searchParams.set("teamId", team);
  return json(u, { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, method);
};
let rapport;
const ports = {
  ci: id => gh(`actions/runs/${id}`),
  workflow: () => gh("actions/workflows/ci.yml"),
  onMain: async sha => ["ahead", "identical"].includes((await gh(`compare/${sha}...main`)).status),
  deployment: id => vercel(`/v13/deployments/${id}`),
  current: async () => {
    const a = await vercel(`/v4/aliases/${new URL(o.productionOrigin).hostname}`);
    if (a.projectId !== o.projectId || a.redirect || !/^dpl_[A-Za-z0-9]{8,80}$/.test(a.deploymentId)) throw new Error("L’adresse publique ne pointe pas directement vers le projet attendu.");
    return a.deploymentId;
  },
  approvalConfigured: async () => {
    const e = await gh("environments/gerimmo-production");
    return e.protection_rules?.some(r => r.type === "required_reviewers" && r.reviewers?.length > 0 && r.prevent_self_review === true) && e.deployment_branch_policy?.protected_branches === true;
  },
  health: async (origin, publicSite) => {
    try {
      const h = new URL(origin);
      if (publicSite ? h.origin !== new URL(o.productionOrigin).origin : !/^[a-z0-9-]+\.vercel\.app$/.test(h.hostname)) return null;
      const headers = { "Cache-Control": "no-cache" };
      if (!publicSite && env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const healthUrl = new URL("/api/sante", h);
      healthUrl.searchParams.set("controle", `${env.GITHUB_RUN_ID || "local"}-${Date.now()}`);
      return await json(healthUrl, headers);
    } catch { return null; }
  },
  promote: id => vercel(`/v10/projects/${o.projectId}/promote/${id}`, "POST"),
  rollback: id => vercel(`/v1/projects/${o.projectId}/rollback/${id}`, "POST"),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  report: r => { rapport = structuredClone(r); },
};
const result = await controlerPublication(o, ports);
await mkdir("publication-resultats", { recursive: true });
await writeFile("publication-resultats/rapport.json", JSON.stringify(rapport, null, 2));
const resume = `## Contrôle de publication Gerimmo\n\nRévision : ${o.sha}\n\nRésultat : ${result.etat}\n\n${result.controles.map(c => `- ${c}`).join("\n")}\n`;
await writeFile("publication-resultats/rapport.md", resume);
if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, resume);
console.log(`Contrôle terminé : ${result.etat}. Rapport conservé dans les résultats de cette exécution.`);
if (!["prete_a_valider", "publiee_verifiee"].includes(result.etat)) process.exitCode = 1;
