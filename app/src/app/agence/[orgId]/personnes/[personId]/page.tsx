import Link from "next/link";
import type { ReactNode } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { EnteteFiche } from "@/components/fiche-parc";
import { aujourdhuiParis, eur, formaterDate } from "@/lib/ged";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { TYPES_PIECE_DOSSIER, statutEcheancePiece } from "@/lib/dossier";
import {
  ETATS_BAIL,
  COULEURS_ETAT_BAIL,
  ETATS_MANDAT,
  COULEURS_ETAT_MANDAT,
} from "@/lib/baux";
import { nomComplet, rolesDePersonne } from "@/lib/roles-personnes";
import {
  FormulairePiece,
  FormulaireNouvelleVersion,
  BoutonValiderAttestation,
} from "./formulaire-piece";
import { FormulaireIdentite, BoutonArchiverPersonne } from "./formulaire-identite";
import {
  FormulaireMandat,
  FormulaireLigneMandat,
  BoutonsEtatMandat,
  SelectTitulaireMandat,
  BoutonRetirerLigne,
} from "./formulaire-mandat";
import { FormulaireInvitation } from "./formulaire-invitation";
import { CarteMessages } from "./carte-messages";
import { CartePiecesDemandees } from "./carte-pieces-demandees";
import { EchecLecture, PageEchecLecture } from "../../documents/echec-lecture";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";

export const metadata = { title: "Fiche personne — Gerimmo" };

// Les pièces réclamées affichées sur la fiche sont bornées aux plus récentes.
// La carte le DIT quand elle atteint le plafond : une demande en attente qui
// disparaît en silence est une relance qu'on ne fera jamais.
const PLAFOND_DEMANDES = 20;

// Une ligne de faits sous le titre (contact, adresse). Le « · » ouvre chaque
// fait après le premier : au passage à la ligne, il part AVEC son fait au lieu
// de rester seul en bout de ligne, et un fait ne se coupe jamais en deux
// (« 06 12 34 56 » / « 78 » au téléphone, relevé du 24/09).
function LigneFaits({ faits }: { faits: { cle: string; contenu: ReactNode; insecable?: boolean }[] }) {
  if (faits.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-2">
      {faits.map((f, i) => (
        <span key={f.cle} className={f.insecable ? "whitespace-nowrap" : "[overflow-wrap:anywhere]"}>
          {i > 0 && (
            <span aria-hidden className="mr-2">
              ·
            </span>
          )}
          {f.contenu}
        </span>
      ))}
    </span>
  );
}

// Un bail vivant vu depuis la fiche d'une personne (carte « Location en cours »)
type BailVivant = {
  id: string;
  etat: string;
  loyer_hc: number | string | null;
  charges: number | string | null;
  date_debut: string | null;
  lot: UnOuPlusieurs<{ nom: string; bien: UnOuPlusieurs<{ nom: string }> }>;
};
// Le mandat que l'en-tête résume : le plus avancé des mandats non résiliés
const ORDRE_MANDAT = ["actif", "preavis", "a_signer", "brouillon"];

const COLONNES_BAIL_VIVANT =
  "id, etat, loyer_hc, charges, date_debut, lot:lots!baux_lot_meme_org_fk(nom, bien:biens!lots_bien_id_fkey(nom))";

