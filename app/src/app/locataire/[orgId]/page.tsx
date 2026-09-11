import Link from "next/link";
import { estExpiree, eur } from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { CarteGestionnaire, CarteUrgence } from "./cartes-laterales";
import { aEchoue, LectureImpossible, PanneLecture } from "./panne-lecture";
import type { IncidentLocataire } from "./incidents-locataire";
import type { BailLocataire } from "./types";

export const metadata = { title: "Mon espace — Gerimmo" };

// Accueil de l'espace locataire (maquette v10) : l'essentiel du logement en
// un regard — ce qui l'attend, le logement, le prochain loyer, les documents,
// les demandes — et à droite, qui s'occupe de moi.
export default async function PageAccueilLocataire(props: PageProps<"/locataire/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: baux, error: eBaux },
    { data: echeancier, error: eEcheancier },
    { data: pieces, error: ePieces },
    { data: incidentsBruts, error: eIncidents },
    { data: gestionnaires, error: eGestionnaire },
    { data: annonces, error: eAnnonces },
    { data: piecesDemandees, error: eDemandes },
    { data: signatures, error: eSignatures },
  ] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mes_pieces_locataire", { p_org: orgId }),
    supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
    supabase.rpc("mes_annonces_locataire", { p_org: orgId }),
    // Les deux lectures que le menu faisait déjà de son côté : elles
    // alimentent « Ce qui vous attend » (occasion relevée le 11/09) et
    // remettent l'accueil d'accord avec le badge « Mes documents ».
    supabase.rpc("mes_pieces_demandees", { p_org: orgId }),
    supabase.rpc("mes_demandes_signature", { p_org: orgId }),
  ]);
  const bail = ((baux ?? []) as BailLocataire[])[0];
  const lignes = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
    quittance_id: string | null;
  }[];
  const prochaine = lignes.find((l) => l.statut !== "paye");
  const attestations = ((pieces ?? []) as {
    type: string;
    depose_le: string;
    expire_le: string | null;
    verifie_le: string | null;
  }[]).filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le));
  const derniere = attestations[0];
  const attestationValide = Boolean(derniere && !estExpiree(derniere.expire_le));
  // Même vocabulaire que la page Documents : déposée mais pas encore validée
  // par le gestionnaire = « en cours de vérification », pas « à jour »
  const assuranceEnVerification = attestationValide && !derniere?.verifie_le;
  // Même règle que le badge du menu (audit 06/09) : sans bail actif, aucune
  // assurance n'est réclamée — sinon l'accueil s'alarmait quand le menu, lui,
  // ne comptait rien.
  const assuranceAJour = !bail || attestationValide;
  const quittancesDispo = lignes.filter((l) => l.quittance_id).length;
  const nbDocuments = (pieces ?? []).length + quittancesDispo;
  const incidentsEnCours = ((incidentsBruts ?? []) as IncidentLocataire[]).filter(
    (i) => i.etat !== "clos"
  );
  const gestionnaire = ((gestionnaires ?? []) as {
    agence: string;
    telephone: string | null;
    email_contact: string | null;
    agent_email: string | null;
  }[])[0];
  const nbPiecesDemandees = ((piecesDemandees ?? []) as unknown[]).length;
  const nbSignatures = ((signatures ?? []) as unknown[]).length;

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const aujourdhui = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  const enRetard = prochaine && (prochaine.statut === "impaye" || prochaine.statut === "partiel");
  const resteADevoir = prochaine
    ? Number(prochaine.montant_du) - Number(prochaine.montant_couvert)
    : 0;

  // « Ce qui vous attend » : tout ce que le menu comptait déjà en badges, dit
  // en clair et avec le geste à côté. Le loyer en retard y prend sa place —
  // il avait sa propre carte plus bas, qui répétait la même chose.
  const aFaire: { cle: string; titre: string; detail: string; href: string; action: string }[] = [];
  if (bail && enRetard && prochaine) {
    aFaire.push({
      cle: "loyer",
      titre: `Loyer de ${moisLong(prochaine.periode)} à régler`,
      detail:
        prochaine.statut === "partiel"
          ? `Il reste ${eur(resteADevoir)} à régler par virement à votre gestionnaire.`
          : `${eur(resteADevoir)} à régler par virement à votre gestionnaire.`,
      href: `/locataire/${orgId}/loyers`,
      action: "Mes paiements",
    });
  }
  if (bail && !assuranceAJour) {
    aFaire.push({
      cle: "assurance",
      titre: derniere
        ? "Votre attestation d'assurance a expiré"
        : "Votre attestation d'assurance manque",
      detail:
        "L'assurance habitation est obligatoire pendant toute la durée du bail — une photo lisible suffit.",
      href: `/locataire/${orgId}/documents`,
      action: "Déposer",
    });
  }
  if (nbSignatures > 0) {
    aFaire.push({
      cle: "signature",
      titre:
        nbSignatures > 1
          ? `${nbSignatures} documents à signer`
          : "Un document à signer",
      detail: "À télécharger, signer, puis redéposer — votre gestionnaire est prévenu.",
      href: `/locataire/${orgId}/documents`,
      action: "Ouvrir",
    });
  }
  if (nbPiecesDemandees > 0) {
    aFaire.push({
      cle: "pieces",
      titre:
        nbPiecesDemandees > 1
          ? `${nbPiecesDemandees} pièces vous sont demandées`
          : "Une pièce vous est demandée",
      detail: "Votre gestionnaire les attend pour compléter votre dossier.",
      href: `/locataire/${orgId}/documents`,
      action: "Déposer",
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mono-discret sans-majuscules">{aujourdhui}</p>
        <h1 className="mt-0.5">
          Bonjour{personne?.prenom ? ` ${personne.prenom}` : ""},
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;essentiel pour votre logement.
        </p>
      </div>

      {aEchoue(
        eBaux,
        eEcheancier,
        ePieces,
        eIncidents,
        eGestionnaire,
        eAnnonces,
        eDemandes,
        eSignatures
      ) && <PanneLecture quoi="l'essentiel de votre logement" />}

      {bail && (
        <div className="loc-hero">
          <span className="loc-vignette" aria-hidden>
            {(bail.ville?.[0] ?? bail.lot_nom[0] ?? "G").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-heading text-xl text-[var(--encre)]">{bail.lot_nom}</p>
            <p className="text-[13px] text-muted-foreground">{bail.adresse}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {[
                bail.surface_m2 != null ? `${Number(bail.surface_m2).toLocaleString("fr-FR")} m²` : null,
                bail.pieces != null ? `${bail.pieces} pièce${bail.pieces > 1 ? "s" : ""}` : null,
                bail.etage ? `étage ${bail.etage}` : null,
                bail.meuble ? "meublé" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <Link
              href={`/locataire/${orgId}/logement`}
              className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-2.5`}
            >
              Voir les détails →
            </Link>
          </div>
          <div className="loc-citation">
            Un chez-vous plus serein,
            <br />
            au quotidien.
          </div>
        </div>
      )}

      {aFaire.length > 0 && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <div className="entete-carte !mb-1">
            <h3 className="text-base font-medium">Ce qui vous attend</h3>
            <span className="loc-tag ambre">
              {aFaire.length} point{aFaire.length > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {aFaire.map((t) => (
              <li
                key={t.cle}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <b className="block font-medium">{t.titre}</b>
                  <small className="block text-muted-foreground">{t.detail}</small>
                </span>
                <Link
                  href={t.href}
                  className={`shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                >
                  {t.action}
                </Link>
              </li>
            ))}
          </ul>
          {enRetard && (
            <p className="mt-3 text-xs text-muted-foreground">
              Une difficulté de paiement ? Écrivez à votre gestionnaire : une
              solution se trouve toujours plus tôt que tard.
            </p>
          )}
        </div>
      )}

      {/* Annonces de l'agence pour l'immeuble (backend v10) */}
      {((annonces ?? []) as { id: string; texte: string }[]).map((a) => (
        <div key={a.id} className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="text-sm">
            <b className="font-semibold">Dans votre immeuble</b> — {a.texte}
          </p>
        </div>
      ))}

      <div className="loc-grille">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="loc-carte loc-kpi">
            <p className="text-[13px] font-semibold text-[var(--encre)]">Prochain loyer</p>
            {eEcheancier ? (
              <div className="mt-2">
                <LectureImpossible quoi="votre échéancier" />
              </div>
            ) : bail && prochaine ? (
              <>
                <p className="v montant">{eur(resteADevoir)}</p>
                <p className="text-xs text-muted-foreground capitalize">{moisLong(prochaine.periode)}</p>
                <span className={`loc-tag mt-2.5 ${enRetard ? "rouge" : "vert"}`}>
                  {prochaine.statut === "impaye"
                    ? "En retard — régularisez vite"
                    : prochaine.statut === "partiel"
                      ? "Partiellement réglé"
                      : "✓ À jour"}
                </span>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Rien à régler pour l&apos;instant.
              </p>
            )}
            <Link href={`/locataire/${orgId}/loyers`} className="lien-discret mt-3 block">
              Voir mes paiements →
            </Link>
          </div>
          <div className="loc-carte loc-kpi">
            <p className="text-[13px] font-semibold text-[var(--encre)]">Mes documents</p>
            {ePieces || eEcheancier ? (
              <div className="mt-2">
                <LectureImpossible quoi="vos documents" />
              </div>
            ) : (
              <>
                <p className="v">{nbDocuments}</p>
                <p className="text-xs text-muted-foreground">
                  pièce{nbDocuments > 1 ? "s" : ""} à votre disposition
                </p>
                <span
                  className={`loc-tag mt-2.5 ${
                    !bail ? "bleu" : assuranceEnVerification || !attestationValide ? "ambre" : "vert"
                  }`}
                >
                  {!bail
                    ? "Aucune pièce attendue"
                    : assuranceEnVerification
                      ? "Assurance en cours de vérification"
                      : attestationValide
                        ? "✓ Assurance à jour"
                        : "Assurance à déposer"}
                </span>
              </>
            )}
            <Link href={`/locataire/${orgId}/documents`} className="lien-discret mt-3 block">
              Voir mes documents →
            </Link>
          </div>
          <div className="loc-carte loc-kpi">
            <p className="text-[13px] font-semibold text-[var(--encre)]">Mon logement</p>
            {eIncidents ? (
              <div className="mt-2">
                <LectureImpossible quoi="vos demandes" />
              </div>
            ) : incidentsEnCours.length === 0 ? (
              <>
                <p className="mt-1.5 font-heading text-xl text-[var(--encre)]">
                  Tout est en ordre
                </p>
                <span className="loc-tag vert mt-2.5">✓ Aucun incident en cours</span>
              </>
            ) : (
              <>
                <p className="v">{incidentsEnCours.length}</p>
                <p className="text-xs text-muted-foreground">
                  demande{incidentsEnCours.length > 1 ? "s" : ""} en cours de traitement
                </p>
                <span className="loc-tag ambre mt-2.5">Suivie{incidentsEnCours.length > 1 ? "s" : ""} par votre gestionnaire</span>
              </>
            )}
            <Link
              href={`/locataire/${orgId}/${incidentsEnCours.length === 0 ? "incident" : "demandes"}`}
              className="lien-discret mt-3 block"
            >
              {incidentsEnCours.length === 0 ? "Signaler un problème →" : "Suivre mes demandes →"}
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <CarteGestionnaire orgId={orgId} gestionnaire={gestionnaire} />
          <CarteUrgence />
        </div>
      </div>
    </div>
  );
}
