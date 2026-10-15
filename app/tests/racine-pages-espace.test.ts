/**
 * Décision D27 : dans les ÉCRANS — pages et composants de src/app/agence/[orgId], composants partagés de
 * src/components — le choix de la racine (/agence ou /espace) se lit de la GARDE de la page, jamais d'une valeur
 * inversée, recalculée ou mise en dur.
 *
 * Relecture du 15/10 : sur une dizaine de pages (parc, fiche du bail, incidents et leur volet, fiche d'une personne,
 * documents, comptabilité, abonnement), écrire `baseEspace(orgId, !estProprietaire)` ne faisait échouer aucun test ;
 * chaque lien d'une agence serait alors parti vers /espace/<agence>, que le proxy sert en « introuvable » (404).
 * Rendre chacune de ces pages pour les deux profils demanderait de simuler toute leur base ; ce test lit donc le code,
 * comme le balayage de liens-espace-proprietaire.test.ts, et exige :
 *  1. que chaque `baseEspace(…)`, `racineEspace(…)` ou `cheminPourProfil(…)` y reçoive exactement `estProprietaire`,
 *     sauf les exceptions listées ici avec leur raison (et leur preuve) ;
 *  2. que `estProprietaire` y soit lu de la garde (`await verifierAccesEspace(…)`), ou dérivé du rôle qu'elle rend, ou
 *     reçu en propriété — et alors que chaque parent le transmette tel quel, avec « agence » (`false`) par défaut ;
 *  3. qu'aucune adresse « /espace… » n'y soit écrite en dur.
 * Le comportement de baseEspace / racineEspace eux-mêmes est éprouvé par racine-espace.test.ts ; les écrans rendus,
 * par racine-coquille-espace.test.ts et racine-rendus-serveur.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(__dirname, "..");
const ECRANS = ["src/app/agence/[orgId]", "src/components"];

function fichiers(dossier: string): string[] {
  return readdirSync(path.join(APP, dossier)).flatMap((nom) => {
    const relatif = path.posix.join(dossier, nom);
    if (statSync(path.join(APP, relatif)).isDirectory()) return fichiers(relatif);
    return /\.(ts|tsx)$/.test(nom) ? [relatif] : [];
  });
}
const lire = (f: string) => readFileSync(path.join(APP, f), "utf8");
const tousLesEcrans = ECRANS.flatMap(fichiers);
const toutSrc = fichiers("src");

/** Les arguments de premier niveau de chaque appel `nom(…)` du texte (espaces réduits). */
function appels(texte: string, nom: string): { ligne: number; args: string[] }[] {
  const resultats: { ligne: number; args: string[] }[] = [];
  for (const m of texte.matchAll(new RegExp(`\\b${nom}\\(`, "g"))) {
    let i = (m.index ?? 0) + m[0].length;
    let profondeur = 0;
    let courant = "";
    const args: string[] = [];
    for (; i < texte.length; i++) {
      const c = texte[i];
      if (c === '"' || c === "'" || c === "`") {
        const fin = texte.indexOf(c, i + 1);
        courant += texte.slice(i, fin + 1);
        i = fin;
        continue;
      }
      if ("([{".includes(c)) profondeur++;
      if (")]}".includes(c)) {
        if (profondeur === 0) break;
        profondeur--;
      }
      if (c === "," && profondeur === 0) {
        args.push(courant);
        courant = "";
        continue;
      }
      courant += c;
    }
    args.push(courant);
    resultats.push({ ligne: texte.slice(0, m.index).split("\n").length, args: args.map((a) => a.replace(/\s+/g, " ").trim()).filter(Boolean) });
  }
  return resultats;
}

/** L'argument qui choisit la racine : le booléen de baseEspace / cheminPourProfil, l'unique de racineEspace. */
const ARGUMENT_DU_CHOIX: Record<string, number> = { baseEspace: 1, cheminPourProfil: 1, racineEspace: 0 };

/**
 * Les seuls écarts admis à « exactement estProprietaire », et pourquoi. `preuve` : le fichier et le texte qui
 * montrent que la valeur est la bonne (écran réservé au propriétaire direct, défaut repris par l'appelant…).
 */
