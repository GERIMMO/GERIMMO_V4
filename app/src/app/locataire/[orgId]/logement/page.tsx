import Link from "next/link";
import { eur, formaterDate } from "@/lib/ged";
import { TYPES_BAIL } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { FenetreLotProvider, BoutonLot } from "@/components/fenetre-lot";
import { CarteConge } from "./carte-conge";
import { aEchoue, LectureImpossible, PanneLecture } from "../panne-lecture";
import type { BailLocataire } from "../types";

export const metadata = { title: "Mon logement" };

// « Mon logement » (maquette v10) : le logement, le bail en clair — préavis
// compris —, le dépôt de garantie expliqué, et le congé qui se donne ici.
export default async function PageLogementLocataire(
  props: PageProps<"/locataire/[orgId]/logement">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: baux, error: eBaux },
    { data: depotRows, error: eDepot },
    { data: infosRows, error: eInfos },
    { data: intentions, error: eIntentions },
    { data: edlRows, error: eEdl },
  ] =
    await Promise.all([
      supabase.rpc("mon_bail_locataire", { p_org: orgId }),
      supabase.rpc("mon_depot_locataire", { p_org: orgId }),
      supabase.rpc("mes_infos_pratiques_locataire", { p_org: orgId }),
      supabase.rpc("mon_intention_conge", { p_org: orgId }),
      supabase.rpc("mes_edl_locataire", { p_org: orgId }),
    ]);
  // L'identifiant du lot : `mon_bail_locataire` n'en rend que le nom, et la
  // fenêtre du lot — la même que voit son gestionnaire, à sa portée à lui —
  // a besoin de l'identifiant pour s'ouvrir (12/09).
  const { data: lotId } = await supabase.rpc("mon_lot_locataire", { p_org: orgId });
  const bail = ((baux ?? []) as BailLocataire[])[0];
  const depot = ((depotRows ?? []) as {
    depot_du: number;
    encaisse: number;
  }[])[0];

  // « Aucun bail actif » est la phrase la plus lourde de l'espace : elle ne
  // doit jamais tomber sur une simple lecture ratée (relevé 11/09).
  if (!bail) {
    return (
      <div className="space-y-4">
        <div className="entete-page">
          <h1>Mon logement</h1>
        </div>
        <div className="loc-carte">
          {aEchoue(eBaux) ? (
            <LectureImpossible quoi="votre logement" />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun bail actif — votre logement apparaîtra ici dès la signature
              de votre bail.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Le type du bail prime (un bail nu reste à 3 mois hors zone tendue) ; pour
  // une colocation à bail unique, le meublé du logement fait foi — même règle
  // que le serveur (enregistrer_conge).
  const bailMeuble = bail.type === "meuble" || (bail.type === "colocation" && bail.meuble);
  const preavisMois = bailMeuble || bail.zone_tendue ? 1 : 3;
  const forfait = bail.charges_mode === "forfait";
  const depotDu = Number(depot?.depot_du ?? 0);
  const depotRecu = Number(depot?.encaisse ?? 0);

  return (
    <FenetreLotProvider orgId={orgId}>
    <div className="space-y-4">
      {/* L'en-tête porte sa mention, comme ses pages sœurs (24/09) : la carte
          était vide à droite du titre. */}
      <div className="entete-page">
        <h1>Mon logement</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="mono-discret">
            Bail {(TYPES_BAIL[bail.type] ?? "d'habitation").toLowerCase()}
            {bail.date_debut ? ` · depuis le ${formaterDate(bail.date_debut)}` : ""}
          </span>
          {bail.etat === "preavis" && (
            // La date de fin est déjà dite deux fois plus bas (ligne « Bail » et
            // carte de congé) : le bandeau n'en rajoute pas une troisième.
            <span className="loc-tag ambre">Préavis en cours</span>
          )}
        </div>
      </div>

      {aEchoue(eDepot, eInfos, eIntentions, eEdl) && (
        <PanneLecture quoi="le détail de votre logement" />
      )}

      <div className="loc-carte">
        {/* Le logement s'ouvre EN FENÊTRE, comme chez son gestionnaire : même
            composant, même forme, portée différente — son bail, ses documents,
            ses loyers, jamais le propriétaire ni les honoraires de l'agence.
            24/09 : tout le rang est un bouton, et désormais il le montre —
            survol, focus, chevron, libellé en couleur de marque. Plus de
            vignette à initiale ; l'adresse en titre, le nom du lot (saisi par
            l'agence) en appui. Espaces insécables : « 45 m² » ne se coupe plus
            entre le nombre et l'unité. */}
        <BoutonLot
          lotId={String(lotId ?? "")}
          href="#bail"
          className="-m-2 flex w-[calc(100%+1rem)] items-center gap-4 rounded-xl p-2 text-left transition-colors hover:bg-[var(--survol)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="font-heading block text-lg text-[var(--encre)]">{bail.adresse || bail.lot_nom}</span>
            <span className="block text-[13px] text-muted-foreground">
              {[
                bail.adresse ? bail.lot_nom : null,
                bail.surface_m2 != null ? `${Number(bail.surface_m2).toLocaleString("fr-FR")}\u00a0m²` : null,
                bail.pieces != null ? `${bail.pieces} pièce${bail.pieces > 1 ? "s" : ""}` : null,
                bail.etage ? `étage ${bail.etage}` : null,
                bail.meuble ? "meublé" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="mt-1 block text-[13px] font-medium text-[var(--marque)]">
              Tout mon logement en un coup d’œil
            </span>
          </span>
          <span aria-hidden className="ml-auto shrink-0 text-xl leading-none text-[var(--marque)]">
            ›
          </span>
        </BoutonLot>

        <div id="bail" className="mt-4 scroll-mt-24">
          <div className="ligne-info">
            <span>Bail</span>
            <span className="text-right">
              Bail {(TYPES_BAIL[bail.type] ?? "d'habitation").toLowerCase()}
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
              {preavisMois === 1 ? (bailMeuble ? " (logement meublé)" : " (zone tendue : secteur où les logements à louer manquent, la loi y réduit le préavis)") : ""}
            </span>
          </div>
          <div className="ligne-info">
            <span>Loyer</span>
            <span className="montant text-right">
              {eur(Number(bail.loyer_hc ?? 0))} + {eur(Number(bail.charges ?? 0))} de{" "}
              {forfait ? "forfait" : "provision"} de charges
            </span>
          </div>
          {/* Le montant DÛ d'abord, l'état du versement en mention (24/09) :
              « 0,00 € versé sur 650,00 € » suivi de « cet argent reste le
              vôtre » laissait croire à un dépôt égaré. */}
          {depot && depotDu > 0 && (
            <div className="ligne-info">
              <span>Dépôt de garantie</span>
              <span className="montant text-right">
                {depotRecu <= 0 ? (
                  <>
                    {eur(depotDu)}
                    <span className="text-muted-foreground"> — aucun versement enregistré à ce jour</span>
                  </>
                ) : depotRecu < depotDu ? (
                  `${eur(depotRecu)} reçus sur ${eur(depotDu)}`
                ) : (
                  <>
                    {eur(depotDu)}
                    <span className="text-muted-foreground"> — reçu</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>
        {depot && depotDu > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {depotRecu > 0 ? "Cet argent reste le vôtre" : "Une fois versé, cet argent reste le vôtre"}{" "}
            : il vous est restitué sous 1 mois après un état des lieux de sortie
            conforme (2 mois si des retenues sont justifiées, pièces à
            l&apos;appui), l&apos;usure normale déduite.
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
            {/* Le nom de la page où il mène (24/09) */}
            Mes paiements
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

      {(() => {
        // États des lieux (chantier D3) : l'EDL est opposable au locataire —
        // il en suit l'avancement ici ; la signature reste un geste sur place.
        const edls = ((edlRows ?? []) as {
          id: string;
          type: string;
          etat: string;
          date_edl: string | null;
          signe_le: string | null;
        }[]).filter((e) => e.type === "entree" || e.type === "sortie");
        if (edls.length === 0) return null;
        return (
          <div className="loc-carte">
            <h3 className="text-base font-medium">Mes états des lieux</h3>
            <div className="mt-2">
              {edls.map((e) => (
                <div key={e.id} className="ligne-info">
                  <span>État des lieux {e.type === "entree" ? "d'entrée" : "de sortie"}</span>
                  <span className="text-right">
                    {e.etat === "signe" ? (
                      <span className="loc-tag vert">
                        signé{e.signe_le ? ` le ${formaterDate(e.signe_le)}` : ""}
                      </span>
                    ) : (
                      <span className="loc-tag ambre">
                        en préparation{e.date_edl ? ` — prévu le ${formaterDate(e.date_edl)}` : ""}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              L&apos;état des lieux se signe sur place, le jour du rendez-vous avec
              votre gestionnaire — vous en gardez un exemplaire.
            </p>
          </div>
        );
      })()}

      <CarteConge
        orgId={orgId}
        enPreavis={bail.etat === "preavis"}
        dateFin={bail.date_fin}
        preavisMois={preavisMois}
        intentionDu={
          ((intentions ?? []) as { created_at: string; traitee_le: string | null }[]).find(
            (i) => !i.traitee_le
          )?.created_at ?? null
        }
      />
    </div>
    </FenetreLotProvider>
  );
}
