import Link from "next/link";
import type { ReactNode } from "react";
import { LecteurDocument } from "@/components/lecteur-document";
import { lirePresentationSignatures } from "@/lib/lecture-presentation-signatures";
import { etatSignatureDocument } from "@/lib/presentation-signatures";
import { presentationDocument } from "@/lib/presentation-document";
import { createClient } from "@/lib/supabase/server";
import {
  TYPES_DOCUMENT,
  dureeConservation,
  formaterDate,
  visibiliteDocument,
} from "@/lib/ged";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import { formaterTaille } from "@/lib/file-type";
import { nomComplet } from "@/lib/roles-personnes";
import { CircuitDocument, type DemandeDuDocument } from "./circuit-document";
import { EchecLecture, PanneauEchecLecture } from "./echec-lecture";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { libelleLot } from "@/lib/parc";
import { Card, CardContent } from "@/components/ui/card";
import { ActionsDocument } from "./actions-document";
import { FormulaireRemplacer } from "./formulaire-remplacer";
import { FormulaireRattacher, type FichesRattachables } from "./formulaire-rattacher";
import { ActionsFicheDocument } from "./actions-fiche-document";
import { titreAffiche } from "./titre-document";
import { presentationRapport, syntheseRapport, type UsageRapport } from "@/lib/rapports-diagnostic";
import { baseEspace } from "@/lib/racine-espace";
import { verifierAccesEspace } from "@/lib/espace";
import styles from "./documents-proprietaire.module.css";

// Les diagnostics qui citent la pièce, archivés compris. Littéral local : le contrôle des embeds ambigus
// (tests/embeds-ambigus.test.ts) ne lit que les constantes du fichier.
const CHAMPS_USAGE_RAPPORT =
  "document_id, type, date_realisation, date_expiration, archived_at, lot_id, bien_id, lot:lots!diagnostics_lot_id_fkey(nom, bien_id, bien:biens!lots_bien_id_fkey(nom)), bien:biens!diagnostics_bien_id_fkey(nom)";

function DetailsDocument({ proprietaire, titre, ouvert = false, children }: { proprietaire: boolean; titre: string; ouvert?: boolean; children: ReactNode }) {
  return proprietaire
    ? <details className={styles.details} open={ouvert}><summary>{titre}</summary>{children}</details>
    : <>{children}</>;
}

// Les baux proposés au rattachement sont bornés — le sélecteur le DIT quand
// il atteint le plafond, au lieu de laisser croire que l'agence n'en a pas
// davantage.
const PLAFOND_BAUX = 100;

type Lien = { entite: string; entite_id: string };

// La puce de conservation, nommée (24/09) : « 5 ans » nu, à côté de « Bail
// signé », se lisait comme la durée du bail. Courte aussi : « Conservation :
// 5 ans » mangeait la colonne de la liste et tronquait les titres. Partagée
// par les rangs de la liste et l'en-tête de la fiche.
export function puceConservation(mois: number | null | undefined): string {
  if (mois === 0) return "Purge immédiate";
  if (mois === null || mois === undefined) return "Conservation —";
  return `Conservé ${dureeConservation(mois)}`;
}

type Doc = {
  id: string;
  type: string;
  titre: string | null;
  mime_type: string | null;
  taille_octets: number | null;
  created_at: string;
  expire_le: string | null;
  verifie_le: string | null;
  purged_at: string | null;
  remplace_id: string | null;
  partage_le: string | null;
  liens: Lien[];
};

