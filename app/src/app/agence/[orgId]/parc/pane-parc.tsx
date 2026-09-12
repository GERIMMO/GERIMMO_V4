import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ETATS_LOT, COULEURS_ETAT_LOT, TYPES_BIEN, formaterSurface } from "@/lib/parc";
import { eur } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";
import { EchecLecture } from "./echec-lecture";
import { BoutonLot } from "@/components/fenetre-lot";

// Panneau de droite du Parc : le BIEN sélectionné s'ouvre ICI, sans quitter le
// Parc — la fiche complète reste à un clic. Retour recette 30/08 : « ouvrir un
// bien m'emmenait sur une autre page, la maquette le montre à côté de la liste ».
//
// LE LOT, LUI, A QUITTÉ CE PANNEAU le 12/09 : il ouvre désormais la fenêtre
// (`fenetre-lot.tsx`), qui porte en plus ses documents et sa comptabilité.
// `lireSelection` continue de reconnaître `lot:…` — la page s'en sert pour
// ouvrir la fenêtre à l'arrivée sur un lien profond.

type Selection = { type: "bien" | "lot"; id: string };
export type SelectionBien = { type: "bien"; id: string };

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
  selection: SelectionBien;
}) {
  const retour = (
    // Sous 900px, le lien .retour-liste de la page fait le même travail
    <Link href={`/agence/${orgId}/parc`} className="lien-discret text-sm max-[900px]:hidden">
      ‹ Vue d&apos;ensemble
    </Link>
  );

  const { data: bien, error: erreurBien } = await supabase
    .from("biens")
    .select(
      "id, nom, type, address_line1, postal_code, city, copropriete, lots!lots_bien_id_fkey(id, nom, etat, surface_m2, pieces)"
    )
    .eq("id", selection.id)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Lecture refusée : dire « cet élément n'existe plus » enverrait chercher
  // un bien qui existe (relevé du 11/09).
  if (erreurBien) return <Echec retour={retour} quoi={["le bien"]} />;
  if (!bien) return <Introuvable retour={retour} />;
  const lots = (bien.lots as { id: string; nom: string; etat: string; surface_m2: number | null; pieces: number | null }[])
    .filter((l) => l.etat !== "archive");
  const loues = lots.filter((l) => l.etat === "loue" || l.etat === "preavis").length;
  const { data: baux, error: erreurBaux } = await supabase
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
      <EchecLecture quoi={erreurBaux ? ["les baux en cours de ce bien"] : []} />
      <div className="entete-page">
        <div>
          <span className="eyebrow">
            {TYPES_BIEN[bien.type] ?? bien.type} · {bien.city}
          </span>
          {/* h2 : le <h1> du document est le titre de la page Parc */}
          <h2 className="mt-0.5 text-3xl">{bien.nom}</h2>
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
            <BoutonLot
              key={l.id}
              lotId={l.id}
              href={`/agence/${orgId}/parc/${bien.id}/lots/${l.id}`}
              className="rang"
            >
              <span className="min-w-0 flex-1 text-left">
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
            </BoutonLot>
          );
        })}
      </div>
    </div>
  );
}

function Echec({ retour, quoi }: { retour: React.ReactNode; quoi: string[] }) {
  return (
    <div className="min-w-0 space-y-3">
      {retour}
      <EchecLecture quoi={quoi} />
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
