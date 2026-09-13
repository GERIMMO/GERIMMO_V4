import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { formaterDate } from "@/lib/ged";
import type { BailLocataire } from "./types";
import type { SuiviIntervention } from "./demandes/suivi-intervention";

export function AgendaLocataire({
  orgId,
  bail,
  suivis = [],
  choix = 0,
  complet = false,
}: {
  orgId: string;
  bail?: BailLocataire;
  suivis?: SuiviIntervention[];
  choix?: number;
  complet?: boolean;
}) {
  const rendezVous = suivis
    .filter(
      (s) => s.rdv_debut && (s.etape === "planifiee" || s.etape === "en_cours"),
    )
    .sort((a, b) => a.rdv_debut!.localeCompare(b.rdv_debut!));
  return (
    <section className="loc-carte loc-agenda" aria-label="Agenda et échéances">
      <div className="entete-carte">
        <h3>À l&apos;horizon</h3>
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
      </div>
      {(complet ? rendezVous : rendezVous.slice(0, 3)).map((s) => {
        const date = new Date(s.rdv_debut!);
        return (
          <div className="loc-agenda-ligne" key={s.incident_id}>
            <span className="loc-agenda-jour" aria-hidden>
              {date.toLocaleDateString("fr-FR", {
                day: "2-digit",
                timeZone: "Europe/Paris",
              })}
              <small>
                {date.toLocaleDateString("fr-FR", {
                  month: "short",
                  timeZone: "Europe/Paris",
                })}
              </small>
            </span>
            <div className="min-w-0">
              <p>
                {s.etape === "en_cours"
                  ? "Intervention en cours"
                  : "Intervention"}{" "}
                {s.artisan ? `· ${s.artisan}` : ""}
              </p>
              <small>
                {date.toLocaleString("fr-FR", {
                  dateStyle: "long",
                  timeStyle: "short",
                  timeZone: "Europe/Paris",
                })}
              </small>
              <Link
                className="lien-discret mt-1 block"
                href={`/locataire/${orgId}/demandes`}
              >
                Voir le rendez-vous →
              </Link>
            </div>
          </div>
        );
      })}
      {bail?.date_fin && (
        <div className="loc-agenda-ligne">
          <span className="loc-agenda-jour" aria-hidden>
            {new Date(bail.date_fin).toLocaleDateString("fr-FR", {
              day: "2-digit",
              timeZone: "UTC",
            })}
            <small>
              {new Date(bail.date_fin).toLocaleDateString("fr-FR", {
                month: "short",
                timeZone: "UTC",
              })}
            </small>
          </span>
          <div>
            <p>Fin de bail · {formaterDate(bail.date_fin)}</p>
            <Link
              className="lien-discret mt-1 block"
              href={`/locataire/${orgId}/logement`}
            >
              Les étapes de mon départ →
            </Link>
          </div>
        </div>
      )}
      {choix > 0 && (
        <p className="my-3 text-sm">
          {choix} rendez-vous {choix > 1 ? "attendent" : "attend"} votre choix.{" "}
          <Link className="lien-discret" href={`/locataire/${orgId}/demandes`}>
            Choisir un créneau →
          </Link>
        </p>
      )}
      {!rendezVous.length && !bail?.date_fin && !choix && (
        <p className="text-sm text-muted-foreground">
          Aucun rendez-vous programmé pour l&apos;instant.
        </p>
      )}
      {!complet && (
        <Link
          className="lien-discret mt-3 block"
          href={`/locataire/${orgId}/agenda`}
        >
          Mon agenda & mes alertes →
        </Link>
      )}
    </section>
  );
}