// La fiche d'une pièce, affichée dans la vue scindée (maquette pageDocument) :
// aperçu, rattachements, cycle de vie, remplacement avec historique.
// Composant serveur : il fait ses propres requêtes, comme le dossier incident.
export async function PaneDocument({
  orgId,
  documentId,
  lienFermer,
}: {
  orgId: string;
  documentId: string;
  lienFermer: string;
}) {
  const supabase = await createClient();
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const { estProprietaire } = await verifierAccesEspace(orgId);
  const base = baseEspace(orgId, estProprietaire);

  const { data: docBrut, error: erreurDoc } = await supabase
    .from("documents")
    .select(
      "id, type, titre, mime_type, taille_octets, created_at, expire_le, verifie_le, purged_at, remplace_id, partage_le, liens:document_liens(entite, entite_id)"
    )
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const doc = docBrut as Doc | null;

  // Lecture refusée ≠ pièce absente : « introuvable » enverrait l'agent
  // chercher ailleurs une pièce qui est bien là (relevé du 11/09).
  if (erreurDoc) {
    return (
      <PanneauEchecLecture
        quoi={["ce document"]}
        lienFermer={lienFermer}
        libelleFermer="Revenir à la vue d'ensemble"
      />
    );
  }
  if (!doc) {
    return (
      <div className="vide-guide">
        <p className="titre">Document introuvable</p>
        <p className="explication">
          Il a peut-être été remplacé par une version plus récente, ou purgé
          en application de sa règle de conservation.
        </p>
        <span className="geste">
          <Link href={lienFermer} className="lien-discret">
            Revenir à la vue d&apos;ensemble
          </Link>
        </span>
      </div>
    );
  }

  // La version qui remplace celle-ci (si la pièce n'est plus courante), la
  // chaîne des versions antérieures, la règle de conservation, et les fiches
  // rattachables pour le formulaire — en parallèle.
  const [
    { data: remplaceePar, error: erreurRemplacee },
    { data: regle, error: erreurRegle },
    { data: personnes, error: erreurPersonnes },
    { data: lots, error: erreurLots },
    { data: bauxBruts, error: erreurBaux },
    { data: demandesBrutes, error: erreurDemandes },
    { data: usagesBruts, error: erreurUsages },
  ] = await Promise.all([
      supabase
        .from("documents")
        .select("id, titre, created_at")
        .eq("organization_id", orgId)
        .eq("remplace_id", doc.id)
        .maybeSingle(),
      supabase
        .from("retention_rules")
        .select("duree_mois, declencheur")
        .eq("data_type", `document:${doc.type}`)
        .maybeSingle(),
      supabase
        .from("persons")
        .select("id, nom, prenom")
        .eq("organization_id", orgId)
        .is("archived_at", null)
        .order("nom"),
      supabase
        .from("lots")
        .select("id, nom, etat, bien:biens!lots_bien_id_fkey(nom)")
        .eq("organization_id", orgId)
        .order("nom"),
      supabase
        .from("baux")
        .select("id, etat, date_debut, locataire_principal, lot:lots(nom, bien:biens!lots_bien_id_fkey(nom))")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(PLAFOND_BAUX),
      supabase.rpc("demandes_signature_document", { p_org: orgId, p_doc: doc.id }),
      // DOC-03, DOC-04, DOC-N1 : le diagnostic qui cite la pièce porte son échéance et son bien ou son lot.
      supabase.from("diagnostics").select(CHAMPS_USAGE_RAPPORT).eq("organization_id", orgId).eq("document_id", doc.id),
    ]);

  // Versions antérieures : remonter la chaîne remplace_id (bornée — une pièce
  // se remplace rarement plus de quelques fois)
  const anterieures: { id: string; titre: string | null; created_at: string; purged_at: string | null }[] = [];
  let erreurAnterieures = false;
  let curseur = doc.remplace_id;
  for (let i = 0; curseur && i < 5; i++) {
    const { data: version, error: erreurVersion } = await supabase
      .from("documents")
      .select("id, titre, created_at, purged_at, remplace_id")
      .eq("id", curseur)
      .eq("organization_id", orgId)
      .maybeSingle();
    // Une chaîne de versions interrompue par un refus se lit comme une pièce
    // jamais remplacée : on s'arrête, mais on le dit.
    if (erreurVersion) {
      erreurAnterieures = true;
      break;
    }
    if (!version) break;
    anterieures.push(version);
    curseur = version.remplace_id;
  }

  const nomsPersonnes = new Map((personnes ?? []).map((p) => [p.id, nomComplet(p)]));
  // « Lot unique » se répète d'un bien à l'autre : le lot se nomme avec son
  // bien, ici comme dans « Déjà lié à » et les baux (audit #264, DOC-06).
  const lotsLus = (lots ?? []) as { id: string; nom: string; etat: string; bien: UnOuPlusieurs<{ nom: string }> }[];
  const nomsLots = new Map(lotsLus.map((l) => [l.id, libelleLot(l.nom, premier(l.bien)?.nom)]));
  const demandes: DemandeDuDocument[] = (
    (demandesBrutes ?? []) as {
      id: string;
      person_id: string;
      demandee_le: string;
      signee_le: string | null;
      document_retour_id: string | null;
      prestataire?: string | null;
      external_status?: string | null;
      preuve_document_id?: string | null;
    }[]
  ).map((d) => ({
    id: d.id,
    personNom: nomsPersonnes.get(d.person_id) ?? "Personne",
    demandee_le: d.demandee_le,
    signee_le: d.signee_le,
    document_retour_id: d.document_retour_id,
    prestataire: d.prestataire,
    external_status: d.external_status,
    preuve_document_id: d.preuve_document_id,
  }));
  const baux = (bauxBruts ?? []) as {
    id: string;
    etat: string;
    date_debut: string | null;
    locataire_principal: string | null;
    lot: UnOuPlusieurs<{ nom: string; bien: UnOuPlusieurs<{ nom: string }> }>;
  }[];
  const libelleBail = (b: (typeof baux)[number]) => {
    const lot = premier(b.lot);
    const morceaux = [lot ? `Bail ${libelleLot(lot.nom, premier(lot.bien)?.nom)}` : "Bail"];
    if (b.locataire_principal && nomsPersonnes.has(b.locataire_principal)) {
      morceaux.push(nomsPersonnes.get(b.locataire_principal)!);
    } else if (b.date_debut) {
      morceaux.push(formaterDate(b.date_debut));
    }
    return morceaux.join(" · ");
  };
  const nomsBaux = new Map(baux.map((b) => [b.id, libelleBail(b)]));

  // Les numéros des incidents rattachés, seulement s'il y en a
  const idsIncidents = doc.liens.filter((l) => l.entite === "incident").map((l) => l.entite_id);
  const nomsIncidents = new Map<string, string>();
  let erreurIncidents = false;
  if (idsIncidents.length > 0) {
    const { data: incidents, error: erreurNumeros } = await supabase
      .from("incidents")
      .select("id, numero")
      .in("id", idsIncidents);
    erreurIncidents = Boolean(erreurNumeros);
    for (const i of incidents ?? []) nomsIncidents.set(i.id, `Incident ${i.numero}`);
  }

  // Chaque lecture d'appoint manquante retire quelque chose de la fiche sans
  // le dire : un rattachement sans nom, une durée de conservation à « — », un
  // circuit de signature vide. L'encart le nomme.
  const lecturesManquees = [
    erreurRemplacee && "la version qui remplace celle-ci",
    erreurAnterieures && "les versions antérieures",
    erreurRegle && "la règle de conservation",
    erreurPersonnes && "les personnes de l'agence",
    erreurLots && "les lots de l'agence",
    erreurBaux && "les baux de l'agence",
    erreurDemandes && "les demandes de signature",
    erreurIncidents && "les incidents rattachés",
    erreurUsages && "le diagnostic qui utilise ce rapport",
  ].filter((q): q is string => Boolean(q));
  const rapport = syntheseRapport((usagesBruts ?? []) as unknown as UsageRapport[]);
  // DOC-03 : un rapport en service se renouvelle sur sa fiche (nouvelles dates, ancien diagnostic archivé). Une
  // « nouvelle version » ici changeait le fichier sans que le lot ni le bail le voient.
  const ficheRapport = rapport && !rapport.remplace ? rapport.rattachements[0] : undefined;
  const renouvelerSurFiche = ficheRapport
    ? { href: `${base}${ficheRapport.chemin}`, libelle: ficheRapport.niveau === "lot" ? "Renouveler sur la fiche du lot" : "Renouveler sur la fiche du bien" }
    : undefined;

  const libelleLien = (l: Lien): string => {
    switch (l.entite) {
      case "organisation":
        return "Organisation";
      case "personne":
        return nomsPersonnes.get(l.entite_id) ?? "Personne";
      case "lot":
        return `Lot ${nomsLots.get(l.entite_id) ?? ""}`.trim();
      case "bail":
        return nomsBaux.get(l.entite_id) ?? "Bail";
      case "incident":
        return nomsIncidents.get(l.entite_id) ?? "Incident";
      case "mandat":
        return "Mandat";
      default:
        return l.entite;
    }
  };

  const fiches: FichesRattachables = {
    personnes: (personnes ?? []).map((p) => ({ id: p.id, libelle: nomComplet(p) })),
    // Un lot archivé ne reçoit plus de pièce ; tri par bien, puis par lot.
    lots: lotsLus
      .filter((l) => l.etat !== "archive")
      .map((l) => ({ id: l.id, libelle: nomsLots.get(l.id)! }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { numeric: true })),
    baux: baux.map((b) => ({ id: b.id, libelle: libelleBail(b) })),
  };
  const bauxTronques = baux.length >= PLAFOND_BAUX;

  if (doc.purged_at) {
    return (
      <div className="space-y-3.5">
        <EchecLecture quoi={lecturesManquees} />
        <div className="entete-page">
          <div>
            <span className="eyebrow">
              {(TYPES_DOCUMENT[doc.type] ?? doc.type).toUpperCase()} · DÉPOSÉ LE{" "}
              {formaterDate(doc.created_at)}
            </span>
            <h2 className="mt-0.5 text-lg font-medium">{titreAffiche(doc.titre) ?? "Document purgé"}</h2>
          </div>
        </div>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Document purgé le {formaterDate(doc.purged_at)} en application de sa
              règle de conservation (RGPD). Seule cette fiche de traçabilité
              subsiste.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fichier = `${base}/documents/${doc.id}/fichier`;
  const suiviSignature = await lirePresentationSignatures(orgId, { documents: [doc.id] });
  if (suiviSignature.erreur) lecturesManquees.push("le suivi des signatures");
  const presentation = presentationRapport(doc, rapport, d => presentationDocument(d, etatSignatureDocument(suiviSignature.circuits, doc.id), Boolean(remplaceePar)));
  const echeance = rapport?.expireLe ?? doc.expire_le;

  return (
    <div className={estProprietaire ? styles.dossier : "space-y-3.5"}>
      <EchecLecture quoi={lecturesManquees} />
      {remplaceePar && (
        <div className="rounded-lg border border-warning-soft bg-warning-soft/40 p-3 text-sm">
          Cette version a été remplacée le {formaterDate(remplaceePar.created_at)}.{" "}
          <Link
            href={`${lienFermer}${lienFermer.includes("?") ? "&" : "?"}sel=${remplaceePar.id}`}
            className="lien-discret inline-flex items-center gap-1.5"
          >
            Ouvrir la version courante
            <IndicateurLien />
          </Link>
        </div>
      )}

      <div className={estProprietaire ? styles.enteteDocument : "entete-page"}>
        <div>
          {!estProprietaire && <span className="eyebrow">
            {(TYPES_DOCUMENT[doc.type] ?? doc.type).toUpperCase()} · DÉPOSÉ LE{" "}
            {formaterDate(doc.created_at)}
          </span>}
          <h2 className="font-heading mt-0.5 text-xl font-semibold text-[var(--encre)]">
            {titreAffiche(doc.titre) ?? "Sans titre"}
          </h2>
          {estProprietaire && <p className={styles.metaFiche}>
            {TYPES_DOCUMENT[doc.type] ?? doc.type}
            {doc.taille_octets != null && ` · ${formaterTaille(doc.taille_octets)}`}
            {` · Déposé le ${formaterDate(doc.created_at)}`}
          </p>}
        </div>
        <span
          className={`puce ${presentation.classe}`}
          title={presentation.detail}
        >
          {presentation.libelle}
        </span>
      </div>

      {!estProprietaire && <p className="text-sm text-muted-foreground">{presentation.detail}</p>}

      {rapport && rapport.rattachements.length > 0 && <p className="text-sm">
        Rapport de diagnostic de{" "}
        {rapport.rattachements.map((r, i) => <span key={r.chemin}>
          {i > 0 && ", "}
          <Link href={`${base}${r.chemin}`} className="lien-discret">{r.libelle}</Link>
        </span>)}
      </p>}

      {estProprietaire && <ActionsFicheDocument key={`actions-${doc.id}`}
        orgId={orgId} documentId={doc.id} type={doc.type} expireLe={doc.expire_le}
        remplace={Boolean(remplaceePar)} renouvelerSurFiche={renouvelerSurFiche} fiches={fiches} bauxTronques={bauxTronques}
        liens={doc.liens.filter(l => l.entite !== "organisation").map(l => ({ cle: `${l.entite}-${l.entite_id}`, libelle: libelleLien(l) }))}
        partageLe={doc.partage_le}
        signataires={doc.liens.filter(l => l.entite === "personne").map(l => ({ id: l.entite_id, nom: nomsPersonnes.get(l.entite_id) ?? "Personne" }))}
        demandes={demandes} lienFermer={lienFermer}
      />}

      {/* Aperçu — servi par la route /fichier : droits revérifiés, accès tracé */}
      {estProprietaire ? <LecteurDocument key={`lecteur-${doc.id}`} fichier={fichier} titre={titreAffiche(doc.titre) ?? "Document"} mime={doc.mime_type} presentation="fiche" /> : doc.mime_type?.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${fichier}?apercu=image`}
          alt={`Aperçu — ${titreAffiche(doc.titre) ?? "document"}`}
          className="max-h-96 w-full border border-border bg-[var(--ardoise)] object-contain"
        />
      ) : (
        <>
          {/* iOS Safari ne fait pas défiler un PDF dans une iframe : sur petit
              écran, un lien remplace les 384px d'aperçu mort */}
          <a
            href={fichier}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 border border-border bg-[var(--ardoise)] p-4 text-sm text-[var(--bleu)] md:hidden"
          >
            Consulter le PDF (nouvel onglet)
            <IndicateurLien />
          </a>
          <iframe
            src={fichier}
            title={`Aperçu — ${titreAffiche(doc.titre) ?? "document"}`}
            className="hidden h-96 w-full border border-border bg-[var(--ardoise)] md:block"
          />
        </>
      )}

      {/* CardContent sans pt-5 : la Card pose déjà sa marge (24/09) */}
      <div className={estProprietaire ? styles.informations : "deux-col"}>
        {!estProprietaire && <DetailsDocument proprietaire={estProprietaire} titre="Rattachements et signatures" ouvert={demandes.some(d => !d.signee_le)}>
        <Card>
          <CardContent>
            {!estProprietaire && <h3 className="text-base font-medium">Rattachements</h3>}
            {!estProprietaire && <p className="mt-1.5 mb-3 text-sm text-muted-foreground">
              Ce document apparaît sur chacune de ces fiches. Il n&apos;est
              stocké qu&apos;une fois.
            </p>}
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {doc.liens.map((l) => (
                <span key={`${l.entite}-${l.entite_id}`} className="puce puce-encre">
                  {libelleLien(l)}
                </span>
              ))}
            </div>
            <FormulaireRattacher
              orgId={orgId}
              documentId={doc.id}
              fiches={fiches}
              bauxTronques={bauxTronques}
            />
            {/* Le circuit du document : mise à disposition, envoi pour
                signature, suivi des demandes. key : la sélection du signataire
                repart de zéro quand on change de document (audit 09/09 —
                l'état client survivait au ?sel= et visait l'ancien document) */}
            <CircuitDocument
              key={doc.id}
              orgId={orgId}
              documentId={doc.id}
              type={doc.type}
              partageLe={doc.partage_le}
              signataires={doc.liens
                .filter((l) => l.entite === "personne")
                .map((l) => ({
                  id: l.entite_id,
                  nom: nomsPersonnes.get(l.entite_id) ?? "Personne",
                }))}
              demandes={demandes}
              lienFermer={lienFermer}
            />
          </CardContent>
        </Card>
        </DetailsDocument>}

        <DetailsDocument proprietaire={estProprietaire} titre="Informations du document">
        <Card>
          <CardContent>
            {!estProprietaire && <h3 className="mb-2 text-base font-medium">Cycle de vie</h3>}
            {!estProprietaire && <div className="ligne-info">
              <span>Type</span>
              <span>{TYPES_DOCUMENT[doc.type] ?? doc.type}</span>
            </div>}
            {estProprietaire && <div className="ligne-info">
              <span>État</span>
              <span>{presentation.detail}</span>
            </div>}
            <div className="ligne-info">
              <span>Conservation</span>
              <span>
                {regle
                  ? `${dureeConservation(regle.duree_mois)} — ${regle.declencheur.toLowerCase()}`
                  : "—"}
              </span>
            </div>
            <div className="ligne-info">
              <span>Visible par</span>
              <span>{visibiliteDocument(doc.type)}</span>
            </div>
            {!estProprietaire && doc.taille_octets != null && (
              <div className="ligne-info">
                <span>Taille</span>
                <span>{formaterTaille(doc.taille_octets)}</span>
              </div>
            )}
            {echeance && (
              <div className="ligne-info">
                <span>Expire le</span>
                <span>{formaterDate(echeance)}</span>
              </div>
            )}
            {doc.verifie_le && (
              <div className="ligne-info">
                <span>Validé le</span>
                <span>{formaterDate(doc.verifie_le)}</span>
              </div>
            )}
            {!estProprietaire && <div className="mt-4 flex flex-wrap items-start gap-2">
              {!estProprietaire && <ActionsDocument orgId={orgId} documentId={doc.id} titre={titreAffiche(doc.titre)} />}
              {!remplaceePar && !renouvelerSurFiche && (
                <FormulaireRemplacer
                  orgId={orgId}
                  documentId={doc.id}
                  expireLe={doc.expire_le}
                />
              )}
              {renouvelerSurFiche && (
                <Link href={renouvelerSurFiche.href} className="lien-discret inline-flex min-h-9 items-center gap-1.5">
                  {renouvelerSurFiche.libelle}
                  <IndicateurLien />
                </Link>
              )}
            </div>}
          </CardContent>
        </Card>
        </DetailsDocument>
      </div>

      {anterieures.length > 0 && (
        <DetailsDocument proprietaire={estProprietaire} titre="Versions antérieures">
        <Card>
          <CardContent>
            {!estProprietaire && <h3 className="mb-2 text-base font-medium">Versions antérieures</h3>}
            <ul className="divide-y divide-border text-sm">
              {anterieures.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {titreAffiche(v.titre) ?? "Sans titre"}
                    <small className="ml-2 text-muted-foreground">
                      déposé le {formaterDate(v.created_at)}
                      {v.purged_at ? " · purgé" : ""}
                    </small>
                  </span>
                  {!v.purged_at && (
                    <Link
                      href={`${lienFermer}${lienFermer.includes("?") ? "&" : "?"}sel=${v.id}`}
                      aria-label={`Ouvrir la version « ${titreAffiche(v.titre) ?? "sans titre"} » du ${formaterDate(v.created_at)}`}
                      className="lien-discret -my-2 inline-flex shrink-0 items-center gap-1.5 py-2"
                    >
                      Ouvrir
                      <IndicateurLien />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        </DetailsDocument>
      )}
    </div>
  );
}
