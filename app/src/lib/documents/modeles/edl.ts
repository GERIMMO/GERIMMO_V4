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
} from "./communs";
import type { Assemblage } from "./index";

const ETATS: Record<string, string> = { neuf: "Neuf", bon: "Bon", usage: "Usage", mauvais: "Mauvais" };

export type LigneEdl = {
  categorie: string;
  piece: string | null;
  libelle: string;
  etat: string | null;
  commentaire: string | null;
};

export type DonneesEdl = {
  type: "entree" | "sortie";
  reference: string;
  dateEdl: string | null;
  signeLe: string | null;
  lignes: LigneEdl[];
  compteurs: { type: string; numero: string | null; releve: string | null }[];
  cles: { libelle: string; nombre: number; reference: string | null }[];
  comparatif: { libelle: string; etat_entree: string | null; etat_sortie: string | null; ecart: boolean }[];
  retenues: { libelle: string; cout: number | null; duree_vie_ans: number | null; age_ans: number | null; montant_retenu: number }[];
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  exp: ReturnType<typeof expediteur>;
  f: Fusion;
};

function groupesDeLignes(lignes: LigneEdl[]): Map<string, LigneEdl[]> {
  const groupes = new Map<string, LigneEdl[]>();
  for (const l of lignes) {
    const cle = l.piece ?? (l.categorie === "equipement" ? "Équipements" : "Général");
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(l);
  }
  return groupes;
}

export function construireEdl(d: DonneesEdl) {
  const f = d.f;
  const entree = d.type === "entree";
  const titreDoc = entree ? "État des lieux d'entrée" : "État des lieux de sortie";

  const grilles = [...groupesDeLignes(d.lignes).entries()]
    .map(
      ([piece, lignes]) => `
      <h3 style="margin-top:14pt">${echapper(piece)}</h3>
      ${tableau(
        [{ libelle: "Élément" }, { libelle: "État" }, { libelle: "Observations" }],
        lignes.map((l) => [
          echapper(l.libelle),
          l.etat ? echapper(ETATS[l.etat] ?? l.etat) : f.champ(null, "neuf, bon, usagé, mauvais"),
          l.commentaire ? echapper(l.commentaire) : "—",
        ])
      )}`
    )
    .join("");

  const ecarts = d.comparatif.filter((c) => c.ecart);
  const totalRetenues = d.retenues.reduce((s, r) => s + Number(r.montant_retenu), 0);

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: d.dateEdl ?? new Date().toISOString() })}
    ${titre(titreDoc, d.logementAdresse, [
      "Article 3-2 de la loi n° 89-462 du 6 juillet 1989 · décret n° 2016-382 du 30 mars 2016",
    ])}
    ${cartouches([
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")}`],
      ["Établi le", f.date(d.dateEdl)],
      ["Personnes présentes", f.champ(null, "bailleur, locataire, tiers…")],
    ])}
    <p>Le présent état des lieux est établi contradictoirement et amiablement entre les parties,
    lors de la ${entree ? "remise" : "restitution"} des clés. Il est joint au contrat de location et
    en fait partie intégrante. Il décrit le logement et constate l'état des revêtements, équipements
    et éléments qui le composent.</p>
    ${grilles || `<p class="mentions">La grille est vide — déclarez les pièces du lot puis régénérez la grille.</p>`}

    ${section("Relevés de compteurs")}
    ${
      d.compteurs.length
        ? tableau(
            [{ libelle: "Fluide" }, { libelle: "Numéro de compteur" }, { libelle: "Index relevé", droite: true }],
            d.compteurs.map((c) => [
              echapper(c.type),
              c.numero ? echapper(c.numero) : f.champ(null, "numéro de compteur"),
              c.releve ? echapper(c.releve) : f.champ(null, "index"),
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
              String(c.nombre),
            ])
          )
        : `<p>${f.champ(null, "clés et moyens d'accès")}</p>`
    }

    ${
      entree
        ? `${section("Équipements de sécurité")}
           <p>Détecteur avertisseur autonome de fumée : ${f.champ(null, "présent, absent")} —
           état constaté : ${f.champ(null, "état constaté")}.<br/>
           Attestation d'assurance du locataire fournie : ${f.champ(null, "attestation fournie ou non")}.</p>`
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
           <p>Adresse de restitution du dépôt de garantie : ${f.champ(null, "adresse de restitution du dépôt")}.</p>`
    }

    ${section("Observations des parties")}
    <p>${f.champ(null, "observations des parties")}</p>
    <p class="mentions">${
      entree
        ? "Le locataire peut demander à compléter le présent état des lieux dans les dix jours de sa signature (pour tout élément) et pendant le premier mois de la période de chauffe (pour le chauffage)."
        : "Le dépôt de garantie est restitué dans un délai maximal d'un mois si le présent état est conforme à l'entrée, de deux mois dans le cas contraire, déduction faite des sommes justifiées restant dues."
    }</p>
    ${faitA(f, d.exp.ville, d.signeLe ?? d.dateEdl ?? new Date().toISOString(), ", en deux exemplaires.")}
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

async function chargerEdl(
  supabase: SupabaseClient,
  orgId: string,
  edlId: string
): Promise<{ edl: { id: string; bail_id: string; type: "entree" | "sortie"; etat: string; date_edl: string | null; signe_le: string | null }; ctx: ContexteBail } | { erreur: string }> {
  const { data: edl } = await supabase
    .from("etats_des_lieux")
    .select("id, bail_id, type, etat, date_edl, signe_le")
    .eq("id", edlId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!edl) return { erreur: "État des lieux introuvable." };
  const ctx = await chargerContexteBail(supabase, orgId, edl.bail_id);
  if ("erreur" in ctx) return ctx;
  return { edl: edl as { id: string; bail_id: string; type: "entree" | "sortie"; etat: string; date_edl: string | null; signe_le: string | null }, ctx };
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

  const [{ data: lignes }, { data: compteurs }, { data: cles }, comparatifRes, restitutionRes] =
    await Promise.all([
      supabase
        .from("edl_lignes")
        .select("categorie, piece, libelle, etat, commentaire")
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
    ]);

  const f = new Fusion();
  const document = construireEdl({
    type: edl.type,
    reference: referenceCourte("EDL", edl.id),
    dateEdl: edl.date_edl,
    signeLe: edl.signe_le,
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
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
