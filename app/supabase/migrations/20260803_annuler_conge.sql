-- Annuler un congé.
--
-- Un locataire qui se rétracte laissait le bail en préavis, sans chemin de
-- retour. L'annulation remet le monde dans l'état d'avant le congé : bail actif
-- sans date de fin, lot loué, alerte d'état des lieux de sortie refermée — et
-- le congé annulé reste au dossier avec sa date et son motif, car « annulé »
-- n'est pas « n'a jamais existé ».
--
-- Deux verrous, parce qu'après certains actes le retour n'a plus de sens :
--   · l'état des lieux de sortie est signé → le départ a eu lieu ;
--   · la restitution du dépôt est engagée → on rembourse, on ne revient pas.

alter table public.conges
  add column if not exists annule_le timestamptz,
  add column if not exists annulation_motif text;

create or replace function public.annuler_conge(p_bail uuid, p_motif text default null)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_etat public.bail_etat;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.etat into v_org, v_lot, v_etat
  from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'preavis' then
    raise exception 'Ce bail n''est pas en préavis : il n''y a pas de congé à annuler';
  end if;

  if exists (select 1 from public.etats_des_lieux e
              where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'L''état des lieux de sortie est signé : le départ a eu lieu, le congé ne s''annule plus';
  end if;
  if exists (select 1 from public.restitutions r where r.bail_id = p_bail) then
    raise exception 'La restitution du dépôt est engagée : le congé ne s''annule plus';
  end if;

  select c.id into v_conge from public.conges c
   where c.bail_id = p_bail and c.annule_le is null
   order by c.created_at desc limit 1;
  if v_conge is null then
    raise exception 'Aucun congé en cours sur ce bail';
  end if;

  update public.conges
     set annule_le = now(),
         annulation_motif = nullif(btrim(coalesce(p_motif, '')), '')
   where id = v_conge;

  -- Le bail d'abord, le lot ensuite : le déclencheur du lot exige un bail
  -- vivant pour accepter « loué ».
  update public.baux set etat = 'actif', date_fin = null, updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'loue' where id = v_lot and etat = 'preavis';

  -- L'alerte d'état des lieux de sortie n'a plus d'objet.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = auth.uid(),
         closed_action = 'Congé annulé — le locataire reste', updated_at = now()
   where organization_id = v_org
     and type = 'edl_sortie'
     and statut = 'ouverte'
     and details->>'bail_id' = p_bail::text;

  -- Un état des lieux de sortie commencé mais non signé redevient sans objet :
  -- on le laisse en brouillon, il resservira si un nouveau congé arrive.
end $function$;

revoke execute on function public.annuler_conge(uuid, text) from public, anon;
