import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DOCUMENTS_PUBLIES,
  LIBELLE_DOCUMENT,
  dateEnLettres,
  empreinteIdentite,
  extraireTexteContractuel,
  sha256Hex,
  versionDeclaree,
  type DocumentConditions,
} from "./conditions-versions";
import { envoyerEmail } from "./email";
import { CHAMPS_EDITEUR, identiteDepuisValeurs } from "./identite-editeur";
import { adressesRelaisDuServeur } from "./relais-alerte-reglage";

// L'ARCHIVAGE DE LA VERSION EN VIGUEUR DES CONDITIONS (24/10/2026, plan de conformité, R12).
//
// Ce qui est archivé est la page PUBLIÉE, lue en ligne comme un visiteur la reçoit (`${site}/conditions`, sans
// session), et non un rendu fabriqué par l'action : l'archive prouve ce que le client a eu sous les yeux. L'identité de
// l'éditeur est lue avant et après la lecture de la page ; si elle a changé entre-temps, rien n'est archivé (la page et
// l'identité figée ne correspondraient plus). La page doit porter la version que ce serveur affiche : une page servie
// par un autre déploiement est refusée. Elle doit aussi dire, sur l'élément marqué, qu'elle a lu l'identité en base et
// avec quelle empreinte : une page dégradée (lecture en échec) ou rendue avec une autre identité est refusée (I1).
//
// L'écriture passe par `archiver_version_conditions` (clé de service seulement), qui insère la version si elle
// manque et ne réécrit JAMAIS une version archivée : une même version avec une autre empreinte est refusée, consignée
// dans tech_log, et le relais est alerté par e-mail (adresses GERIMMO_RELAIS_EMAILS, le canal d'alerte existant) — sauf
// si seule la présentation diffère (classes, styles : statut `presentation_differente`), qui ne demande rien.

export type StatutArchivage = "archivee" | "deja_archivee" | "empreinte_differente" | "echec";

export type ResultatArchivage = {
  document: DocumentConditions;
  version: string;
  statut: StatutArchivage;
  message: string;
  empreinte?: string;
};

type Dependances = {
  /** Le client de service (clé `service_role`), obtenu APRÈS le contrôle du droit de l'appelant. */
  service: SupabaseClient;
  /** L'adresse publique du site, sans barre finale (`adresseDuSite()`). */
  site: string;
  lirePage?: (url: string) => Promise<string>;
  envoyer?: typeof envoyerEmail;
  adressesRelais?: string[];
};

const TAILLE_MAX_PAGE = 5_000_000;

