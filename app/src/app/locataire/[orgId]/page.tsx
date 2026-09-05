import Link from "next/link";
import { estExpiree, eur } from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { CarteGestionnaire, CarteUrgence } from "./cartes-laterales";
import type { IncidentLocataire } from "./incidents-locataire";
import type { BailLocataire } from "./types";

export const metadata = { title: "Mon espace — Gerimmo" };

// Accueil de l'espace locataire (maquette v10) : l'essentiel du logement en
// un regard — le logement, le prochain loyer, les documents, les demandes —
// et à droite, qui s'occupe de moi.
export default async function PageAccueilLocataire(props: PageProps<"/locataire/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: baux },
    { data: echeancier },
    { data: pieces },
    { data: incidentsBruts },
    { data: gestionnaires },
    { data: annonces },
  ] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mes_pieces_locataire", { p_org: orgId }),
    supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
    supabase.rpc("mes_annonces_locataire", { p_org: orgId }),
  ]);
  const bail = ((baux ?? []) as BailLocataire[])[0];
  const lignes = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
  }[];
  const prochaine = lignes.find((l) => l.statut !== "paye");
  const attestations = ((pieces ?? []) as {
    type: string;
    depose_le: string;
    expire_le: string | null;
  }[]).filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le));
  const assuranceOk = Boolean(attestations[0] && !estExpiree(attestations[0].expire_le));
  const nbDocuments = (pieces ?? []).length;
  const incidentsEnCours = ((incidentsBruts ?? []) as IncidentLocataire[]).filter(
    (i) => i.etat !== "clos"
  );
  const gestionnaire = ((gestionnaires ?? []) as {
    agence: string;
    telephone: string | null;
    email_contact: string | null;
    agent_email: string | null;
  }[])[0];

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

  return (
    <div className="space-y-4">
      <div>
        <p className="mono-discret normal-case">{aujourdhui}</p>
        <h1 className="mt-0.5">
          Bonjour{personne?.prenom ? ` ${personne.prenom}` : ""},
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;essentiel pour votre logement.
        </p>
      </div>

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

      {/* Annonces de l'agence pour l'immeuble (backend v10) */}
      {((annonces ?? []) as { id: string; texte: string }[]).map((a) => (
        <div
          key={a.id}
          className="loc-carte border border-[var(--or-filet)] !bg-[var(--or-clair)]/40 !shadow-none"
          style={{ padding: "13px 18px" }}
        >
          <p className="text-[13px]">
            <b className="font-semibold">Dans votre immeuble</b> — {a.texte}
          </p>
        </div>
      ))}

      <div className="loc-grille">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="loc-carte loc-kpi">
              <p className="text-[13px] font-semibold text-[var(--encre)]">Prochain loyer</p>
              {bail && prochaine ? (
                <>
                  <p className="v">{eur(Number(bail.loyer_hc ?? 0) + Number(bail.charges ?? 0))}</p>
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
              <Link href={`/locataire/${orgId}/loyers`} className="lien-discret mt-3 block text-[13px]">
                Voir mes paiements →
              </Link>
            </div>
            <div className="loc-carte loc-kpi">
              <p className="text-[13px] font-semibold text-[var(--encre)]">Mes documents</p>
              <p className="v">{nbDocuments}</p>
              <p className="text-xs text-muted-foreground">
                pièce{nbDocuments > 1 ? "s" : ""} à votre disposition
              </p>
              <span className={`loc-tag mt-2.5 ${assuranceOk ? "vert" : "ambre"}`}>
                {assuranceOk ? "✓ Assurance à jour" : "Assurance à déposer"}
              </span>
              <Link href={`/locataire/${orgId}/documents`} className="lien-discret mt-3 block text-[13px]">
                Voir mes documents →
              </Link>
            </div>
            <div className="loc-carte loc-kpi">
              <p className="text-[13px] font-semibold text-[var(--encre)]">Mon logement</p>
              {incidentsEnCours.length === 0 ? (
                <>
                  <p className="v" style={{ fontSize: 20 }}>Tout est en ordre</p>
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
              <Link href={`/locataire/${orgId}/demandes`} className="lien-discret mt-3 block text-[13px]">
                {incidentsEnCours.length === 0 ? "Signaler un problème →" : "Suivre mes demandes →"}
              </Link>
            </div>
          </div>

          {enRetard && (
            <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
              <p className="text-sm">
                <b className="font-semibold">Votre loyer de {moisLong(prochaine!.periode)} attend un règlement.</b>{" "}
                {prochaine!.statut === "partiel"
                  ? `Il reste ${eur(Number(prochaine!.montant_du) - Number(prochaine!.montant_couvert))} à régler par virement.`
                  : `Réglez ${eur(Number(prochaine!.montant_du))} par virement à votre gestionnaire.`}{" "}
                Une difficulté ? Écrivez-lui : une solution se trouve toujours plus
                tôt que tard.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <CarteGestionnaire orgId={orgId} gestionnaire={gestionnaire} />
          <CarteUrgence />
        </div>
      </div>
    </div>
  );
}
