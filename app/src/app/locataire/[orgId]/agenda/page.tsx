import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { formaterDate } from "@/lib/ged";
import { AgendaLocataire } from "../agenda-locataire";
import { aEchoue, PanneLecture } from "../panne-lecture";
import type { BailLocataire } from "../types";
import type { SuiviIntervention } from "../demandes/suivi-intervention";

export const metadata = { title: "Mon agenda — Gerimmo" };

export default async function PageAgenda(
  props: PageProps<"/locataire/[orgId]/agenda">,
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive } =
    await verifierAccesEspaceLocataire(orgId);
  const [baux, suivis, creneaux] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_suivi_intervention", { p_org: orgId }),
    adhesionActive
      ? supabase.rpc("mes_creneaux_locataire", { p_org: orgId })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const bail = ((baux.data ?? []) as BailLocataire[])[0];
  const choix = new Set(
    ((creneaux.data ?? []) as { intervention_id: string }[]).map(
      (c) => c.intervention_id,
    ),
  ).size;
  return (
    <div className="space-y-6">
      <div>
        <h1>Mon agenda & mes alertes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vos échéances, sans perdre le fil.
        </p>
      </div>
      {aEchoue(baux.error, suivis.error, creneaux.error) && (
        <PanneLecture quoi="vos rendez-vous" />
      )}
      {!aEchoue(baux.error, suivis.error, creneaux.error) && (
        <AgendaLocataire
          orgId={orgId}
          bail={bail}
          suivis={(suivis.data ?? []) as SuiviIntervention[]}
          choix={choix}
          complet
        />
      )}
      {bail && (
        <section className="loc-carte">
          <h3>Votre prochaine échéance habituelle</h3>
          <p className="mt-3 text-sm">
            Loyer dû le {bail.jour_echeance ?? 5} du mois.
          </p>
          <Link
            className="lien-discret mt-3 block"
            href={`/locataire/${orgId}/loyers`}
          >
            Consulter mes paiements →
          </Link>
          {bail.date_fin && (
            <p className="mt-3 text-xs text-muted-foreground">
              Fin de bail le {formaterDate(bail.date_fin)}.
            </p>
          )}
        </section>
      )}
      <section className="loc-carte">
        <h3>Mes démarches à suivre</h3>
        <div className="mt-3 flex flex-wrap gap-5">
          <Link className="lien-discret" href={`/locataire/${orgId}/documents`}>
            Documents et assurance →
          </Link>
          <Link className="lien-discret" href={`/locataire/${orgId}/demandes`}>
            Signalements et interventions →
          </Link>
        </div>
      </section>
    </div>
  );
}
