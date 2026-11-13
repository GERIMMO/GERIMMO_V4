import { RepresentantBail } from "./representant-bail";
import { lienLotDepuisBail } from "@/lib/parcours-lot";
import { verifierAccesEspace } from "@/lib/espace";
import { ConseilsChoixLocataire } from "@/components/conseils-choix-locataire";
import { CONSEILS_LOCATAIRE_VALIDES } from "@/lib/conseils-locataire";
import { PersonnesBail, type PersonneBail, type DetentionBail, type ParticipantBail } from "./personnes-bail";
import { racineEspace } from "@/lib/racine-espace";

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
  const societes=personnes.filter(p=>estProprietaire && !p.archived_at && /sci|morale|soci[eé]t[eé]/i.test(p.qualite??"") && detentions.data?.some(d=>d.person_id===p.id));
  const formulaires=await Promise.all(societes.map(async s=>{
    const [liens,pouvoir]=await Promise.all([
      supabase.from("document_liens").select("document_id").eq("organization_id",orgId).eq("entite","personne").eq("entite_id",s.id),
      supabase.from("representations_bail").select("personne_id,justificatif_id,fin_validite").eq("bail_id",bailId).eq("societe_id",s.id).maybeSingle()
    ]);
    const ids=(liens.data??[]).map(l=>l.document_id);
    const pieces=ids.length?await supabase.from("documents").select("id,titre").eq("organization_id",orgId).in("id",ids).in("type",["justificatif","mandat"]).eq("mime_type","application/pdf").is("purged_at",null):{data:[],error:null};
    if(liens.error||pouvoir.error||pieces.error) return <p key={s.id} role="alert">Le pouvoir de signature de {s.nom} ne peut pas être chargé.</p>;
    return <RepresentantBail key={s.id} org={orgId} bail={bailId} societe={{id:s.id,libelle:s.nom}} actuel={pouvoir.data??undefined}
      personnes={personnes.filter(p=>!p.archived_at && (p.qualite??"Personne physique")==="Personne physique" && p.id!==principalId && !participants.data?.some(x=>x.person_id===p.id)).map(p=>({id:p.id,libelle:[p.prenom,p.nom].filter(Boolean).join(" ")}))}
      pieces={(pieces.data??[]).map(p=>({id:p.id,libelle:p.titre??"PDF"}))} fiche={`${racineEspace(estProprietaire)}/${orgId}/personnes/${s.id}#pieces`}/>;
  }));
  return <><PersonnesBail orgId={orgId} bailId={bailId} personnes={personnes} detentions={(detentions.data as DetentionBail[]).map(d => ({ ...d, quote_part: Number(d.quote_part) }))}
    participants={participants.data as ParticipantBail[]} principalId={principalId} personneConnecteeId={moi} colocation={colocation} proprietairesHref={lienLotDepuisBail(orgId, lot.data.bien_id, lotId, bailId, "proprietaires", 2, racineEspace(estProprietaire))}
    // Les conseils pour choisir son locataire s'adressent au propriétaire en gestion directe ; l'agence ne les voit pas (V1 publique).
    conseils={estProprietaire && CONSEILS_LOCATAIRE_VALIDES ? <ConseilsChoixLocataire emplacement="creation-bail" /> : null} />{formulaires}</>;
}
