// Vérification en lecture seule : aucun déploiement ni fusion n'est déclenché.
type Objet = Record<string, unknown>;
const objet = (v: unknown): Objet => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Objet : {};
const liste = (v: unknown): Objet[] => Array.isArray(v) ? v.map(objet) : [];
const REPO = 'GERIMMO/GERIMMO_V4';
type Lire = (chemin: string) => Promise<unknown>;
export type PreuvePublication = { proposition: number; revision: string; fusion: string; deploiement: string; controle_le: string };
export async function recueillirPublication(revision: string, proposition: number, gh: Lire, vercel: Lire, projet: string): Promise<PreuvePublication> {
 if (!/^[0-9a-f]{40}$/.test(revision) || !Number.isSafeInteger(proposition) || proposition < 1 || !projet) throw new Error('La version autorisée et sa proposition doivent être identifiées.');
 const pr = objet(await gh(`pulls/${proposition}`));
 const head = objet(pr.head), base = objet(pr.base);
 if (pr.number !== proposition || head.sha !== revision || objet(head.repo).full_name !== REPO || base.ref !== 'main' || objet(base.repo).full_name !== REPO) throw new Error('La proposition ne correspond plus à la version autorisée.');
 if (pr.merged !== true || typeof pr.merged_at !== 'string' || !Number.isFinite(Date.parse(pr.merged_at)) || typeof pr.merge_commit_sha !== 'string' || !/^[0-9a-f]{40}$/.test(pr.merge_commit_sha)) throw new Error('La version n’est pas encore intégrée à la branche de publication.');
 const fusion = pr.merge_commit_sha;
 const reponse = objet(await vercel(`v6/deployments?projectId=${encodeURIComponent(projet)}&sha=${fusion}&target=production&limit=100`));
 const candidats = liste(reponse.deployments).filter(d => d.projectId === projet && d.target === 'production' && objet(d.meta).githubCommitSha === fusion && objet(d.meta).githubCommitRef === 'main');
 candidats.sort((a, b) => Number(b.created) - Number(a.created));
 const dernier = candidats[0];
 // READY seul peut correspondre à une version préparée mais jamais promue.
 if (!dernier || dernier.state !== 'READY' || dernier.readySubstate !== 'PROMOTED' || typeof dernier.uid !== 'string' || !/^dpl_[a-zA-Z0-9]+$/.test(dernier.uid)) throw new Error('Aucune mise en service confirmée pour cette version. Une version seulement préparée ne suffit pas.');
 return { proposition, revision, fusion, deploiement: dernier.uid, controle_le: new Date().toISOString() };
}
export async function verifierPublication(revision: string, proposition: number) {
 const e = process.env;
 if (!e.GITHUB_AGENT_TOKEN || !e.VERCEL_TOKEN || !e.VERCEL_PROJECT_ID) throw new Error('Connectez le suivi GitHub et Vercel pour vérifier la publication.');
 async function lire(url: string, token: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Le service ne permet pas de vérifier la publication. Aucun état n’a été modifié.');
  return r.json();
 }
 return recueillirPublication(revision, proposition, p => lire(`https://api.github.com/repos/${REPO}/${p}`, e.GITHUB_AGENT_TOKEN!), p => lire(`https://api.vercel.com/${p}${e.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(e.VERCEL_TEAM_ID)}` : ''}`, e.VERCEL_TOKEN!), e.VERCEL_PROJECT_ID);
}
