// Facture d'honoraires de gestion — la dernière entrée du catalogue restée
// « en préparation ». Cible : le mandat ; le mois se choisit au geste.
//
// Ce que ce modèle a de particulier par rapport aux 54 autres : il ÉMET.
// Les autres documents constatent un dossier et peuvent être régénérés sans
// conséquence ; une facture consomme un numéro dans une séquence
// chronologique continue (art. L441-9 du code de commerce). Le numéro vient
// donc de la base — `emettre_facture_honoraires` — et non d'un calcul sur
// l'identifiant du dossier. Régénérer le PDF reprend la même facture.
//
// ⚠ HT ou TTC : le mandat réellement signé (voir `mandat-gestion.ts`)
// intitule son taux « % TTC » et stipule des honoraires « calculés au taux
// ci-dessus sur les sommes encaissées ». La maquette v6 du 08/09 les
// présentait au contraire HT + 20 %. Le contrat signé l'emporte : le montant
// inscrit au journal est TTC, et la facture en EXTRAIT la TVA au lieu de
// l'ajouter — sans quoi le mandant paierait 20 % de plus que ce qu'il a
// signé. Détail dans la migration 20260914190000_facture_honoraires.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  echapper,
  enTete,
  eur,
  facultatif,
  formaterDateFr,
  section,
  tableau,
  titre,
} from "../gabarit";
import { lireLignes, montant, texte, RefusDocument } from "./catalogue-bail";
import { referenceCourte } from "./communs";
import type { Assemblage, LienDocument } from "./index";

// Le taux de droit commun applicable aux prestations de gestion locative.
export const TAUX_TVA_HONORAIRES = 20;

export type LigneFacture = {
  date: string;
  lot: string | null;
  libelle: string | null;
  // Montant TTC tel qu'inscrit au journal ; négatif pour une annulation
  montantTtc: number;
};

export type DonneesFactureHonoraires = {
  numero: string;
  emiseLe: string;
  mois: string;
  finPeriode: string;
  organisation: {
    nom: string;
    adresse: string | null;
    ville: string | null;
    email: string | null;
    telephone: string | null;
    siret: string;
    tvaIntracom: string | null;
    tvaFranchise: boolean;
    cartePro: string | null;
    garantieFinanciere: string | null;
    iban: string | null;
  };
  client: { nom: string; adresse: string | null; qualite: string | null };
  referenceMandat: string;
  lignes: LigneFacture[];
  totalHt: number;
  tva: number;
  tauxTva: number;
  totalTtc: number;
  f: Fusion;
};

