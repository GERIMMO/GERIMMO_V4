import { createClient } from "@/lib/supabase/server";
import { premier } from "@/lib/postgrest";
import { nomComplet } from "@/lib/roles-personnes";
import type { ValeursParcoursBail } from "@/lib/champs-etape-bail";
import { rubriquesRecapBail } from "@/lib/presentation-recapitulatif-bail";
import { lireRecapitulatifPiecesBail } from "@/lib/recapitulatif-pieces-bail";
import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { racineEspace } from "@/lib/racine-espace";
import { BilanBail } from "./bilan-bail";
import type { ReactNode } from "react";

export async function RecapitulatifParcoursBail({ orgId, lotId, bailId, bail, personnes, documents, signature, lectureSeule = false, estProprietaire = false, erreurPersonnes = false }: {
  orgId: string; lotId: string; bailId?: string; bail: ValeursParcoursBail;
  personnes: { nom: string; role: string }[]; documents: ReactNode; signature: ReactNode;
  lectureSeule?: boolean; estProprietaire?: boolean; erreurPersonnes?: boolean;
}) {
  const db = await createClient();
  const [logement, detentions, pieces] = await Promise.all([
    db.from("lots").select("*,bien:biens!lots_bien_id_fkey(*)").eq("id", lotId).eq("organization_id", orgId).maybeSingle(),
    db.from("detentions").select("quote_part,person:persons!detentions_person_id_fkey(nom,prenom)")
      .eq("lot_id", lotId).eq("organization_id", orgId).is("date_fin", null),
    bailId && !lectureSeule ? lireRecapitulatifPiecesBail(db, { orgId, bailId, estProprietaire }) : undefined,
  ]);
  const lot = logement.data, bien = premier(lot?.bien ?? null);
  const lien = (etape: "bien" | "lot") => lot?.bien_id && bailId ? lienLotDepuisBail(orgId, lot.bien_id, lotId, bailId, etape, 7, racineEspace(estProprietaire)) : `#completer-${etape}`;
  const rubriques = rubriquesRecapBail({
    bail, lot: lot ?? {}, bien: bien ?? {}, liens: { lot: lien("lot"), bien: lien("bien") },
    // Quote-part écrite à la française (« 33,33 % »), quel que soit le format rendu par l’API (audit #264, CB-16).
    personnes: [...(detentions.data ?? []).map(d => ({ nom: `${nomComplet(premier(d.person) ?? { nom: "Identité indisponible", prenom: null })}${d.quote_part == null ? "" : ` · ${Number(d.quote_part).toLocaleString("fr-FR")} %`}`, role: "Propriétaire" })), ...personnes],
    erreurLogement: logement.error || !lot || !bien ? "Les informations du logement et du bâtiment sont indisponibles." : undefined,
    erreurPersonnes: detentions.error || erreurPersonnes ? "Les personnes associées ne peuvent pas être vérifiées." : undefined,
  });
  return <BilanBail orgId={orgId} rubriques={rubriques} pieces={pieces} lectureSeule={lectureSeule}>{documents}{signature}</BilanBail>;
}
