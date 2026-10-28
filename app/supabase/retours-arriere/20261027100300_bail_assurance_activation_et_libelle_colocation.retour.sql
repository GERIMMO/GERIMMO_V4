-- Retire le rattachement de l'assurance du locataire à l'activation du bail et rétablit l'ancien message de
-- choisir_personne_bail (20261009150000). Les liens « personne » déjà posés sont conservés : ils désignent la pièce
-- réellement fournie par le locataire, et les retirer lui ferait de nouveau réclamer son attestation.
-- Une seule instruction DO atomique (audit final du 28/10, relecture COD-02) : seule en autocommit, ou intégralement
-- annulable dans une transaction externe, qu'elle ne valide jamais — la séquence des retours du 26/10, qui commence par
-- celui-ci, se joue ainsi dans une transaction contrôlée. Se rejoue sans effet.
do $retour_atomique$
begin
perform set_config('lock_timeout', '10s', true);
drop trigger if exists baux_assurance_locataire_activation on public.baux;
drop function if exists public.rattacher_assurance_locataire_activation();
create or replace function public.choisir_personne_bail(
  p_bail uuid, p_person uuid, p_role text, p_garant_de uuid default null,
  p_principal_attendu uuid default null
) returns void language plpgsql security invoker set search_path = '' as $fonction$
declare b public.baux%rowtype;
begin
  select * into b from public.baux where id = p_bail for update;
  if b.id is null or not (b.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé.';
  end if;
  if b.etat <> 'brouillon' then raise exception 'Seul un bail en brouillon se corrige.'; end if;
  if b.locataire_principal is distinct from p_principal_attendu then raise exception 'Le locataire a changé depuis votre ouverture. Rechargez le dossier.'; end if;
  if p_role not in ('principal','colocataire','garant') then raise exception 'Choisissez un rôle proposé.'; end if;
  if not exists (select 1 from public.persons where id=p_person and organization_id=b.organization_id and archived_at is null) then
    raise exception 'Cette personne ne peut pas être sélectionnée.';
  end if;
  if exists (select 1 from public.detentions where lot_id=b.lot_id and person_id=p_person and date_fin is null) then
    raise exception 'Cette personne est déjà propriétaire du logement.';
  end if;
  if exists (select 1 from public.bail_personnes where bail_id=p_bail and person_id=p_person) then
    raise exception 'Cette personne figure déjà dans ce bail.';
  end if;
  if p_role='principal' then
    if b.locataire_principal is not distinct from p_person then return; end if;
    if exists (select 1 from public.bail_personnes where bail_id=p_bail and garant_de=b.locataire_principal) then
      raise exception 'Retirez d’abord les garants du locataire actuel avant de le remplacer.';
    end if;
    update public.baux set locataire_principal=p_person where id=p_bail;
  else
    if p_person=b.locataire_principal then raise exception 'Cette personne est déjà locataire principal.'; end if;
    if p_role='colocataire' and (b.type <> 'colocation' or b.chambre_id is not null) then
      raise exception 'Pour plusieurs locataires sur ce contrat, choisissez la colocation à l’étape Dates et montants.';
    end if;
    if p_role='garant' and (p_garant_de is null or not (p_garant_de=b.locataire_principal or exists (
      select 1 from public.bail_personnes where bail_id=p_bail and person_id=p_garant_de and role='colocataire' and date_depart is null
    ))) then raise exception 'Choisissez le locataire couvert par ce garant.'; end if;
    insert into public.bail_personnes(organization_id,bail_id,person_id,role,garant_de)
      values(b.organization_id,p_bail,p_person,p_role,case when p_role='garant' then p_garant_de end);
  end if;
end;
$fonction$;
revoke all on function public.choisir_personne_bail(uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.choisir_personne_bail(uuid,uuid,text,uuid,uuid) to authenticated;
perform pg_notify('pgrst', 'reload schema');
if to_regclass('supabase_migrations.schema_migrations') is not null then
  delete from supabase_migrations.schema_migrations where version = '20261027100300';
end if;
end;
$retour_atomique$;
