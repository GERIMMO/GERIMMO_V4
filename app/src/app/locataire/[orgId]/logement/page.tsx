import Link from "next/link";
import { eur, formaterDate } from "@/lib/ged";
import { TYPES_BAIL } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { CarteConge } from "./carte-conge";
import type { BailLocataire } from "../types";

export const metadata = { title: "Mon logement — Gerimmo" };

// « Mon logement » (maquette v10) : le logement, le bail en clair — préavis
// compris —, le dépôt de garantie expliqué, et le congé qui se donne ici.
export default async function PageLogementLocataire(
  props: PageProps<"/locataire/[orgId]/logement">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const [{ data: baux }, { data: depotRows }, { data: infosRows }] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_depot_locataire", { p_org: orgId }),
    supabase.rpc("mes_infos_pratiques_locataire", { p_org: orgId }),
  ]);
  const bail = ((baux ?? []) as BailLocataire[])[0];
  const depot = ((depotRows ?? []) as {
    depot_du: number;
    encaisse: number;
  }[])[0];

  if (!bail) {
    return (
      <div className="space-y-4">
        <h1>Mon logement</h1>
        <div className="loc-carte">
          <p className="text-sm text-muted-foreground">
            Aucun bail actif — votre logement apparaîtra ici dès la signature de
            votre bail.
          </p>
        </div>
      </div>
    );
  }

  const preavisMois = bail.meuble || bail.type === "meuble" || bail.zone_tendue ? 1 : 3;
  const forfait = bail.charges_mode === "forfait";

  return (
    <div className="space-y-4">
      <h1>Mon logement</h1>

      <div className="loc-carte">
        <div className="flex flex-wrap items-center gap-4">
          <span className="loc-vignette" style={{ width: 88, height: 68, fontSize: 24 }} aria-hidden>
            {(bail.ville?.[0] ?? bail.lot_nom[0] ?? "G").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-heading text-lg text-[var(--encre)]">{bail.lot_nom}</p>
            <p className="text-[13px] text-muted-foreground">
              {[
                bail.adresse,
                bail.surface_m2 != null ? `${Number(bail.surface_m2).toLocaleString("fr-FR")} m²` : null,
                bail.pieces != null ? `${bail.pieces} pièce${bail.pieces > 1 ? "s" : ""}` : null,
                bail.etage ? `étage ${bail.etage}` : null,
                bail.meuble ? "meublé" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="ligne-info">
            <span>Bail</span>
            <span className="text-right">
              Bail {(TYPES_BAIL[bail.type] ?? bail.type).toLowerCase()}
              {bail.date_debut ? ` · depuis le ${formaterDate(bail.date_debut)}` : ""}
              {bail.etat === "preavis" && bail.date_fin
                ? ` · fin le ${formaterDate(bail.date_fin)}`
                : ""}
            </span>
          </div>
          <div className="ligne-info">
            <span>Préavis si vous partez</span>
            <span className="text-right">
              {preavisMois} mois
              {preavisMois === 1
                ? bail.meuble || bail.type === "meuble"
                  ? " (logement meublé)"
                  : " (zone tendue)"
                : ""}
            </span>
          </div>
          <div className="ligne-info">
            <span>Loyer</span>
            <span className="text-right">
              {eur(Number(bail.loyer_hc ?? 0))} + {eur(Number(bail.charges ?? 0))} de{" "}
              {forfait ? "forfait" : "provision"} de charges
            </span>
          </div>
          {depot && Number(depot.depot_du) > 0 && (
            <div className="ligne-info">
              <span>Dépôt de garantie</span>
              <span className="text-right">
                {eur(Number(depot.encaisse))}
                {Number(depot.encaisse) < Number(depot.depot_du)
                  ? ` versé sur ${eur(Number(depot.depot_du))}`
                  : ""}
              </span>
            </div>
          )}
        </div>
        {depot && Number(depot.depot_du) > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Cet argent reste le vôtre : il vous est restitué sous 1 mois après
            un état des lieux de sortie conforme (2 mois si des retenues sont
            justifiées, pièces à l&apos;appui), l&apos;usure normale déduite.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {bail.document_signe && (
            <a
              href={`/locataire/${orgId}/bail/fichier`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Consulter mon bail signé
            </a>
          )}
          <Link
            href={`/locataire/${orgId}/loyers`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Mes quittances
          </Link>
        </div>
      </div>

      {(() => {
        // « Votre logement, mode d'emploi » : les infos pratiques que
        // l'agence a renseignées sur le bien (backend v10)
        const infos = ((infosRows ?? []) as {
          sortie_poubelles: string | null;
          local_poubelles: string | null;
          gardien: string | null;
          travaux: string | null;
          stationnement: string | null;
          autres: string | null;
        }[])[0];
        const lignes = infos
          ? ([
              ["Local poubelles & tri", infos.local_poubelles],
              ["Sortie des poubelles", infos.sortie_poubelles],
              ["Gardien", infos.gardien],
              ["Stationnement", infos.stationnement],
              ["Travaux en cours", infos.travaux],
              ["Bon à savoir", infos.autres],
            ] as const).filter(([, v]) => v)
          : [];
        if (lignes.length === 0) return null;
        return (
          <div className="loc-carte">
            <h3 className="text-base font-medium">Votre logement, mode d&apos;emploi</h3>
            <div className="mt-2">
              {lignes.map(([titre, valeur]) => (
                <div key={titre} className="ligne-info">
                  <span>{titre}</span>
                  <span className="text-right">{valeur}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <CarteConge
        orgId={orgId}
        enPreavis={bail.etat === "preavis"}
        dateFin={bail.date_fin}
        preavisMois={preavisMois}
      />
    </div>
  );
}
