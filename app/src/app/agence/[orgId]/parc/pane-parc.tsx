import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ETATS_LOT, COULEURS_ETAT_LOT, TYPES_BIEN, formaterSurface, cibleBlocage } from "@/lib/parc";
import { TYPES_BAIL } from "@/lib/baux";
import { eur } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";

// Panneau de droite du Parc (maquette `paneDe` / `paneLot` / `pageBien`) :
// la sélection dans la liste s'ouvre ICI, sans quitter le Parc — la fiche
// complète reste à un clic. Retour recette 30/08 : « ouvrir un bien m'emmenait
// sur une autre page, la maquette le montre à côté de la liste ».

type Selection = { type: "bien" | "lot"; id: string };

export function lireSelection(brut: string | string[] | undefined): Selection | null {
  if (typeof brut !== "string") return null;
  const [type, id] = brut.split(":");
  if ((type === "bien" || type === "lot") && id) return { type, id };
  return null;
}

export async function PaneParc({
  supabase,
  orgId,
  selection,
}: {
  supabase: SupabaseClient;
  orgId: string;
  selection: Selection;
}) {
  const retour = (
    <Link href={`/agence/${orgId}/parc`} className="lien-discret text-sm">
      ‹ Vue d&apos;ensemble
    </Link>
  );

  if (selection.type === "bien") {
    const { data: bien } = await supabase
      .from("biens")
      .select(
        "id, nom, type, address_line1, postal_code, city, copropriete, lots!lots_bien_id_fkey(id, nom, etat, surface_m2, pieces)"
      )
      .eq("id", selection.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!bien) return <Introuvable retour={retour} />;
    const lots = (bien.lots as { id: string; nom: string; etat: string; surface_m2: number | null; pieces: number | null }[])
      .filter((l) => l.etat !== "archive");
    const loues = lots.filter((l) => l.etat === "loue" || l.etat === "preavis").length;
    const { data: baux } = await supabase
      .from("baux")
      .select("lot_id, loyer_hc, charges, locataire:persons!baux_locataire_meme_org_fk(nom, prenom)")
      .eq("organization_id", orgId)
      .in("etat", ["actif", "preavis"])
      .in("lot_id", lots.map((l) => l.id));
    const parLot = new Map(
      (baux ?? []).map((b) => [
        b.lot_id,
        {
          loyer: Number(b.loyer_hc) + Number(b.charges),
          occupant: premier(b.locataire as UnOuPlusieurs<{ nom: string; prenom: string | null }>),
        },
      ])
    );
    const loyers = [...parLot.values()].reduce((s, b) => s + b.loyer, 0);

    return (
      <div className="min-w-0 space-y-3.5">
        {retour}
        <div className="entete-page">
          <div>
            <span className="eyebrow">
              {TYPES_BIEN[bien.type] ?? bien.type} · {bien.city}
            </span>
            <h1 className="mt-0.5">{bien.nom}</h1>
            <p className="text-sm text-muted-foreground">
              {bien.address_line1}, {bien.postal_code} {bien.city}
              {bien.copropriete ? " · en copropriété" : ""}
            </p>
          </div>
          <Link href={`/agence/${orgId}/parc/${bien.id}`} className="btn-or">
            Ouvrir la fiche du bien
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="kpi or">
            <span className="eyebrow">Lots</span>
            <span className="chiffre block">{lots.length}</span>
            <span className="block text-xs text-muted-foreground">
              {loues} loué{loues > 1 ? "s" : ""} · {lots.length - loues} à louer ou en préparation
            </span>
          </div>
          <div className="kpi bleu">
            <span className="eyebrow">Loyers en cours</span>
            <span className="chiffre block">{eur(loyers)}</span>
            <span className="block text-xs text-muted-foreground">par mois, charges comprises</span>
          </div>
        </div>
        <div className="colonne-liste">
          <div className="tete-liste">
            <span className="mono-discret">Lots du bien</span>
          </div>
          {lots.map((l) => {
            const b = parLot.get(l.id);
            return (
              <Link key={l.id} href={`/agence/${orgId}/parc?sel=lot:${l.id}`} className="rang">
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{l.nom}</b>
                  <small className="block truncate">
                    {[
                      l.surface_m2 !== null ? formaterSurface(l.surface_m2) : null,
                      l.pieces !== null ? `${l.pieces} pièce${l.pieces > 1 ? "s" : ""}` : null,
                      b?.occupant ? nomComplet(b.occupant) : "libre",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span className={`${COULEURS_ETAT_LOT[l.etat] ?? "puce puce-grise"} shrink-0`}>
                  {ETATS_LOT[l.etat] ?? l.etat}
                </span>
                <IndicateurLien />
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  const [{ data: lot }, { data: blocages }, { data: detentions }, { data: baux }] =
    await Promise.all([
      supabase
        .from("lots")
        .select("id, nom, etat, surface_m2, pieces, etage, meuble, bien:biens!lots_bien_id_fkey(id, nom, type, city)")
        .eq("id", selection.id)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase.rpc("lot_blocages_location", { p_lot: selection.id }),
      supabase
        .from("detentions")
        .select("quote_part, person:persons!detentions_person_id_fkey(nom, prenom)")
        .eq("lot_id", selection.id)
        .is("date_fin", null),
      supabase
        .from("baux")
        .select(
          "id, type, etat, loyer_hc, charges, date_debut, date_fin, locataire:persons!baux_locataire_meme_org_fk(nom, prenom)"
        )
        .eq("lot_id", selection.id)
        .in("etat", ["actif", "preavis"])
        .limit(1),
    ]);
  if (!lot) return <Introuvable retour={retour} />;
  const bien = premier(lot.bien as UnOuPlusieurs<{ id: string; nom: string; type: string; city: string }>);
  const bail = (baux ?? [])[0];
  // Maquette v3 : un EDL en cours de saisie remonte sur le lot, avec le
  // bouton qui mène directement à la grille.
  const { data: edlEnCours } = bail
    ? await supabase
        .from("etats_des_lieux")
        .select("id, type")
        .eq("bail_id", bail.id)
        .is("signe_le", null)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const occupant = bail ? premier(bail.locataire as UnOuPlusieurs<{ nom: string; prenom: string | null }>) : null;
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
      {retour}
      <div className="entete-page">
        <div>
          {bien && (
            <span className="eyebrow">
              {bien.nom} · {bien.city}
            </span>
          )}
          <h1 className="mt-0.5">{lot.nom}</h1>
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
        {bien && (
          <Link href={`/agence/${orgId}/parc?sel=bien:${bien.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voir le bien
          </Link>
        )}
      </div>
    </div>
  );
}

function Introuvable({ retour }: { retour: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-3">
      {retour}
      <div className="vide">Cet élément n&apos;existe plus. Choisissez-en un autre dans la liste.</div>
    </div>
  );
}
