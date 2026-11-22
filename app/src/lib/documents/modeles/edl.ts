// 14 — État des lieux d'entrée · 15 — État des lieux de sortie.
// Généré depuis la grille réelle (pièces, états, commentaires), les relevés
// de compteurs et les clés ; en sortie : comparatif avec l'entrée et
// retenues chiffrées (vétusté) si une restitution existe. Cible : l'EDL.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cadreSignature,
  cartouches,
  echapper,
  enTete,
  eur,
  faitA,
  section,
  tableau,
  titre,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  referenceCourte,
  type ContexteBail,
  liensLocataires,
} from "./communs";
import type { Assemblage } from "./index";
import { RAPPEL_COMPLEMENT_EDL_ENTREE_DOCUMENT } from "@/lib/textes-signature-actes";

const ETATS: Record<string, string> = { neuf: "Neuf", bon: "Bon", usage: "Usage", mauvais: "Mauvais" };

export type LigneEdl = {
  categorie: string;
  piece: string | null;
  libelle: string;
  etat: string | null;
  commentaire: string | null;
  /** Audit palier 1, P2-01 : la photo de l'élément (identifiant du document), quand il y en a une. */
  photo_document_id?: string | null;
};

/**
 * Les photos de la grille, par identifiant de document : l'image prête à s'imprimer (data-URI), ou `null` quand elle
 * n'a pas pu être lue au moment de l'édition — la légende s'imprime alors seule, pour qu'une photo ne disparaisse
 * jamais du document sans que cela se voie.
 */
export type PhotosEdl = Record<string, string | null>;

export type DonneesEdl = {
  type: "entree" | "sortie";
  reference: string;
  dateEdl: string | null;
  /**
   * Sortie seulement : date de l'état des lieux d'entrée signé du même bail (audit palier 1 du 22/11/2026, P0-06).
   * Absente quand aucune entrée signée n'est enregistrée dans Gerimmo : la mention reste, à compléter à la main.
   */
  dateEdlEntree?: string | null;
  signeLe: string | null;
  personnesPresentes: string | null;
  detecteurFumeePresent: boolean | null;
  detecteurFumeeEtat: string | null;
  attestationAssuranceFournie: boolean | null;
  adresseRestitutionDepot: string | null;
  observations: string | null;
  lignes: LigneEdl[];
  /** Audit palier 1, P2-01 : photos des éléments, imprimées numérotées en fin de document. */
  photos?: PhotosEdl;
  compteurs: { type: string; numero: string | null; releve: number | string | null }[];
  cles: { libelle: string; nombre: number | null; reference: string | null }[];
  comparatif: { libelle: string; etat_entree: string | null; etat_sortie: string | null; ecart: boolean }[];
  retenues: { libelle: string; cout: number | null; duree_vie_ans: number | null; age_ans: number | null; montant_retenu: number }[];
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  exp: ReturnType<typeof expediteur>;
  f: Fusion;
};

// Les pièces de la grille : un h3 par pièce, au rythme du gabarit (une marge
// en ligne refaisait à la main ce que la feuille du document dit déjà).
function groupesDeLignes(lignes: LigneEdl[]): Map<string, LigneEdl[]> {
  const groupes = new Map<string, LigneEdl[]>();
  for (const l of lignes) {
    const cle = l.piece ?? (l.categorie === "equipement" ? "Équipements" : "Général");
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(l);
  }
  return groupes;
}

// Audit palier 1 du 22/11/2026, P0-06 : l'état des lieux de sortie rappelle la date de celui d'entrée. La date vient de
// l'entrée signée du même bail. Sans entrée signée dans Gerimmo (état des lieux établi ailleurs, bail repris en cours),
// la mention reste imprimée avec un blanc à compléter à la main : ce blanc n'est PAS compté parmi les informations
// manquantes, puisqu'aucun écran de Gerimmo ne permet de le remplir.
const ATTRIBUT_DATE_EDL_ENTREE = "data-edl-entree";
function mentionEdlEntree(f: Fusion, date: string | null | undefined): string {
  if (date) return `<p ${ATTRIBUT_DATE_EDL_ENTREE}="connue">État des lieux d'entrée établi le ${f.date(date)}.</p>`;
  return `<p ${ATTRIBUT_DATE_EDL_ENTREE}="a-completer">État des lieux d'entrée établi le <span class="fusion">date à porter à la main</span> — aucun état des lieux d'entrée signé n'est enregistré dans Gerimmo pour ce bail.</p>`;
}