const EXCEPTIONS: Record<string, { argument: string; raison: string; preuve: [string, string] }> = {
  "src/app/agence/[orgId]/accueil-proprietaire.tsx": {
    argument: "true", raison: "accueil servi au seul propriétaire direct",
    preuve: ["src/app/agence/[orgId]/page.tsx", "if (estProprietaire) {\n    return (\n      <AccueilProprietaire"],
  },
  "src/app/agence/[orgId]/articles-accueil.tsx": {
    argument: "true", raison: "encart de l'accueil du propriétaire direct, seul à le rendre",
    preuve: ["src/app/agence/[orgId]/accueil-proprietaire.tsx", "<ArticlesAccueil supabase={supabase} orgId={orgId} />"],
  },
  "src/app/agence/[orgId]/artisans/carnet-proprietaire.tsx": {
    argument: "true", raison: "carnet rendu à la place de l'écran Artisans pour le seul propriétaire direct",
    preuve: ["src/app/agence/[orgId]/artisans/page.tsx", 'const bailleurDirect = role === "proprietaire_direct";\n  if (bailleurDirect) return <CarnetProprietaire orgId={orgId} />;'],
  },
  "src/components/page-finances.tsx": {
    argument: "true", raison: "« Finances » n'existe que chez le propriétaire direct",
    preuve: ["src/app/agence/[orgId]/loyers/page.tsx", "if (estProprietaire) return <PageFinances"],
  },
  "src/components/recapitulatif-fiscal.tsx": {
    argument: "true", raison: "l'aide à la déclaration n'existe que chez le propriétaire direct",
    preuve: ["src/components/recapitulatif-fiscal.tsx", "if (!estProprietaire) notFound();"],
  },
  "src/app/agence/[orgId]/incidents/volet-artisan.tsx": {
    argument: "false", raison: "défaut de la propriété `base` de ConsultationOuverte (agence), que l'appelant fournit",
    preuve: ["src/app/agence/[orgId]/incidents/volet-artisan.tsx", "<ConsultationOuverte\n          orgId={orgId}\n          base={base}"],
  },
  "src/app/agence/[orgId]/incidents/factures-incident.tsx": {
    argument: "false", raison: "défaut de la propriété `base` (agence), que l'appelant fournit",
    preuve: ["src/app/agence/[orgId]/incidents/pane-incident.tsx", "<FacturesIncident orgId={orgId} incidentId={incidentId} imputation={incident.imputation} base={base} />"],
  },
  "src/app/agence/[orgId]/artisans/pane-artisan.tsx": {
    argument: "bailleurDirect", raison: "propriété transmise par l'écran Artisans, dérivée du rôle lu par la garde",
    preuve: ["src/app/agence/[orgId]/artisans/page.tsx", 'const bailleurDirect = role === "proprietaire_direct";'],
  },
  "src/components/synthese-alertes.tsx": {
    argument: "Boolean(a?.proprietaire_direct)", raison: "chaque alerte porte le type de SON organisation (lib/alertes.ts)",
    preuve: ["src/lib/alertes.ts", '?.type === "proprietaire_direct",'],
  },
};