const moisEnToutesLettres = (mois: string): string => {
  const d = new Date(`${mois}-01T12:00:00`);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

export function construireFactureHonoraires(d: DonneesFactureHonoraires): string {
  const f = d.f;
  const o = d.organisation;
  const periode = moisEnToutesLettres(d.mois);

  // Une facture ne se signe pas : elle s'émet. Les mentions de l'émetteur
  // tiennent lieu d'identification (art. 242 nonies A annexe II du CGI).
  const lignesTable = d.lignes.map((l) => [
    formaterDateFr(l.date),
    echapper(l.lot ?? "—"),
    echapper(l.libelle ?? "Honoraires de gestion"),
    eur(l.montantTtc),
  ]);

  return `
    ${enTete(f, { nom: o.nom, adresse: o.adresse, email: o.email, telephone: o.telephone }, {
      libelle: "Facture",
      reference: d.numero,
      etabliLe: d.emiseLe,
    })}
    ${titre("Facture d’honoraires", `Gestion locative — ${echapper(periode)}`, [
      "Articles L441-9 du code de commerce et 242 nonies A de l’annexe II au code général des impôts",
    ])}
    ${cartouches([
      [
        "Émetteur",
        `<div>${f.champ(o.nom, "dénomination de l’agence")}</div>
         <div>${f.champ(o.adresse, "siège social")}</div>
         <div>SIRET ${f.champ(o.siret, "SIRET")}</div>`,
      ],
      [
        "Client",
        `<div>${f.champ(d.client.nom, "nom du mandant")}</div>
         <div>${f.champ(d.client.adresse, "adresse du mandant")}</div>
         <div>Mandat ${echapper(d.referenceMandat)}</div>`,
      ],
    ])}

    ${section("Prestation facturée")}
    <p>Gestion locative des lots confiés au mandat ${echapper(d.referenceMandat)}, exécutée du
    ${f.date(`${d.mois}-01`)} au ${f.date(d.finPeriode)}. Honoraires calculés au taux du mandat sur
    les sommes encaissées pour le compte du mandant sur la période.</p>
    ${tableau(
      [
        { libelle: "Date" },
        { libelle: "Lot" },
        { libelle: "Détail" },
        { libelle: "Montant TTC", droite: true },
      ],
      lignesTable
    )}

    ${section("Décompte")}
    ${tableau(
      [{ libelle: "Base" }, { libelle: "Montant", droite: true }],
      [
        ["Total hors taxes", eur(d.totalHt)],
        [
          o.tvaFranchise ? "TVA" : `TVA au taux de ${d.tauxTva.toLocaleString("fr-FR")} %`,
          o.tvaFranchise ? "Non applicable" : eur(d.tva),
        ],
        ["<b>Total toutes taxes comprises</b>", `<b>${eur(d.totalTtc)}</b>`],
      ]
    )}
    ${
      o.tvaFranchise
        ? `<p class="mentions">TVA non applicable, article 293 B du code général des impôts.</p>`
        : `<p class="mentions">N° de TVA intracommunautaire : ${f.champ(o.tvaIntracom, "numéro de TVA intracommunautaire")}.</p>`
    }

    ${section("Règlement")}
    <p>Conformément au mandat de gestion, ces honoraires sont prélevés sur les sommes encaissées
    pour le compte du mandant lors de la reddition de comptes : le rapport de gestion de
    ${echapper(periode)} en présente le décompte et le solde versé. À défaut de prélèvement, le
    règlement est exigible à réception de la présente facture, par virement au compte
    ${facultatif(o.iban)}.</p>
    <p class="mentions">Tout retard de paiement donne lieu à des pénalités exigibles le jour suivant
    la date de règlement, au taux appliqué par la Banque centrale européenne à son opération de
    refinancement la plus récente majoré de 10 points de pourcentage. Lorsque le client est un
    professionnel, une indemnité forfaitaire pour frais de recouvrement de 40 € est en outre due
    (article L441-10 du code de commerce). Aucun escompte n’est accordé pour paiement anticipé.</p>

    ${section("Mentions de l’émetteur")}
    <p class="mentions">${f.champ(o.nom, "dénomination de l’agence")} — SIRET
    ${f.champ(o.siret, "SIRET")}<br/>
    Carte professionnelle : ${facultatif(o.cartePro)}<br/>
    Garantie financière : ${facultatif(o.garantieFinanciere)}</p>
    <p class="mentions">Cette facture constate des honoraires déjà inscrits au journal de gestion.
    Elle ne vaut ni ordre de virement, ni encaissement, ni quittance de règlement.</p>
  `;
}

// Le retour d'une fonction PostgREST composite arrive en objet ; certains
// bancs le rendent en tableau d'une ligne. On accepte les deux plutôt que de
// faire dépendre l'émission d'une forme de transport.
function premiereLigne(donnees: unknown): Record<string, unknown> | null {
  if (Array.isArray(donnees)) return (donnees[0] as Record<string, unknown>) ?? null;
  if (donnees && typeof donnees === "object") return donnees as Record<string, unknown>;
  return null;
}

export async function assemblerFactureHonoraires(
  db: SupabaseClient,
  orgId: string,
  cibleId: string,
  options: Record<string, string> = {}
): Promise<Assemblage> {
  try {
    const f = new Fusion();

    const orgs = await lireLignes(db.from("organizations").select("*").eq("id", orgId).limit(1));
    if (!orgs.length) throw new RefusDocument("Organisation inaccessible.");
    const org = orgs[0];
    if (texte(org.type) !== "agence") {
      throw new RefusDocument("La facture d’honoraires concerne les agences de gestion.");
    }

    // Les mentions sans lesquelles le document ne serait pas une facture. On
    // refuse AVANT d'émettre : un numéro consommé sur un PDF invalide ne se
    // rattrape pas, la séquence étant continue.
    const absentes = [
      !texte(org.siret).trim() ? "son SIRET" : null,
      !texte(org.address_line1).trim() ? "son adresse" : null,
      !org.tva_franchise && !texte(org.tva_intracom).trim()
        ? "son numéro de TVA intracommunautaire"
        : null,
    ].filter(Boolean) as string[];
    if (absentes.length) {
      throw new RefusDocument(
        `Une facture doit porter ${absentes.join(", ")}. Complétez le profil de l’organisation avant d’émettre.`
      );
    }

    const mois = texte(options.mois).trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
      throw new RefusDocument("Choisissez le mois à facturer.");
    }
    const debut = `${mois}-01`;
    const finDate = new Date(`${debut}T12:00:00Z`);
    finDate.setUTCMonth(finDate.getUTCMonth() + 1);
    const fin = finDate.toISOString().slice(0, 10);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    // Facturer un mois que les encaissements peuvent encore alimenter
    // figerait un montant faux sous un numéro définitif.
    if (fin > aujourdhui) {
      throw new RefusDocument("Ce mois n’est pas révolu : attendez sa fin pour le facturer.");
    }

    const mandats = await lireLignes(
      db.from("mandats").select("*").eq("organization_id", orgId).eq("id", cibleId).limit(1)
    );
    if (!mandats.length) throw new RefusDocument("Le mandat demandé est introuvable ou inaccessible.");
    const mandat = mandats[0];
    const mandants = await lireLignes(
      db.from("persons").select("*").eq("organization_id", orgId).eq("id", texte(mandat.person_id)).limit(1)
    );
    if (!mandants.length) throw new RefusDocument("Le mandant du mandat est introuvable.");
    const mandant = mandants[0];

    // Les honoraires sont écrits au journal par le déclencheur des
    // encaissements, avec le mandat en référence. Les annulations
    // (contre-passations) portent le sens inverse et se déduisent.
    const ecritures = await lireLignes(
      db
        .from("ecritures")
        .select("*")
        .eq("organization_id", orgId)
        .eq("mandat_id", texte(mandat.id))
        .eq("categorie", "honoraires")
        .gte("date_imputation", debut)
        .lt("date_imputation", fin)
        .order("date_imputation")
    );
    const centimes = ecritures.reduce(
      (somme, e) => somme + (texte(e.sens) === "depense" ? 1 : -1) * Math.round(montant(e.montant) * 100),
      0
    );
    if (centimes === 0 && ecritures.length === 0) {
      throw new RefusDocument("Aucun honoraire n’est enregistré sur ce mandat pour ce mois.");
    }
    if (centimes <= 0) {
      throw new RefusDocument(
        "Les annulations du mois annulent ou dépassent les honoraires enregistrés : il n’y a rien à facturer. Une facture déjà émise se corrige par un avoir, hors de ce modèle."
      );
    }
    const totalTtcCalcule = centimes / 100;

    const lotsIds = [...new Set(ecritures.map((e) => texte(e.lot_id)).filter(Boolean))];
    const lots = lotsIds.length
      ? await lireLignes(db.from("lots").select("id,nom").eq("organization_id", orgId).in("id", lotsIds))
      : [];
    const nomsLots = new Map(lots.map((l) => [texte(l.id), texte(l.nom)]));

    // Émission : la base attribue (ou retrouve) le numéro.
    const tauxTva = org.tva_franchise ? 0 : TAUX_TVA_HONORAIRES;
    const { data, error } = await db.rpc("emettre_facture_honoraires", {
      p_organization_id: orgId,
      p_mandat_id: texte(mandat.id),
      p_periode: debut,
      p_total_ttc: totalTtcCalcule,
      p_taux_tva: tauxTva,
    });
    if (error) {
      throw new RefusDocument(
        "Le numéro de facture n’a pas pu être attribué. Vérifiez que vous êtes responsable de l’agence, puis réessayez."
      );
    }
    const facture = premiereLigne(data);
    if (!facture) throw new RefusDocument("Le numéro de facture n’a pas pu être attribué. Réessayez.");

    // Une facture émise ne se réécrit pas. Si le journal a bougé depuis, on
    // le dit plutôt que de rendre un PDF qui contredirait la facture reçue
    // par le mandant sous le même numéro.
    const totalTtcEmis = montant(facture.total_ttc);
    if (Math.round(totalTtcEmis * 100) !== centimes) {
      throw new RefusDocument(
        `La facture ${texte(facture.numero)} a déjà été émise pour ${eur(totalTtcEmis)} ; le journal du mois totalise désormais ${eur(totalTtcCalcule)}. Une facture émise se corrige par un avoir, jamais en la régénérant.`
      );
    }

    const donnees: DonneesFactureHonoraires = {
      numero: texte(facture.numero),
      emiseLe: texte(facture.emise_le) || aujourdhui,
      mois,
      finPeriode: new Date(finDate.getTime() - 86400000).toISOString().slice(0, 10),
      organisation: {
        nom: texte(org.name),
        adresse: [org.address_line1, [org.postal_code, org.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ") || null,
        ville: texte(org.city) || null,
        email: texte(org.email_contact) || null,
        telephone: texte(org.telephone) || null,
        siret: texte(org.siret),
        tvaIntracom: texte(org.tva_intracom) || null,
        tvaFranchise: Boolean(org.tva_franchise),
        cartePro: texte(org.carte_pro) || null,
        garantieFinanciere: texte(org.garantie_financiere) || null,
        iban: texte(org.iban) || null,
      },
      client: {
        nom: [mandant.nom, mandant.prenom].filter(Boolean).join(" "),
        adresse:
          [mandant.address_line1, [mandant.postal_code, mandant.city].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ") || null,
        qualite: texte(mandant.qualite) || null,
      },
      referenceMandat: referenceCourte("MANDAT", texte(mandat.id)),
      lignes: ecritures.map((e) => ({
        date: texte(e.date_imputation),
        lot: nomsLots.get(texte(e.lot_id)) ?? null,
        libelle: texte(e.libelle) || null,
        montantTtc: (texte(e.sens) === "depense" ? 1 : -1) * montant(e.montant),
      })),
      totalHt: montant(facture.total_ht),
      tva: montant(facture.tva),
      tauxTva: montant(facture.taux_tva),
      totalTtc: totalTtcEmis,
      f,
    };

    const corps = construireFactureHonoraires(donnees);
    const liens: LienDocument[] = [
      { entite: "mandat", entiteId: texte(mandat.id) },
      { entite: "personne", entiteId: texte(mandant.id) },
    ];

    return {
      document: assemblerPage({
        f,
        titreDocument: "Facture d’honoraires",
        nomPied: "Facture d’honoraires",
        reference: donnees.numero,
        corps: `<style>.bloc-titre{padding:10pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}.cartouches{margin:10pt 0}p{margin:4pt 0}</style>${corps}`,
      }),
      titreGed: `Facture d’honoraires ${donnees.numero}`,
      nomFichier: `facture-honoraires-${donnees.numero}`,
      liens,
    };
  } catch (e) {
    if (e instanceof RefusDocument) return { erreur: e.message };
    throw e;
  }
}