export default async function PagePersonne(
  props: PageProps<"/agence/[orgId]/personnes/[personId]">
) {
  const { orgId, personId } = await props.params;
  // « Ajouter un email » (carte Accès locataire) ouvre l'édition de la fiche
  const { modifier } = await props.searchParams;
  const { supabase, user, estProprietaire } = await verifierAccesEspace(orgId);
  // 24/09 : la rubrique porte le nom du menu — « Locataires & garants » chez
  // le propriétaire direct. Le retour disait « Personnes » à un clic de là.
  const rubrique = estProprietaire ? "Locataires & garants" : "Personnes";
  const aujourdhui = aujourdhuiParis();

  const { data: personne, error: erreurPersonne } = await supabase
    .from("persons")
    .select(
      "id, nom, prenom, email, telephone, date_naissance, commune_naissance, address_line1, postal_code, city, qualite, account_id"
    )
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Lecture refusée ≠ fiche supprimée : un 404 enverrait le gestionnaire
  // recréer une fiche qui existe (relevé du 11/09).
  if (erreurPersonne) {
    return (
      <PageEchecLecture
        titre="Fiche personne"
        quoi={["cette fiche"]}
        retour={{ href: `/agence/${orgId}/personnes`, libelle: rubrique }}
      />
    );
  }
  if (!personne) notFound();

  // Quatre lectures indépendantes — un seul aller-retour
  const [
    // Pièces courantes du dossier (versioning : seules les non remplacées)
    { data: pieces, error: erreurPieces },
    // Versions antérieures (recette 13/08) : l'historique reste consultable —
    // on remonte la chaîne remplace_id de chaque pièce courante.
    { data: liensDossier, error: erreurLiensDossier },
    // Lots détenus par la personne (affichés sur la fiche, recette 14/08 —
    // et base des mandats)
    { data: detentions, error: erreurDetentions },
    // Mandats de la personne
    { data: mandats, error: erreurMandats },
    // Ce qu'elle loue ou garantit (24/09) : la fiche d'un locataire ne disait
    // ni ce qu'il occupe ni où est son bail — Parc → bien → lot → bail.
    { data: liensBail, error: erreurLiensBail },
    { data: bauxPrincipal, error: erreurBauxPrincipal },
  ] = await Promise.all([
    supabase.rpc("dossier_personne", { p_person: personId }),
    supabase
      .from("document_liens")
      .select("document_id")
      .eq("organization_id", orgId)
      .eq("entite", "personne")
      .eq("entite_id", personId),
    // Même règle que la liste des personnes : une détention dont la fin est
    // encore à venir est une détention en cours (le rôle affiché en dépend).
    supabase
      .from("detentions")
      .select("lot_id, quote_part, date_debut")
      .eq("organization_id", orgId)
      .eq("person_id", personId)
      .or(`date_fin.is.null,date_fin.gte.${aujourdhui}`),
    supabase
      .from("mandats")
      .select("id, etat, date_rapport, seuil_delegation, agent_account_id")
      .eq("organization_id", orgId)
      .eq("person_id", personId)
      .order("created_at"),
    supabase
      .from("bail_personnes")
      .select("bail_id, role")
      .eq("organization_id", orgId)
      .eq("person_id", personId),
    supabase
      .from("baux")
      .select(COLONNES_BAIL_VIVANT)
      .eq("organization_id", orgId)
      .eq("locataire_principal", personId)
      .in("etat", ["actif", "preavis"]),
  ]);

  // « Confié à » (maquette v3, RM-18.1.3) : la liste des gérants de l'agence
  const { data: donneesGerants, error: erreurGerants } =
    !estProprietaire && (mandats ?? []).length > 0
      ? await supabase.rpc("org_membres_gerants", { org: orgId })
      : { data: [], error: null };
  // Fil de messages (espace locataire v10) — lire marque lus les messages du
  // locataire : ouvrir la fiche vaut prise de connaissance.
  const { data: filMessages, error: erreurMessages } = await supabase.rpc(
    "messages_personne",
    { p_org: orgId, p_person: personId }
  );
  const messages = (filMessages ?? []) as import("./carte-messages").MessagePersonne[];
  // Pièces réclamées (RM-0b.2.5) : en attente + reçues récemment
  const { data: demandesBrutes, error: erreurDemandes } = await supabase
    .from("pieces_demandees")
    .select("id, type, libelle, note, demandee_le, relancee_le, satisfaite_le")
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .order("demandee_le", { ascending: false })
    .limit(PLAFOND_DEMANDES);
  const demandesPieces = (demandesBrutes ?? []) as import("./carte-pieces-demandees").PieceDemandee[];
  const demandesTronquees = demandesPieces.length >= PLAFOND_DEMANDES;
  const gerants = ((donneesGerants ?? []) as { account_id: string; email: string; role: string }[])
    .map(({ account_id, email }) => ({ account_id, email }));

  // Perf 30/08 : ce qui ne dépend que de la première vague part en parallèle
  // (documents du dossier, lots détenus avec leur bien, lignes de mandats,
  // lots déjà couverts) — 8 allers-retours en cascade sont devenus 3 vagues.
  const idsDossier = (liensDossier ?? []).map((l) => l.document_id);
  const lotIds = [...new Set((detentions ?? []).map((d) => d.lot_id))];
  const mandatIds = (mandats ?? []).map((m) => m.id);
  const idsBauxLies = [
    ...new Set(((liensBail ?? []) as { bail_id: string }[]).map((l) => l.bail_id)),
  ];
  type LotAvecBien = { id: string; nom: string; bien_id: string; bien: UnOuPlusieurs<{ nom: string }> };
  const [
    { data: tousDocs, error: erreurDocs },
    { data: lots, error: erreurLots },
    { data: lignesCouvrantes, error: erreurCouvrantes },
    { data: lignes, error: erreurLignes },
    { data: bauxLies, error: erreurBauxLies },
  ] = await Promise.all([
      idsDossier.length
        ? supabase.from("documents").select("id, titre, remplace_id, created_at").in("id", idsDossier)
        : Promise.resolve({ data: [], error: null }),
      lotIds.length
        ? supabase
            .from("lots")
            .select("id, nom, bien_id, bien:biens!lots_bien_id_fkey(nom)")
            .in("id", lotIds)
        : Promise.resolve({ data: [], error: null }),
      // Lots déjà couverts par un mandat non résilié (le sien ou celui d'un
      // co-détenteur) : inutile de les proposer, la base les refuserait (RM-5.1.3).
      lotIds.length
        ? supabase
            .from("mandat_lignes")
            .select("lot_id, mandat:mandats!inner(etat)")
            .eq("organization_id", orgId)
            .in("lot_id", lotIds)
            .is("date_fin", null)
        : Promise.resolve({ data: [], error: null }),
      // Lignes des mandats
      mandatIds.length
        ? supabase
            .from("mandat_lignes")
            .select("id, mandat_id, lot_id, taux_honoraires, date_fin")
            .in("mandat_id", mandatIds)
        : Promise.resolve({ data: [], error: null }),
      // Baux vivants où elle est colocataire ou garante
      idsBauxLies.length
        ? supabase
            .from("baux")
            .select(COLONNES_BAIL_VIVANT)
            .eq("organization_id", orgId)
            .in("id", idsBauxLies)
            .in("etat", ["actif", "preavis"])
        : Promise.resolve({ data: [], error: null }),
    ]);
  type DocVersion = { id: string; titre: string | null; remplace_id: string | null; created_at: string };
  const docParId = new Map(((tousDocs ?? []) as DocVersion[]).map((d) => [d.id, d]));
  const versionsAnterieures = (documentId: string) => {
    const chaine: DocVersion[] = [];
    let courant = docParId.get(documentId);
    while (courant?.remplace_id && chaine.length < 50) {
      const precedent = docParId.get(courant.remplace_id);
      if (!precedent) break;
      chaine.push(precedent);
      courant = precedent;
    }
    return chaine;
  };

  const lotsDetenus = ((lots ?? []) as unknown as LotAvecBien[]);
  const lotsOptions = lotsDetenus.map((l) => ({
    id: l.id,
    libelle: `${premier(l.bien)?.nom ?? ""} · ${l.nom}`,
  }));
  const lotsCouverts = new Set(
    ((lignesCouvrantes ?? []) as { lot_id: string; mandat: UnOuPlusieurs<{ etat: string }> }[])
      .filter((l) => premier(l.mandat)?.etat !== "resilie")
      .map((l) => l.lot_id)
  );
  const lotsProposables = lotsOptions.filter((o) => !lotsCouverts.has(o.id));

  // Libellés des lots cités par les mandats — y compris ceux dont la détention
  // est close (un mandat résilié reste lisible : taux ET lots, recette 13/08).
  const lotsManquantsIds = [...new Set((lignes ?? []).map((l) => l.lot_id))].filter(
    (id) => !lotsOptions.some((o) => o.id === id)
  );
  const { data: lotsManquantsBrut, error: erreurLotsManquants } = lotsManquantsIds.length
    ? await supabase
        .from("lots")
        .select("id, nom, bien_id, bien:biens!lots_bien_id_fkey(nom)")
        .in("id", lotsManquantsIds)
    : { data: [], error: null };
  const lotsManquants = ((lotsManquantsBrut ?? []) as unknown as LotAvecBien[]);
  const libelleLot = (id: string) => {
    const option = lotsOptions.find((l) => l.id === id);
    if (option) return option.libelle;
    const lot = lotsManquants.find((l) => l.id === id);
    return lot ? `${premier(lot.bien)?.nom ?? ""} · ${lot.nom}` : id.slice(0, 8);
  };
  // La fiche du lot, où se règlent les quote-parts : tout le rang y mène
  // (retour du 24/09), pas seulement un mot.
  const cheminLot = (id: string) => {
    const lot = lotsDetenus.find((l) => l.id === id) ?? lotsManquants.find((l) => l.id === id);
    return lot ? `/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}` : null;
  };

  // Ce que la personne EST (24/09) — mêmes règles et mêmes puces que la liste
  // (lib/roles-personnes) : la liste disait « Propriétaire mandant », la
  // fiche ne disait rien, il fallait le deviner aux cartes plus bas.
  const liensVivants = ((liensBail ?? []) as { bail_id: string; role: string }[]);
  const bauxLiesVivants = new Set(((bauxLies ?? []) as { id: string }[]).map((b) => b.id));
  const roleSurBail = (role: string) =>
    liensVivants.some((l) => l.role === role && bauxLiesVivants.has(l.bail_id));
  const estLocataire = (bauxPrincipal ?? []).length > 0 || roleSurBail("colocataire");
  const estGarant = roleSurBail("garant");
  const avecMoi = (vrai: boolean) => new Set(vrai ? [personId] : []);
  const roles = rolesDePersonne(
    personId,
    {
      proprietaires: avecMoi((detentions ?? []).length > 0),
      mandants: avecMoi((mandats ?? []).some((m) => m.etat === "actif")),
      locataires: avecMoi(estLocataire),
      garants: avecMoi(estGarant),
    },
    estProprietaire
  );
  // Même libellé que la puce de la liste pour une fiche sans lien vivant
  const sansRole = estProprietaire ? "Sans bail en cours" : "Sans rôle en cours";
  const estSaFiche = personne.account_id === user.id;

  // Les baux vivants, vus depuis la personne : principal, colocataire, garant
  const roleBail = new Map(liensVivants.map((l) => [l.bail_id, l.role]));
  const locations = [
    ...((bauxPrincipal ?? []) as unknown as BailVivant[]).map((b) => ({ ...b, role: "Locataire" })),
    ...((bauxLies ?? []) as unknown as BailVivant[])
      .filter((b) => !(bauxPrincipal ?? []).some((p) => p.id === b.id))
      .map((b) => ({
        ...b,
        role: roleBail.get(b.id) === "garant" ? "Garant" : "Colocataire",
      })),
  ];
  const titreLocations = locations.every((l) => l.role === "Garant")
    ? "Garant de"
    : locations.some((l) => l.role === "Garant")
      ? "Baux en cours"
      : "Location en cours";

  // Faits de l'en-tête : les chiffres qui évitent de lire la suite
  const mandatCourant = [...(mandats ?? [])]
    .filter((m) => m.etat !== "resilie")
    .sort((a, b) => ORDRE_MANDAT.indexOf(a.etat) - ORDRE_MANDAT.indexOf(b.etat))[0];
  // Un seul lot : la carte juste dessous le montre en entier, le chiffre ne
  // sert qu'au-delà (même règle que la fiche bien).
  const faitsEntete = [
    ...((detentions ?? []).length > 1
      ? [{ libelle: "Lots détenus", valeur: String((detentions ?? []).length) }]
      : []),
    ...(!estProprietaire && mandatCourant
      ? [{ libelle: "Mandat", valeur: ETATS_MANDAT[mandatCourant.etat] ?? mandatCourant.etat }]
      : []),
  ];

  // Ce qui se lisait seulement en ouvrant « Modifier la fiche » (24/09) :
  // l'adresse et l'état civil s'affichent en lecture, les vides sont omis.
  const adresse = [
    personne.address_line1,
    [personne.postal_code, personne.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const naissance = personne.date_naissance
    ? `né(e) le ${formaterDate(personne.date_naissance)}${personne.commune_naissance ? ` à ${personne.commune_naissance}` : ""}`
    : personne.commune_naissance
      ? `né(e) à ${personne.commune_naissance}`
      : null;

  // Une fiche personne est faite de dix lectures. Chacune qui échoue enlève
  // en silence une carte entière — dossier vide, aucun mandat, aucun message —
  // et l'écran devient rassurant au lieu d'être exact.
  const lecturesManquees = [
    erreurPieces && "les pièces du dossier",
    (erreurLiensDossier || erreurDocs) && "l'historique des versions",
    erreurDetentions && "les lots détenus",
    (erreurMandats || erreurLignes) && "les mandats de gestion",
    erreurGerants && "les gestionnaires de l'agence",
    erreurMessages && "le fil de messages",
    erreurDemandes && "les pièces réclamées",
    (erreurLots || erreurLotsManquants || erreurCouvrantes) &&
      "les lots rattachables à un mandat",
    (erreurLiensBail || erreurBauxPrincipal || erreurBauxLies) &&
      "les baux (rôles locataire et garant)",
  ].filter((q): q is string => Boolean(q));
  // Sans ces lectures, « aucun lot à couvrir » serait une affirmation fausse
  const lotsIllisibles = Boolean(erreurLots || erreurCouvrantes || erreurDetentions);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      {/* 24/09 : l'en-tête commun des fiches (bien, lot) — surtitre, filet,
          puce de rôle, faits chiffrés — au lieu d'un en-tête fait main qui ne
          disait pas ce qu'est la personne. */}
      <div>
        <EnteteFiche
          retour={{ href: `/agence/${orgId}/personnes`, libelle: rubrique }}
          surtitre={personne.qualite || (personne.prenom ? "Personne physique" : "Personne morale")}
          titre={nomComplet(personne)}
          badge={
            roles.length > 0 ? (
              roles.map((r) => (
                <span key={r.libelle} className={`puce ${r.puce}`}>
                  {r.libelle}
                </span>
              ))
            ) : (
              <span className="puce puce-grise">{sansRole}</span>
            )
          }
          sousTitre={
            <>
              <LigneFaits
                faits={
                  personne.email || personne.telephone
                    ? [
                        ...(personne.email ? [{ cle: "email", contenu: personne.email }] : []),
                        ...(personne.telephone
                          ? [{ cle: "tel", contenu: personne.telephone, insecable: true }]
                          : []),
                      ]
                    : [{ cle: "contact", contenu: "Sans email ni téléphone" }]
                }
              />
              <LigneFaits
                faits={[
                  ...(adresse ? [{ cle: "adresse", contenu: adresse }] : []),
                  ...(naissance ? [{ cle: "naissance", contenu: naissance }] : []),
                ]}
              />
            </>
          }
          faits={faitsEntete}
        />
        {/* L'ancre de « Ajouter un email » (carte Accès locataire) */}
        <div id="identite" className="mt-3 flex scroll-mt-20 flex-wrap items-start gap-2">
          <FormulaireIdentite
            // Remonté ouvert quand on arrive par « Ajouter un email »
            key={modifier === "1" ? "ouvert" : "replie"}
            ouvertInitial={modifier === "1"}
            orgId={orgId}
            personId={personId}
            nom={personne.nom}
            prenom={personne.prenom}
            email={personne.email}
            telephone={personne.telephone}
            dateNaissance={personne.date_naissance}
            communeNaissance={personne.commune_naissance}
            adresse={personne.address_line1}
            codePostal={personne.postal_code}
            ville={personne.city}
            qualite={personne.qualite}
          />
          {/* Une fiche reliée à un compte ne s'archive pas (le serveur refuse) :
              deux clics pour finir sur une erreur, c'était un geste en trop. */}
          {!personne.account_id && (
            <BoutonArchiverPersonne orgId={orgId} personId={personId} />
          )}
        </div>
      </div>

      <EchecLecture quoi={lecturesManquees} />

      {/* Ce qu'elle loue ou garantit : tout le rang mène au bail (24/09) */}
      {locations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{titreLocations}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {locations.map((b) => {
                const lot = premier(b.lot);
                const loyerCc =
                  b.loyer_hc != null ? Number(b.loyer_hc) + Number(b.charges ?? 0) : null;
                const faitsBail = [
                  b.role,
                  loyerCc !== null ? `${eur(loyerCc)} charges comprises` : null,
                  b.date_debut ? `depuis le ${formaterDate(b.date_debut)}` : null,
                ].filter((f): f is string => Boolean(f));
                return (
                  <li key={b.id}>
                    <Link
                      href={`/agence/${orgId}/baux/${b.id}`}
                      // `.rang` (25/09) : le rang de liste de l'espace, avec son
                      // liseré de survol — la flèche n'était plus seule à dire
                      // qu'il se clique.
                      className="rang -mx-2 flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        {lot ? `${premier(lot.bien)?.nom ?? ""} · ${lot.nom}` : "Lot"}
                        {b.etat !== "actif" && (
                          <span className={COULEURS_ETAT_BAIL[b.etat] ?? "puce puce-grise"}>
                            {ETATS_BAIL[b.etat] ?? b.etat}
                          </span>
                        )}
                      </span>
                      {/* Chaque fait d'un bloc : au téléphone, « depuis le » ne
                          se sépare plus de sa date. La flèche suit le dernier. */}
                      <span className="text-xs text-muted-foreground sm:text-sm">
                        <LigneFaits
                          faits={faitsBail.map((f, i) => ({
                            cle: String(i),
                            insecable: true,
                            contenu:
                              i === faitsBail.length - 1 ? (
                                <>
                                  {f} <span aria-hidden>→</span>
                                </>
                              ) : (
                                f
                              ),
                          }))}
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Détentions en cours : la fiche montre ce que la personne possède
          (recette 14/08 — l'assistant crée la détention, la fiche l'affiche) */}
      {(detentions ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lots détenus</CardTitle>
            <CardDescription>
              Les quote-parts se règlent sur la fiche du lot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {(detentions ?? []).map((d) => (
                <li key={d.lot_id}>
                  {cheminLot(d.lot_id) ? (
                    // Au téléphone, libellé puis faits l'un sous l'autre : côte à
                    // côte, chacun cassait en deux lignes (24/09).
                    <Link
                      href={cheminLot(d.lot_id)!}
                      className="-mx-2 flex flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-sm hover:bg-[var(--survol)] sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span>{libelleLot(d.lot_id)}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
                        {Number(d.quote_part)} % · depuis le {formaterDate(d.date_debut)}{" "}
                        <span aria-hidden>→</span>
                      </span>
                    </Link>
                  ) : (
                    <div className="flex flex-col items-start gap-0.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span>{libelleLot(d.lot_id)}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
                        {Number(d.quote_part)} % · depuis le {formaterDate(d.date_debut)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Accès locataire : invitation — sans objet sur sa propre fiche
          (le propriétaire direct se retrouve dans Personnes, audit 06/09), et
          sur celle d'un propriétaire mandant, que l'invitation ferait entrer
          dans un espace LOCATAIRE (24/09). Une fiche sans rôle la garde :
          c'est souvent un locataire dont le bail n'est pas encore signé. */}
      {!estSaFiche && (estLocataire || estGarant || roles.length === 0) && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accès locataire</CardTitle>
          {/* Compte déjà créé : la ligne verte du formulaire suffit — inviter
              à donner un accès déjà donné brouillait l'état. */}
          {!personne.account_id && (
            <CardDescription>
              Donnez à cette personne l&apos;accès à son espace (dépôt d&apos;attestation,
              suivi) via une invitation par email.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <FormulaireInvitation
            orgId={orgId}
            personId={personId}
            email={personne.email}
            dejaInvite={Boolean(personne.account_id)}
          />
        </CardContent>
      </Card>
      )}

      {/* Dossier : pièces versionnées. L'ancre est la destination des alertes
          d'assurance et de pièce déposée — la fiche d'une personne est longue,
          y atterrir en haut fait chercher le bloc (relevé du 19/09). */}
      <Card id="pieces" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Pièces justificatives</CardTitle>
          <CardDescription>
            {estSaFiche ? "" : "Les pièces suivent la personne, d'un bail à l'autre. "}
            Chaque nouveau dépôt d&apos;un même type crée une version — l&apos;ancienne
            est conservée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 24/09 : un fait, pas une deuxième explication sous la première */}
          {(pieces ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {estSaFiche
                ? "Ajoutez vos pièces : identité, RIB, attestation…"
                : "Aucune pièce déposée."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(pieces ?? []).map(
                (p: {
                  document_id: string;
                  type: string;
                  titre: string | null;
                  expire_le: string | null;
                  verifie_le: string | null;
                }) => {
                  const anciennes = versionsAnterieures(p.document_id);
                  // Recette 21/08 : l'échéance de l'attestation est enfin
                  // visible côté agence, avec son état de vérification.
                  const echeancePiece = statutEcheancePiece(p.expire_le);
                  const estAttestation = p.type === "attestation_assurance";
                  // Documents-0 : rappel d'assurance (13) dès qu'une échéance existe
                  const boutonRappel = estAttestation && p.expire_le ? (
                    <BoutonGenererDocument
                      orgId={orgId}
                      code="rappel_assurance"
                      cibleId={p.document_id}
                      cheminRetour={`/agence/${orgId}/personnes/${personId}`}
                      libelle="Rappel PDF"
                      variant="ghost"
                    />
                  ) : null;
                  return (
                    <li key={p.document_id} className="py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="badge-statut text-muted-foreground">
                          {TYPES_PIECE_DOSSIER[p.type] ?? p.type}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {p.titre || "Sans titre"}
                          {anciennes.length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              v{anciennes.length + 1}
                            </span>
                          )}
                        </span>
                        {echeancePiece && (
                          <span className={`text-xs ${echeancePiece.classe}`}>
                            {echeancePiece.texte}
                          </span>
                        )}
                        {estAttestation &&
                          (p.verifie_le ? (
                            <span className="puce puce-loue">Validée</span>
                          ) : (
                            <span className="puce puce-prep">À vérifier</span>
                          ))}
                        <Link
                          href={`/agence/${orgId}/documents/${p.document_id}/fichier`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Ouvrir
                        </Link>
                        {estAttestation && !p.verifie_le && (
                          <BoutonValiderAttestation
                            orgId={orgId}
                            personId={personId}
                            documentId={p.document_id}
                          />
                        )}
                        {boutonRappel}
                      </div>
                      {anciennes.length > 0 && (
                        <details className="mt-1 pl-1 text-xs text-muted-foreground">
                          <summary className="cursor-pointer py-2">
                            Historique — {anciennes.length} version
                            {anciennes.length > 1 ? "s" : ""} antérieure
                            {anciennes.length > 1 ? "s" : ""} (conservée
                            {anciennes.length > 1 ? "s" : ""})
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-3">
                            {anciennes.map((v) => (
                              <li key={v.id}>
                                {v.titre || "Sans titre"} — déposée le{" "}
                                {formaterDate(v.created_at)} ·{" "}
                                <Link
                                  href={`/agence/${orgId}/documents/${v.id}/fichier`}
                                  className="underline underline-offset-2"
                                >
                                  ouvrir
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <details className="mt-1 pl-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer py-2 text-sm">
                          Déposer une nouvelle version
                        </summary>
                        <FormulaireNouvelleVersion
                          orgId={orgId}
                          personId={personId}
                          remplaceId={p.document_id}
                          type={p.type}
                          titre={p.titre}
                        />
                      </details>
                    </li>
                  );
                }
              )}
            </ul>
          )}
          <FormulairePiece orgId={orgId} personId={personId} />
        </CardContent>
      </Card>

      {/* Pièces réclamées au locataire (RM-0b.2.5) : demande, relance, dépôt
          depuis son espace — visible dès qu'elle a un espace pour recevoir,
          jamais sur sa propre fiche (se réclamer une pièce à soi-même, 24/09) */}
      {personne.account_id && !estSaFiche && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pièces réclamées</CardTitle>
            <CardDescription>
              Demandez une pièce : elle s&apos;affiche dans l&apos;espace de la
              personne, qui la dépose en un geste — vous êtes alerté à la
              réception.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CartePiecesDemandees
              orgId={orgId}
              personId={personId}
              demandes={demandesPieces}
              tronquees={demandesTronquees}
            />
          </CardContent>
        </Card>
      )}

      {/* Messages avec la personne (espace locataire v10) : visibles dès
          qu'un échange existe, ou qu'elle a un espace pour les recevoir —
          pas sur sa propre fiche, où l'on se répondrait à soi-même (24/09) */}
      {!estSaFiche && (messages.length > 0 || personne.account_id) && (
        <Card id="messages">
          <CardHeader>
            <CardTitle className="text-base">Messages</CardTitle>
            <CardDescription>
              Le fil avec cette personne — vos réponses arrivent dans son
              espace, ouvrir cette fiche marque ses messages comme lus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CarteMessages
              orgId={orgId}
              personId={personId}
              prenom={personne.prenom}
              messages={messages}
            />
          </CardContent>
        </Card>
      )}

      {/* Mandats de gestion — un propriétaire direct n'en signe pas (S9a).
          24/09 : ni sur la fiche d'un locataire ou d'un garant qui ne détient
          aucun lot et n'a jamais eu de mandat — la carte n'y menait qu'à une
          impasse. Une fiche sans rôle la garde : c'est le chemin d'un
          propriétaire créé sans lot. */}
      {!estProprietaire &&
        ((mandats ?? []).length > 0 || (detentions ?? []).length > 0 || roles.length === 0) && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mandats de gestion</CardTitle>
          <CardDescription>
            Un mandat porte sur des lots détenus par cette personne — chaque lot
            avec son propre taux d&apos;honoraires (défaut 7 %).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(mandats ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mandat de gestion. C&apos;est lui qui autorise l&apos;agence à gérer les lots de cette personne et fixe les honoraires.</p>
          ) : (
            (mandats ?? []).map((m) => {
              const sesLignes = (lignes ?? []).filter((l) => l.mandat_id === m.id);
              // Un mandat résilié est historisé (recette 13/08) : grisé, plus
              // aucune action — le taux et les lots restent lisibles.
              const historise = m.etat === "resilie";
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border border-border p-3 ${historise ? "bg-muted opacity-70" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    {/* flex-wrap : au téléphone, le résumé passe sous la puce
                        au lieu de s'y serrer en colonne étroite (24/09) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={COULEURS_ETAT_MANDAT[m.etat] ?? "puce puce-grise"}>
                        {ETATS_MANDAT[m.etat] ?? m.etat}
                      </span>
                      {historise && (
                        <span className="text-xs text-muted-foreground">
                          Historisé — non modifiable
                        </span>
                      )}
                      {/* En toutes lettres (24/09) : « Rapport le 10 · seuil 500 € »
                          ne disait ni « du mois » ni de quoi était le seuil. */}
                      <span className="text-sm text-muted-foreground">
                        Rapport de gestion le {m.date_rapport} de chaque mois · délégation
                        de travaux jusqu&apos;à{" "}
                        {m.seuil_delegation
                          ? `${Number(m.seuil_delegation).toLocaleString("fr-FR")}\u00A0€`
                          : "500\u00A0€ (défaut agence)"}
                      </span>
                    </div>
                    {!historise && (
                      <span className="flex flex-wrap items-center gap-3">
                        <SelectTitulaireMandat
                          orgId={orgId}
                          personId={personId}
                          mandatId={m.id}
                          titulaire={m.agent_account_id}
                          gerants={gerants}
                        />
                        <BoutonsEtatMandat
                          orgId={orgId}
                          personId={personId}
                          mandatId={m.id}
                          etat={m.etat}
                          nbLignesActives={sesLignes.filter((l) => !l.date_fin).length}
                        />
                        {/* Le mandat de gestion en PDF (loi Hoguet) — champs
                            absents en libellé d'épreuve, comme le bail */}
                        <BoutonGenererDocument
                          orgId={orgId}
                          code="mandat_gestion"
                          cibleId={m.id}
                          cheminRetour={`/agence/${orgId}/personnes/${personId}`}
                          libelle="Mandat PDF"
                        />
                      </span>
                    )}
                  </div>
                  {sesLignes.length > 0 && (
                    <ul className="mb-2 space-y-1 text-sm">
                      {sesLignes.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2">
                          {/* Le lot mène à sa fiche, comme dans « Lots détenus »
                              (24/09) ; « Retirer » reste hors du lien. */}
                          {cheminLot(l.lot_id) ? (
                            <Link
                              href={cheminLot(l.lot_id)!}
                              className="-mx-2 min-w-0 flex-1 rounded-lg px-2 py-1 hover:bg-[var(--survol)]"
                            >
                              {libelleLot(l.lot_id)}
                            </Link>
                          ) : (
                            <span>{libelleLot(l.lot_id)}</span>
                          )}
                          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                            {/* « 7 % », pas « 7.00 % » (24/09) */}
                            {Number(l.taux_honoraires).toLocaleString("fr-FR", {
                              maximumFractionDigits: 2,
                            })}
                            {"\u00A0"}%{l.date_fin ? " (clos)" : ""}
                            {m.etat === "brouillon" && !l.date_fin && (
                              <BoutonRetirerLigne
                                orgId={orgId}
                                personId={personId}
                                mandatId={m.id}
                                ligneId={l.id}
                              />
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Recette 21/08 : les lots et taux se composent en brouillon
                      — signé, le mandat affiche le contenu du contrat, figé. */}
                  {m.etat === "brouillon" ? (
                    <FormulaireLigneMandat
                      orgId={orgId}
                      personId={personId}
                      mandatId={m.id}
                      lots={lotsProposables}
                      nbLotsDetenus={lotsOptions.length}
                    />
                  ) : (
                    !historise && (
                      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                        Lots et taux figés — ils sont ceux du contrat signé.
                      </p>
                    )
                  )}
                </div>
              );
            })
          )}
          {/* 24/09 : « Nouveau mandat » seulement s'il reste un lot à couvrir —
              sinon « Créer le mandat » menait à un brouillon vide et à l'impasse
              « Cette personne ne détient aucun lot ». */}
          {lotsProposables.length > 0 || lotsIllisibles ? (
            <FormulaireMandat orgId={orgId} personId={personId} />
          ) : (detentions ?? []).length === 0 ? (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              Cette personne ne détient aucun lot — rattachez-la d&apos;abord à un
              lot du parc pour lui proposer un mandat.{" "}
              <Link href={`/agence/${orgId}/parc`} className="lien-discret">
                Aller au parc
              </Link>
            </p>
          ) : (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              Tous les lots détenus sont déjà sous mandat.
            </p>
          )}
        </CardContent>
      </Card>
      )}
    </main>
  );
}