/** La page telle qu'un visiteur la reçoit : sans cache, sans session, bornée en temps et en taille. */
async function lirePagePubliee(url: string): Promise<string> {
  const reponse = await fetch(url, {
    cache: "no-store",
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!reponse.ok) throw new Error(`la page a répondu ${reponse.status}`);
  // Une redirection vers la connexion ou ailleurs ne rend pas la page des conditions.
  if (new URL(reponse.url || url).pathname !== new URL(url).pathname) throw new Error("la page a été redirigée");
  const texte = await reponse.text();
  if (texte.length > TAILLE_MAX_PAGE) throw new Error("la page dépasse la taille admise");
  return texte;
}

const MOTIFS_EXTRACTION: Record<string, string> = {
  absent: "le texte contractuel n'a pas été trouvé dans la page publiée (marque data-texte-contractuel absente : le déploiement en ligne précède-t-il cette fonction ?)",
  plusieurs: "la page publiée porte plusieurs textes contractuels pour ce document",
  non_ferme: "le texte contractuel de la page publiée n'est pas refermé (page tronquée)",
  incomplet:
    "des passages du texte contractuel de la page publiée n'ont pas pu être remis en place (rendu en flux inachevé ou reporté au navigateur) : le texte serait troué",
  contenu_actif:
    "le texte contractuel de la page publiée contient un balisage non admis (script, cadre, image, style, gestionnaire d'événement ou lien qui n'est pas une adresse web)",
};

async function lireIdentite(service: SupabaseClient): Promise<{ valeurs: unknown; revision: number } | null> {
  const { data, error } = await service.from("supervision_identite").select("valeurs, revision").eq("singleton", true).maybeSingle();
  if (error || !data) return null;
  return { valeurs: data.valeurs, revision: Number(data.revision) };
}

function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function alerterRelais(
  deps: Dependances,
  r: { document: DocumentConditions; version: string; archivee: string; publiee: string; champs: string[] }
): Promise<number> {
  const adresses = deps.adressesRelais ?? adressesRelaisDuServeur().valides;
  if (adresses.length === 0) return 0;
  const envoyer = deps.envoyer ?? envoyerEmail;
  const champs = r.champs.map((c) => CHAMPS_EDITEUR[c] ?? c);
  const html = `
<div style="font-family:Figtree,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f2352">
  <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px">Conditions publiées différentes de leur archive</h1>
  <p style="margin:0 0 12px">La page publiée des ${echapper(LIBELLE_DOCUMENT[r.document].toLowerCase())}, version du ${echapper(dateEnLettres(r.version))}, ne correspond plus au texte archivé sous cette version. L'archive n'a pas été modifiée.</p>
  <p style="margin:0 0 12px">${champs.length ? `Informations de l'éditeur modifiées depuis l'archivage : ${echapper(champs.join(", "))}.` : "Les informations de l'éditeur n'ont pas changé : c'est le texte de la page qui a changé."}</p>
  <p style="margin:0 0 12px">Un texte différent doit paraître sous une nouvelle version des conditions.</p>
  <p style="font-size:13px;color:#53617a;margin:0">Empreinte archivée : ${echapper(r.archivee)}<br>Empreinte publiée : ${echapper(r.publiee)}</p>
  <p style="margin:16px 0 0"><a href="${echapper(deps.site)}/admin/sante#archive-conditions">Ouvrir Santé et connexions</a></p>
</div>`;
  const envois = await Promise.all(
    adresses.map((to) =>
      envoyer({
        to,
        subject: "Gerimmo — conditions publiées différentes de leur archive",
        html,
        cleIdempotence: `conditions-divergentes-${r.document}-${r.version}-${r.publiee}-${to}`,
      }).catch(() => ({ erreur: "envoi interrompu" }))
    )
  );
  return envois.filter((e) => !e.erreur).length;
}

/**
 * Reprise du lot D4 (relecture D4R-02, option prudente retenue le 24/11/2026). L'article 16 des conditions clients
 * promet qu'une nouvelle version est notifiée au Client par courrier électronique et dans son espace, avec un préavis,
 * avant sa prise d'effet ; Gerimmo n'envoie pas encore cette annonce, et l'archivage d'une version déclenche aussitôt la
 * demande d'accord aux abonnés. Tant que cette annonce n'existe pas, une NOUVELLE version des conditions clients ne
 * s'archive donc pas s'il existe au moins un abonné actif. Une version déjà archivée se revérifie toujours.
 * Abonné actif : une souscription chez le prestataire de paiement qui n'est pas close (`canceled`,
 * `incomplete_expired`) ; un statut inconnu compte comme actif. Une lecture en échec refuse aussi (prudence).
 */
const STATUTS_CLOS = ["canceled", "incomplete_expired"];

async function abonnesActifs(service: SupabaseClient): Promise<number | null> {
  const { data, error } = await service.from("abonnements").select("stripe_statut").not("stripe_subscription_id", "is", null).limit(100_000);
  if (error || !Array.isArray(data)) return null;
  return (data as { stripe_statut: unknown }[]).filter((l) => !STATUTS_CLOS.includes(String(l.stripe_statut ?? ""))).length;
}

async function dejaArchivee(service: SupabaseClient, document: DocumentConditions, version: string): Promise<boolean | null> {
  const { data, error } = await service.from("versions_conditions").select("version").eq("document", document).eq("version", version).maybeSingle();
  return error ? null : data !== null;
}

export function messageAbonnesAPrevenir(libelle: string, abonnes: number | null): string {
  const qui = abonnes === null
    ? "Le nombre d'abonnés actifs n'a pas pu être lu"
    : `${abonnes === 1 ? "Un abonné actif est concerné" : `${abonnes} abonnés actifs sont concernés`}`;
  return (
    `${libelle} : refusé, rien n'est archivé. ${qui}. L'article 16 des conditions prévoit que toute nouvelle version leur ` +
    "soit d'abord notifiée par courrier électronique et dans leur espace, avec un résumé des changements, avant sa prise d'effet. " +
    "Gerimmo n'envoie pas encore cette annonce : l'archivage reste refusé tant qu'il existe un abonné actif. " +
    "Il faut d'abord annoncer la version aux abonnés (évolution à prévoir), puis l'archiver."
  );
}

/** Archive la version en vigueur de chaque document publié. Ne lève pas : chaque document a son résultat. */
export async function archiverConditionsPubliees(deps: Dependances): Promise<ResultatArchivage[]> {
  const lirePage = deps.lirePage ?? lirePagePubliee;
  const resultats: ResultatArchivage[] = [];
  for (const d of DOCUMENTS_PUBLIES) {
    const base = { document: d.document, version: d.version };
    const echec = (message: string): ResultatArchivage => ({ ...base, statut: "echec", message });
    const declaree = versionDeclaree(d.document, d.version);
    if (!declaree) {
      resultats.push(echec(`La version ${d.version} n'est pas déclarée dans conditions-versions.json : rien n'est archivé.`));
      continue;
    }
    if (d.document === "conditions_clients") {
      const abonnes = await abonnesActifs(deps.service);
      if (abonnes !== 0 && (await dejaArchivee(deps.service, d.document, d.version)) !== true) {
        resultats.push(echec(messageAbonnesAPrevenir(`${LIBELLE_DOCUMENT[d.document]}, version du ${d.dateAffichee}`, abonnes)));
        continue;
      }
    }
    const avant = await lireIdentite(deps.service);
    if (!avant) {
      resultats.push(echec("L'identité de l'éditeur n'a pas pu être lue : rien n'est archivé."));
      continue;
    }
    let page: string;
    try {
      page = await lirePage(`${deps.site}${d.chemin}`);
    } catch (e) {
      resultats.push(echec(`La page publiée ${d.chemin} n'a pas pu être lue (${e instanceof Error ? e.message : "erreur inconnue"}) : rien n'est archivé.`));
      continue;
    }
    const apres = await lireIdentite(deps.service);
    if (!apres || apres.revision !== avant.revision) {
      resultats.push(echec("L'identité de l'éditeur a changé pendant la lecture de la page : rien n'est archivé. Relancez l'archivage."));
      continue;
    }
    const extraction = extraireTexteContractuel(page, d.document);
    if (!extraction.ok) {
      resultats.push(echec(`Refusé : ${MOTIFS_EXTRACTION[extraction.motif]}.`));
      continue;
    }
    if (extraction.version !== d.version) {
      resultats.push(echec(
        `Refusé : la page publiée affiche la version ${extraction.version ?? "(sans version)"}, ce serveur la version ${d.version}. Archivez depuis le déploiement en ligne.`
      ));
      continue;
    }
    // Relecture adverse du 24/10 (I1) : la page doit avoir été rendue avec l'identité que l'archive va ranger. Une page
    // qui n'a pas pu la lire est servie quand même (mentions « à venir ») : son texte n'est pas celui du contrat.
    if (!extraction.identiteLue) {
      resultats.push(echec(
        "Refusé : la page publiée n'a pas pu lire l'identité de l'éditeur au moment du rendu ; elle affiche un texte dégradé (mentions « à venir »). Rien n'est archivé : relancez l'archivage."
      ));
      continue;
    }
    const identite = identiteDepuisValeurs(avant.valeurs);
    if (extraction.identiteEmpreinte !== empreinteIdentite(identite)) {
      resultats.push(echec(
        "Refusé : la page publiée a été rendue avec une autre identité de l'éditeur que celle lue en base (page en cache ou saisie en cours). Rien n'est archivé : relancez l'archivage."
      ));
      continue;
    }
    const empreinte = sha256Hex(extraction.html);
    const { data, error } = await deps.service.rpc("archiver_version_conditions", {
      p_document: d.document,
      p_version: d.version,
      p_date_effet: declaree.date_effet,
      p_nature: declaree.nature,
      p_texte_html: extraction.html,
      p_identite_editeur: identite,
      p_empreinte_sha256: empreinte,
      p_resume_modifications: declaree.resume_modifications,
    });
    const retour = data as { statut?: string; empreinte_sha256?: string; champs_identite_modifies?: string[] } | null;
    if (error || !retour?.statut) {
      resultats.push(echec("La base a refusé l'archivage ou ne répond pas : rien n'est archivé."));
      continue;
    }
    const libelle = `${LIBELLE_DOCUMENT[d.document]}, version du ${d.dateAffichee}`;
    if (retour.statut === "archivee") {
      resultats.push({ ...base, statut: "archivee", empreinte, message: `${libelle} : archivée. Empreinte SHA-256 : ${empreinte}.` });
    } else if (retour.statut === "deja_archivee") {
      resultats.push({ ...base, statut: "deja_archivee", empreinte, message: `${libelle} : déjà archivée avec le même texte. Rien à faire.` });
    } else if (retour.statut === "presentation_differente") {
      // Relecture adverse du 24/10 (M2) : un déploiement purement visuel (classes, styles) ne change pas le contrat.
      resultats.push({
        ...base,
        statut: "deja_archivee",
        empreinte: retour.empreinte_sha256 ?? empreinte,
        message:
          `${libelle} : déjà archivée avec le même texte ; seule la présentation de la page (classes, styles) a changé depuis. ` +
          "L'archive garde la présentation d'origine. Rien à faire.",
      });
    } else {
      const archivee = retour.empreinte_sha256 ?? "";
      const champs = Array.isArray(retour.champs_identite_modifies) ? retour.champs_identite_modifies : [];
      const envoyes = await alerterRelais(deps, { document: d.document, version: d.version, archivee, publiee: empreinte, champs });
      resultats.push({
        ...base,
        statut: "empreinte_differente",
        empreinte: archivee,
        message:
          `${libelle} : refusé. Cette version est déjà archivée avec un autre texte (empreinte ${archivee}) ; ` +
          `la page publiée a changé depuis (empreinte ${empreinte})` +
          (champs.length ? `, notamment ${champs.map((c) => CHAMPS_EDITEUR[c] ?? c).join(", ").toLowerCase()}` : "") +
          ". L'archive n'est pas modifiée : un texte différent doit paraître sous une nouvelle version. " +
          (envoyes > 0 ? "Le relais a été alerté par e-mail." : "Aucune alerte e-mail n'est partie (relais non configuré ou envoi en échec) ; l'écart est consigné au journal technique."),
      });
    }
  }
  return resultats;
}
