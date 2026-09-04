import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ETATS_LOT, COULEURS_ETAT_LOT, formaterSurface, cibleBlocage } from "@/lib/parc";
import { TYPES_BAIL } from "@/lib/baux";
import { eur } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { buttonVariants } from "@/components/ui/button";

// Détail d'un lot, rendu EN LIGNE dans l'accordéon du Parc (maquette v3
// `.detail-lot`) : l'essentiel du lot sans quitter la liste, la fiche
// complète à un clic.
export async function DetailLotParc({
  supabase,
  orgId,
  lotId,
}: {
  supabase: SupabaseClient;
  orgId: string;
  lotId: string;
}) {
  const [{ data: lot }, { data: blocages }, { data: detentions }, { data: baux }] =
    await Promise.all([
      supabase
        .from("lots")
        .select("id, nom, etat, surface_m2, pieces, etage, meuble, bien:biens!lots_bien_id_fkey(id, nom, type, city)")
        .eq("id", lotId)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase.rpc("lot_blocages_location", { p_lot: lotId }),
      supabase
        .from("detentions")
        .select("quote_part, person:persons!detentions_person_id_fkey(nom, prenom)")
        .eq("lot_id", lotId)
        .is("date_fin", null),
      supabase
        .from("baux")
        .select(
          "id, type, etat, loyer_hc, charges, date_debut, date_fin, locataire:persons!baux_locataire_meme_org_fk(nom, prenom)"
        )
        .eq("lot_id", lotId)
        .in("etat", ["actif", "preavis"])
        .limit(1),
    ]);
  if (!lot) {
    return (
      <div className="vide">
        Ce lot n&apos;existe plus. Choisissez-en un autre dans la liste.
      </div>
    );
  }
  const bien = premier(lot.bien as UnOuPlusieurs<{ id: string; nom: string; type: string; city: string }>);
  const bail = (baux ?? [])[0];
  const occupant = bail ? premier(bail.locataire as UnOuPlusieurs<{ nom: string; prenom: string | null }>) : null;
  // Maquette v3 : un EDL en cours de saisie remonte sur le lot, avec le bouton
  // qui mène directement à la grille.
  const { data: edlEnCours } = bail
    ? await supabase
        .from("etats_des_lieux")
        .select("id, type")
        .eq("bail_id", bail.id)
        .is("signe_le", null)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const proprietaires = (detentions ?? [])
    .map((d) => {
      const p = premier(d.person as UnOuPlusieurs<{ nom: string; prenom: string | null }>);
      return p ? `${nomComplet(p)} (${Number(d.quote_part)} %)` : null;
    })
    .filter(Boolean)
    .join(", ");
  const causes = Array.isArray(blocages) ? (blocages as string[]) : [];
  const ficheLot = bien ? `/agence/${orgId}/parc/${bien.id}/lots/${lot.id}` : `/agence/${orgId}/parc`;

  return (
    <div className="min-w-0 space-y-3.5">
      <div className="entete-page">
        <div>
          <h2 className="mt-0.5 font-heading text-xl">{lot.nom}</h2>
          <p className="text-sm text-muted-foreground">
            {[
              lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : null,
              lot.pieces !== null ? `${lot.pieces} pièce${lot.pieces > 1 ? "s" : ""}` : null,
              lot.etage ? `étage ${lot.etage}` : null,
              lot.meuble ? "meublé" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Caractéristiques à renseigner"}
          </p>
        </div>
        <span className={COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"}>
          {ETATS_LOT[lot.etat] ?? lot.etat}
        </span>
      </div>

      {lot.etat === "brouillon" || causes.length > 0 ? (
        causes.length > 0 ? (
          <div className="border-l-[3px] border-l-warning bg-warning-soft p-3.5">
            <p className="mono-discret mb-1.5 text-warning-soft-foreground">
              {causes.length} élément{causes.length > 1 ? "s" : ""} manquant{causes.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-1.5">
              {causes.map((m) => {
                const cible = bien ? cibleBlocage(m, { orgId, bienId: bien.id, lotId: lot.id }) : null;
                return (
                  <li key={m} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1">— {m}</span>
                    {cible && (
                      <Link href={cible.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        {cible.libelle} →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="border-l-[3px] border-l-success bg-success-soft p-3.5 text-sm text-success-soft-foreground">
            Lot complet — prêt à passer disponible.
          </div>
        )
      ) : (
        <div className="border-l-[3px] border-l-success bg-success-soft p-3.5 text-sm text-success-soft-foreground">
          Lot complet. {bail ? "Bail en cours." : "Prêt à recevoir un bail."}
        </div>
      )}

      <div>
        <div className="ligne-info">
          <span>Propriétaire</span>
          <span className="text-right">{proprietaires || "—"}</span>
        </div>
        <div className="ligne-info">
          <span>Occupant</span>
          <span className="text-right">{occupant ? nomComplet(occupant) : "libre"}</span>
        </div>
        {bail && (
          <>
            <div className="ligne-info">
              <span>Bail</span>
              <span className="text-right">
                <Link href={`/agence/${orgId}/baux/${bail.id}`} className="lien-discret">
                  {TYPES_BAIL[bail.type] ?? bail.type}
                  {bail.date_debut ? ` depuis le ${new Date(bail.date_debut).toLocaleDateString("fr-FR")}` : ""} ›
                </Link>
              </span>
            </div>
            <div className="ligne-info">
              <span>Loyer + charges</span>
              <span className="text-right">{eur(Number(bail.loyer_hc) + Number(bail.charges))}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={ficheLot} className="btn-or">
          Ouvrir la fiche du lot
        </Link>
        {bail && edlEnCours && (
          <Link
            href={`/agence/${orgId}/baux/${bail.id}/edl/${edlEnCours.id}`}
            className={buttonVariants({ size: "sm" })}
          >
            État des lieux {edlEnCours.type === "sortie" ? "de sortie" : "d'entrée"} · en cours
          </Link>
        )}
      </div>
    </div>
  );
}
