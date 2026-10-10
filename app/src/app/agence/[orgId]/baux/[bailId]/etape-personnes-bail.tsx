import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { verifierAccesEspace } from "@/lib/espace";
import { PersonnesBail, type PersonneBail, type DetentionBail, type ParticipantBail } from "./personnes-bail";

export async function EtapePersonnesBail({ orgId, bailId, lotId, principalId, colocation }: {
  orgId: string; bailId: string; lotId: string; principalId: string | null; colocation: boolean;
}) {
  const { supabase, user, estProprietaire } = await verifierAccesEspace(orgId);
  const [annuaire, detentions, participants, lot] = await Promise.all([
    supabase.from("persons").select("id,nom,prenom,email,telephone,date_naissance,commune_naissance,address_line1,postal_code,city,qualite,account_id,archived_at")
      .eq("organization_id", orgId).order("nom"),
    supabase.from("detentions").select("id,person_id,quote_part,date_debut")
      .eq("organization_id", orgId).eq("lot_id", lotId).is("date_fin", null).order("id"),
    supabase.from("bail_personnes").select("id,person_id,role,garant_de")
      .eq("organization_id", orgId).eq("bail_id", bailId).order("created_at"),
    supabase.from("lots").select("bien_id").eq("id", lotId).eq("organization_id", orgId).maybeSingle(),
  ]);
  if (annuaire.error || detentions.error || participants.error || lot.error || !lot.data) return <p role="alert" className="err">Les personnes n’ont pas pu être chargées. Rechargez le dossier avant de modifier le bail.</p>;
  const moi = estProprietaire ? annuaire.data?.find(p => p.account_id === user.id && !p.archived_at)?.id ?? null : null;
  const personnes: PersonneBail[] = (annuaire.data ?? []).map(({ account_id: _compte, ...p }) => p);
  return <PersonnesBail orgId={orgId} bailId={bailId} personnes={personnes} detentions={(detentions.data as DetentionBail[]).map(d => ({ ...d, quote_part: Number(d.quote_part) }))}
    participants={participants.data as ParticipantBail[]} principalId={principalId} personneConnecteeId={moi} colocation={colocation} proprietairesHref={lienLotDepuisBail(orgId, lot.data.bien_id, lotId, bailId, "proprietaires", 2)} />;
}