// Audit palier 1 du 22/11/2026, P2-01 : les photos des éléments. Chaque photo reçoit un numéro, dans l'ordre de la
// grille ; la ligne de l'élément renvoie à ce numéro, et les images sont imprimées en fin de document, avant les
// observations et les signatures. Seules les images JPEG ou PNG déjà encodées par l'assemblage sont imprimées.
const IMAGE_IMPRIMABLE = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/;
function numerosDesPhotos(d: DonneesEdl): Map<LigneEdl, number> {
  const numeros = new Map<LigneEdl, number>();
  if (!d.photos) return numeros;
  for (const [, lignes] of groupesDeLignes(d.lignes)) {
    for (const l of lignes) {
      if (l.photo_document_id && Object.hasOwn(d.photos, l.photo_document_id)) numeros.set(l, numeros.size + 1);
    }
  }
  return numeros;
}
function sectionPhotos(d: DonneesEdl, numeros: Map<LigneEdl, number>): string {
  if (!numeros.size) return "";
  const vignettes = [...numeros.entries()].map(([l, n]) => {
    const piece = l.piece ?? (l.categorie === "equipement" ? "Équipements" : "Général");
    const legende = `Photo n° ${n} — ${echapper(piece)} — ${echapper(l.libelle)}`;
    const image = d.photos![l.photo_document_id!];
    return image && IMAGE_IMPRIMABLE.test(image)
      ? `<figure data-photo-edl="${n}" style="margin:0;break-inside:avoid-page;page-break-inside:avoid"><img src="${image}" alt="" style="display:block;width:100%;max-height:210pt;object-fit:contain;border:0.5pt solid #c9c9c9"/><figcaption class="mentions">${legende}</figcaption></figure>`
      : `<figure data-photo-edl="${n}" data-photo-indisponible style="margin:0;break-inside:avoid-page;page-break-inside:avoid"><figcaption class="mentions">${legende} — image indisponible au moment de l'édition ; elle reste consultable dans les documents du bail.</figcaption></figure>`;
  });
  return `${section("Photos")}
    <p class="mentions">${numeros.size === 1 ? "Une photo est jointe" : `${numeros.size} photos sont jointes`} au présent état des lieux ; chaque numéro renvoie à l'élément de la grille qui le cite.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10pt">${vignettes.join("")}</div>`;
}

