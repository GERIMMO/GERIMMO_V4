/** Une proposition conserve sa branche en cas de réponse perdue ou de relance du workflow. */
export async function assurerProposition(gh, { id, base, fichiers, resume }) {
  let branche = `gerimmo/proposition-${id}`;
  const existante = async () => (await gh(`pulls?state=all&base=main&head=GERIMMO:${branche}`))[0];
  const pr = await existante();
  if (pr) return pr;

  // Les versions précédentes ajoutaient le numéro d’exécution à la branche.
  const prefixe = `refs/heads/${branche}-`;
  const anciennes = (await gh(`git/matching-refs/heads/${branche}-`))
    .filter(ref => ref.ref.startsWith(prefixe) && /^\d+$/.test(ref.ref.slice(prefixe.length)));
  if (anciennes.length > 1) throw new Error("Plusieurs branches historiques existent. Vérification nécessaire.");
  if (anciennes.length === 1) {
    branche = anciennes[0].ref.slice("refs/heads/".length);
    const historique = await existante();
    if (historique) return historique;
  }

  const main = await gh("git/ref/heads/main");
  if (main.object.sha !== base) throw new Error("La version de départ a changé. Préparer une nouvelle proposition.");
  const parent = await gh(`git/commits/${base}`);
  const arbre = await gh("git/trees", {
    base_tree: parent.tree.sha,
    tree: fichiers.map(f => ({ path: f.chemin, mode: "100644", type: "blob", content: f.contenu })),
  });
  const ref = `git/ref/heads/${branche}`;
  let tete = await gh(ref, undefined, { absent: true });
  if (!tete) {
    const commit = await gh("git/commits", { message: `Proposition Gerimmo ${id}`, tree: arbre.sha, parents: [base] });
    try {
      await gh("git/refs", { ref: `refs/heads/${branche}`, sha: commit.sha });
    } catch (erreur) {
      tete = await gh(ref, undefined, { absent: true });
      if (!tete) throw erreur;
    }
  }
  if (tete) {
    const precedent = await gh(`git/commits/${tete.object.sha}`);
    if (precedent.tree.sha !== arbre.sha || precedent.parents.length !== 1 || precedent.parents[0].sha !== base)
      throw new Error("Une branche différente existe déjà pour cette proposition. Vérification nécessaire.");
  }
  try {
    return await gh("pulls", {
      head: branche, base: "main", draft: true, title: "Proposition de correction Gerimmo",
      body: `Proposition : ${id}\n\n${resume}\n\nRelecture et tests requis avant toute fusion.`,
    });
  } catch (erreur) {
    const retrouvee = await existante();
    if (retrouvee) return retrouvee;
    throw erreur;
  }
}