const GARDE = /const\s*\{[^}]*\bestProprietaire\b[^}]*\}\s*=\s*await\s+verifierAccesEspace\(/;
const ROLE_DE_LA_GARDE = /const\s*\{[^}]*\brole\b[^}]*\}\s*=\s*await\s+verifierAccesEspace\(/;
const DERIVE_DU_ROLE = /const estProprietaire = role === "proprietaire_direct";/;
const PROPRIETE = /\bestProprietaire\??:\s*boolean\b/;

/** D'où le fichier tient-il `estProprietaire` ? null : d'aucune source admise. */
function sourceDuDrapeau(texte: string): "garde" | "role" | "propriete" | null {
  if (GARDE.test(texte)) return "garde";
  if (DERIVE_DU_ROLE.test(texte) && ROLE_DE_LA_GARDE.test(texte)) return "role";
  if (PROPRIETE.test(texte)) return "propriete";
  return null;
}

describe("écrans : le choix de la racine se lit de la garde", () => {
  it("le balayage voit bien les écrans de gestion (garde-fou du test lui-même)", () => {
    const avecChoix = tousLesEcrans.filter((f) => /\b(baseEspace|racineEspace|cheminPourProfil)\(/.test(lire(f)));
    expect(avecChoix.length).toBeGreaterThan(40);
    for (const f of [
      "src/app/agence/[orgId]/parc/page.tsx", "src/app/agence/[orgId]/baux/[bailId]/page.tsx", "src/app/agence/[orgId]/incidents/page.tsx",
      "src/app/agence/[orgId]/incidents/pane-incident.tsx", "src/app/agence/[orgId]/incidents/volet-artisan.tsx",
      "src/app/agence/[orgId]/personnes/[personId]/page.tsx", "src/app/agence/[orgId]/documents/page.tsx",
      "src/app/agence/[orgId]/comptabilite/page.tsx", "src/app/agence/[orgId]/abonnement/abonnement-2026.tsx",
      "src/app/agence/[orgId]/abonnement/abonnement-historique.tsx", "src/app/agence/[orgId]/alertes/liste-alertes.tsx",
    ]) expect(avecChoix, f).toContain(f);
  });

  it("chaque baseEspace / racineEspace / cheminPourProfil reçoit exactement `estProprietaire` (ou une exception justifiée)", () => {
    const ecarts: string[] = [];
    for (const f of tousLesEcrans) {
      const texte = lire(f);
      for (const [nom, position] of Object.entries(ARGUMENT_DU_CHOIX)) {
        for (const { ligne, args } of appels(texte, nom)) {
          const argument = args[position];
          if (argument === "estProprietaire") continue;
          if (EXCEPTIONS[f]?.argument === argument) continue;
          ecarts.push(`${f}:${ligne} ${nom}(…${argument}…)`);
        }
      }
    }
    expect(ecarts, "un écran choisit sa racine autrement qu'avec le drapeau de la garde").toEqual([]);
  });

  it("chaque exception est encore vraie : sa preuve figure dans le code", () => {
    for (const [f, { argument, preuve: [fichier, extrait] }] of Object.entries(EXCEPTIONS)) {
      const avecLException = ["baseEspace", "racineEspace"].some((nom) =>
        appels(lire(f), nom).some(({ args }) => args[ARGUMENT_DU_CHOIX[nom]] === argument));
      expect(avecLException, `${f} n'utilise plus « ${argument} » : retirer l'exception`).toBe(true);
      expect(lire(fichier), `${f} : preuve absente de ${fichier}`).toContain(extrait);
    }
  });

  it("`estProprietaire` y est lu de la garde, dérivé du rôle qu'elle rend, ou reçu en propriété", () => {
    const sansSource: string[] = [];
    for (const f of tousLesEcrans) {
      const texte = lire(f);
      const utilise = Object.entries(ARGUMENT_DU_CHOIX).some(([nom, position]) =>
        appels(texte, nom).some(({ args }) => args[position] === "estProprietaire"));
      if (utilise && !sourceDuDrapeau(texte)) sansSource.push(f);
    }
    expect(sansSource).toEqual([]);
  });

  it("une propriété `estProprietaire` vaut « agence » par défaut, et chaque parent la transmet telle quelle", () => {
    const ecarts: string[] = [];
    for (const f of toutSrc) {
      const texte = lire(f);
      // Défaut d'une propriété déstructurée (ou dérivation locale du rôle) : jamais « vrai ». `=` seul : ni `={` (JSX)
      // ni `===` (comparaison).
      for (const m of texte.matchAll(/\bestProprietaire\s*=(?![={])\s*([^,;\n})]+)/g)) {
        const valeur = m[1].trim();
        if (valeur !== "false" && !/^role === "proprietaire_direct"$/.test(valeur)) ecarts.push(`${f} : défaut ${valeur}`);
      }
      // Transmission : la valeur de la garde, ou le type / le rôle lus par la garde, jamais une négation.
      for (const m of texte.matchAll(/\bestProprietaire=\{([^}]*)\}/g)) {
        const valeur = m[1].replace(/\s+/g, " ").trim();
        const admise = ["estProprietaire", 'organisation.type === "proprietaire_direct"', 'role === "proprietaire_direct"'].includes(valeur);
        if (!admise) ecarts.push(`${f} : estProprietaire={${valeur}}`);
        else if (valeur === "estProprietaire" && !sourceDuDrapeau(texte)) ecarts.push(`${f} : transmet un drapeau sans source`);
      }
      // Forme courte (`<X estProprietaire />`, vrai) : réservée aux écrans du seul propriétaire direct.
      if (/\sestProprietaire\s*\/?>/.test(texte) && EXCEPTIONS[f]?.argument !== "true") ecarts.push(`${f} : estProprietaire (vrai) en dur`);
      for (const m of texte.matchAll(/\bbailleurDirect=\{([^}]*)\}/g)) {
        if (m[1].trim() !== "bailleurDirect" || !texte.includes('const bailleurDirect = role === "proprietaire_direct";') || !ROLE_DE_LA_GARDE.test(texte)) {
          ecarts.push(`${f} : bailleurDirect={${m[1]}}`);
        }
      }
      // La racine transmise en propriété : celle que la coquille ou la garde ont déjà choisie, jamais une autre.
      for (const m of texte.matchAll(/\bracine=\{([^}]*\)?)\}/g)) {
        const valeur = m[1].replace(/\s+/g, " ").trim();
        if (!["racine", "racineEspace(estProprietaire)", "racineAlerte(traitement)"].includes(valeur)) ecarts.push(`${f} : racine={${valeur}}`);
      }
    }
    expect(ecarts).toEqual([]);
  });

  it("aucune adresse « /espace… » écrite en dur dans un écran (la racine vient de lib/racine-espace.ts)", () => {
    // La FAQ n'existe que chez le propriétaire direct (`if (!estProprietaire) notFound()`) : son libellé d'écran
    // par défaut nomme la route /espace, ce n'est pas un lien.
    const admis = new Set(['src/app/agence/[orgId]/faq/page.tsx:params.ecran ??= "/espace/[dossier]/faq";']);
    expect(lire("src/app/agence/[orgId]/faq/page.tsx")).toContain("if (!estProprietaire) notFound();");
    const enDur = tousLesEcrans.flatMap((f) =>
      lire(f).split("\n").filter((l) => /["'`]\/espace\b/.test(l) && !admis.has(`${f}:${l.trim()}`)).map((l) => `${f} : ${l.trim()}`));
    expect(enDur).toEqual([]);
  });
});