export function construireEdl(d: DonneesEdl) {
  const f = d.f;
  const entree = d.type === "entree";
  const titreDoc = entree ? "État des lieux d'entrée" : "État des lieux de sortie";
  const numeros = numerosDesPhotos(d);

  const grilles = [...groupesDeLignes(d.lignes).entries()]
    .map(
      ([piece, lignes]) => `
      <h3>${echapper(piece)}</h3>
      ${tableau(
        [{ libelle: "Élément" }, { libelle: "État" }, { libelle: "Observations" }],
        lignes.map((l) => [
          echapper(l.libelle),
          l.etat ? echapper(ETATS[l.etat] ?? l.etat) : f.champ(null, `État de ${l.libelle} — ${piece}`),
          `${l.commentaire ? echapper(l.commentaire) : "—"}${numeros.has(l) ? ` <span data-renvoi-photo>(photo n° ${numeros.get(l)})</span>` : ""}`,
        ])
      )}`
    )
    .join("");

  const ecarts = d.comparatif.filter((c) => c.ecart);
  const totalRetenues = d.retenues.reduce((s, r) => s + Number(r.montant_retenu), 0);

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: d.dateEdl ?? new Date().toISOString() })}
    ${titre(titreDoc, echapper(d.logementAdresse), [
      "Article 3-2 de la loi n° 89-462 du 6 juillet 1989 · décret n° 2016-382 du 30 mars 2016",
    ])}
    ${cartouches([
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")}`],
      ["Établi le", f.date(d.dateEdl)],
      ["Personnes présentes", f.champ(d.personnesPresentes, "bailleur, locataire, tiers…")],
    ])}
    <p>Le présent état des lieux est établi contradictoirement et amiablement entre les parties,
    lors de la ${entree ? "remise" : "restitution"} des clés. Il est joint au contrat de location et
    en fait partie intégrante. Il décrit le logement et constate l'état des revêtements, équipements
    et éléments qui le composent.</p>
    ${entree ? "" : mentionEdlEntree(f, d.dateEdlEntree)}
    ${grilles || `<p class="mentions">La grille est vide — déclarez les pièces du lot puis régénérez la grille.</p>`}

    ${section("Relevés de compteurs")}
    ${
      d.compteurs.length
        ? tableau(
            [{ libelle: "Fluide" }, { libelle: "Numéro de compteur" }, { libelle: "Index relevé", droite: true }],
            d.compteurs.map((c) => [
              echapper(c.type),
              c.numero ? echapper(c.numero) : f.champ(null, "numéro de compteur"),
              c.releve !== null && c.releve !== ""
                ? echapper(String(c.releve))
                : f.champ(null, "index"),
            ])
          )
        : `<p>${f.champ(null, "relevés de compteurs")}</p>`
    }

    ${section(entree ? "Clés et moyens d'accès remis" : "Clés et moyens d'accès restitués")}
    ${
      d.cles.length
        ? tableau(
            [{ libelle: "Clé ou badge" }, { libelle: "Référence" }, { libelle: "Nombre", droite: true }],
            d.cles.map((c) => [
              echapper(c.libelle),
              c.reference ? echapper(c.reference) : "—",
              // Un nombre non compté ne s'imprime pas « 0 » : les deux parties
              // signent ce document, et « 0 » y attesterait qu'aucune clé n'a
              // été rendue — le fait même qui fonde une retenue de serrurerie.
              // Même traitement que l'index de compteur : pointillés, et la
              // ligne remonte dans la liste des champs restés à remplir.
              c.nombre === null ? f.champ(null, "nombre rendu") : String(c.nombre),
            ])
          )
        : `<p>${f.champ(null, "clés et moyens d'accès")}</p>`
    }

    ${
      entree
        ? `${section("Équipements de sécurité")}
           <p>Détecteur avertisseur autonome de fumée : ${
             d.detecteurFumeePresent === null
               ? f.champ(null, "présent, absent")
               : d.detecteurFumeePresent
                 ? "présent"
                 : "absent"
           } — état constaté : ${f.champ(d.detecteurFumeeEtat, "état constaté")}.<br/>
           Attestation d'assurance du locataire fournie : ${
             d.attestationAssuranceFournie === null
               ? f.champ(null, "attestation fournie ou non")
               : d.attestationAssuranceFournie
                 ? "oui"
                 : "non"
           }.</p>`
        : `${section("Synthèse")}
           ${
             ecarts.length
               ? tableau(
                   [{ libelle: "Élément" }, { libelle: "État à l'entrée" }, { libelle: "État à la sortie" }],
                   ecarts.map((c) => [
                     echapper(c.libelle),
                     echapper(c.etat_entree ? ETATS[c.etat_entree] ?? c.etat_entree : "—"),
                     echapper(c.etat_sortie ? ETATS[c.etat_sortie] ?? c.etat_sortie : "—"),
                   ])
                 )
               : "<p>Aucun écart avec l'état des lieux d'entrée : le logement est restitué dans l'état où il a été remis.</p>"
           }
           ${
             d.retenues.length
               ? `${section("Comparatif chiffré et vétusté")}
                  ${tableau(
                    [
                      { libelle: "Désignation" },
                      { libelle: "Coût", droite: true },
                      { libelle: "Durée de vie / âge" },
                      { libelle: "Montant retenu", droite: true },
                    ],
                    d.retenues.map((r) => [
                      echapper(r.libelle),
                      r.cout !== null ? eur(Number(r.cout)) : "—",
                      r.duree_vie_ans ? `${r.duree_vie_ans} ans / ${r.age_ans ?? "—"} ans` : "—",
                      eur(Number(r.montant_retenu)),
                    ])
                  )}
                  <table><tbody><tr class="total"><td><b>Total des retenues après vétusté</b></td>
                  <td class="d"><b>${eur(totalRetenues)}</b></td></tr></tbody></table>`
               : ""
           }
           <p>Adresse de restitution du dépôt de garantie : ${f.champ(d.adresseRestitutionDepot, "adresse de restitution du dépôt")}.</p>`
    }

    ${sectionPhotos(d, numeros)}

    ${section("Observations des parties")}
    <p>${f.champ(d.observations, "observations des parties")}</p>
    <p class="mentions">${
      entree
        ? // Décision du 23/10 : rappel au locataire, repris dans l'invitation à signer (à relire par le juriste,
          // source non ouverte le 23/10/2026 : voir lib/textes-signature-actes.ts).
          `Rappel au locataire : ${RAPPEL_COMPLEMENT_EDL_ENTREE_DOCUMENT}`
        : "Le dépôt de garantie est restitué dans un délai maximal d'un mois si le présent état est conforme à l'entrée, de deux mois dans le cas contraire, déduction faite des sommes justifiées restant dues."
    }</p>
    ${faitA(f, d.exp.ville, d.signeLe ?? d.dateEdl ?? new Date().toISOString(), ", en autant d'exemplaires que de parties.")}
    <div class="signatures">
      ${cadreSignature("Le bailleur ou son mandataire", d.bailleurNom)}
      ${cadreSignature("Le locataire", d.locatairesNoms)}
    </div>
  `;

  return assemblerPage({
    f,
    titreDocument: titreDoc,
    nomPied: titreDoc,
    reference: d.reference,
    corps,
  });
}

// Au-delà de ce poids cumulé, les photos suivantes ne sont plus imprimées (leur légende le dit) : le document doit
// rester éditable. Une photo réduite sur l'appareil pèse quelques centaines de kilo-octets.
const POIDS_MAX_PHOTOS_IMPRIMEES = 20 * 1024 * 1024;

/** Lit les photos de la grille dans le stockage de l'espace et les rend prêtes à s'imprimer. */
export async function chargerPhotosEdl(
  supabase: SupabaseClient,
  orgId: string,
  identifiants: (string | null | undefined)[]
): Promise<PhotosEdl> {
  const ids = [...new Set(identifiants.filter((i): i is string => Boolean(i)))];
  const photos: PhotosEdl = {};
  if (!ids.length) return photos;
  for (const id of ids) photos[id] = null;
  const { data: documents } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, purged_at")
    .eq("organization_id", orgId)
    .in("id", ids);
  let poids = 0;
  // Dans l'ordre de la grille : si le plafond est atteint, ce sont les dernières photos qui restent en légende seule.
  for (const id of ids) {
    const doc = ((documents ?? []) as { id: string; storage_path: string | null; mime_type: string | null; purged_at: string | null }[]).find((x) => x.id === id);
    if (!doc || doc.purged_at || !doc.storage_path) continue;
    if (doc.mime_type !== "image/jpeg" && doc.mime_type !== "image/png") continue;
    const { data: fichier } = await supabase.storage.from("documents").download(doc.storage_path);
    if (!fichier) continue;
    const octets = Buffer.from(await fichier.arrayBuffer());
    if (poids + octets.length > POIDS_MAX_PHOTOS_IMPRIMEES) continue;
    poids += octets.length;
    photos[id] = `data:${doc.mime_type};base64,${octets.toString("base64")}`;
  }
  return photos;
}

async function chargerEdl(
  supabase: SupabaseClient,
  orgId: string,
  edlId: string
): Promise<{ edl: { id: string; bail_id: string; type: "entree" | "sortie"; etat: string; date_edl: string | null; signe_le: string | null; personnes_presentes: string | null; detecteur_fumee_present: boolean | null; detecteur_fumee_etat: string | null; attestation_assurance_fournie: boolean | null; adresse_restitution_depot: string | null; observations: string | null }; ctx: ContexteBail } | { erreur: string }> {
  const { data: edl } = await supabase
    .from("etats_des_lieux")
    .select("id, bail_id, type, etat, date_edl, signe_le, personnes_presentes, detecteur_fumee_present, detecteur_fumee_etat, attestation_assurance_fournie, adresse_restitution_depot, observations")
    .eq("id", edlId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!edl) return { erreur: "État des lieux introuvable." };
  const ctx = await chargerContexteBail(supabase, orgId, edl.bail_id);
  if ("erreur" in ctx) return ctx;
  return { edl: edl as { id: string; bail_id: string; type: "entree" | "sortie"; etat: string; date_edl: string | null; signe_le: string | null; personnes_presentes: string | null; detecteur_fumee_present: boolean | null; detecteur_fumee_etat: string | null; attestation_assurance_fournie: boolean | null; adresse_restitution_depot: string | null; observations: string | null }, ctx };
}

export async function assemblerEdl(
  supabase: SupabaseClient,
  orgId: string,
  edlId: string
): Promise<Assemblage> {
  const charge = await chargerEdl(supabase, orgId, edlId);
  if ("erreur" in charge) return charge;
  const { edl, ctx } = charge;
  const sortie = edl.type === "sortie";

  const [{ data: lignes }, { data: compteurs }, { data: cles }, comparatifRes, restitutionRes, entreeRes] =
    await Promise.all([
      supabase
        .from("edl_lignes")
        .select("categorie, piece, libelle, etat, commentaire, photo_document_id")
        .eq("edl_id", edlId)
        .order("ordre"),
      supabase.from("edl_compteurs").select("type, numero, releve").eq("edl_id", edlId).order("created_at"),
      supabase.from("edl_cles").select("libelle, nombre, reference").eq("edl_id", edlId).order("created_at"),
      sortie ? supabase.rpc("comparatif_edl", { p_bail: edl.bail_id }) : Promise.resolve({ data: [] }),
      sortie
        ? supabase
            .from("restitutions")
            .select("id, retenues(libelle, cout, duree_vie_ans, age_ans, montant_retenu)")
            .eq("bail_id", edl.bail_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // P0-06 : l'entrée signée du même bail, la même que celle que l'écran de saisie met en regard de la sortie.
      sortie
        ? supabase
            .from("etats_des_lieux")
            .select("date_edl, signe_le")
            .eq("bail_id", edl.bail_id)
            .eq("organization_id", orgId)
            .eq("type", "entree")
            .eq("etat", "signe")
            .order("date_edl", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const entreeSignee = entreeRes.data as { date_edl: string | null; signe_le: string | null } | null;

  const photos = await chargerPhotosEdl(supabase, orgId, ((lignes ?? []) as LigneEdl[]).map((l) => l.photo_document_id));

  const f = new Fusion();
  const document = construireEdl({
    type: edl.type,
    photos,
    reference: referenceCourte("EDL", edl.id),
    dateEdl: edl.date_edl,
    dateEdlEntree: entreeSignee ? entreeSignee.date_edl ?? entreeSignee.signe_le : null,
    signeLe: edl.signe_le,
    personnesPresentes: edl.personnes_presentes,
    detecteurFumeePresent: edl.detecteur_fumee_present,
    detecteurFumeeEtat: edl.detecteur_fumee_etat,
    attestationAssuranceFournie: edl.attestation_assurance_fournie,
    adresseRestitutionDepot: edl.adresse_restitution_depot,
    observations: edl.observations,
    lignes: (lignes ?? []) as LigneEdl[],
    compteurs: (compteurs ?? []) as DonneesEdl["compteurs"],
    cles: (cles ?? []) as DonneesEdl["cles"],
    comparatif: ((comparatifRes.data ?? []) as DonneesEdl["comparatif"]),
    retenues: ((restitutionRes.data as { retenues?: DonneesEdl["retenues"] } | null)?.retenues ?? []),
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    exp: expediteur(ctx),
    f,
  });

  return {
    document,
    titreGed: sortie ? "État des lieux de sortie (généré)" : "État des lieux d'entrée (généré)",
    nomFichier: `edl-${edl.type}-${(edl.date_edl ?? "").slice(0, 10) || "brouillon"}`,
    liens: [
      { entite: "bail", entiteId: edl.bail_id },
      { entite: "lot", entiteId: ctx.lot.id },
      ...liensLocataires(ctx),
    ],
  };
}
