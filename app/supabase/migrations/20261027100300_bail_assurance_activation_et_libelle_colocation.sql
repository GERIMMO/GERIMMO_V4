-- Audit #264, création du bail.
--
-- ED-01 : l'assurance du locataire classée pendant la préparation du bail
-- (pieces_attendues_bail, nature « assurance_locataire ») n'était rattachée
-- qu'au bail. Or l'espace locataire (mes_pieces_locataire), les alertes
-- d'échéance (generer_alertes_assurance) et la fiche de la personne ne lisent
-- que les liens « personne » : après l'activation, le locataire se voyait
-- réclamer une attestation déjà fournie et aucune alerte ne suivait son
-- échéance. À la conclusion du contrat (brouillon → actif), la pièce classée
-- est aussi rattachée aux locataires engagés : le locataire principal et les
-- colocataires présents, jamais les garants. La couverture reste à vérifier :
-- verifie_le n'est pas renseigné.
create or replace function public.rattacher_assurance_locataire_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.etat = 'brouillon' and new.etat = 'actif' then
    insert into public.document_liens(organization_id, document_id, entite, entite_id)
    select new.organization_id, p.document_id, 'personne'::public.entite_liee, l.person_id
    from public.pieces_attendues_bail p
    join public.documents d on d.id = p.document_id and d.organization_id = p.organization_id and d.purged_at is null
    cross join lateral (
      select new.locataire_principal as person_id
      union
      select bp.person_id from public.bail_personnes bp
      where bp.bail_id = new.id and bp.role = 'colocataire' and bp.date_depart is null
    ) l
    where p.organization_id = new.organization_id and p.bail_id = new.id
      and p.nature = 'assurance_locataire' and l.person_id is not null
    on conflict on constraint document_liens_unique do nothing;
  end if;
  return null;
end;
$$;
-- Le déclencheur fonctionne sans accorder son exécution directe aux clients.
revoke all on function public.rattacher_assurance_locataire_activation() from public, anon, authenticated;
drop trigger if exists baux_assurance_locataire_activation on public.baux;
create trigger baux_assurance_locataire_activation
  after update of etat on public.baux
  for each row execute function public.rattacher_assurance_locataire_activation();

-- Reprise : baux déjà activés depuis la migration 20261026232941 avec une
-- assurance du locataire classée. Ajoute les seuls liens manquants ; aucune
-- donnée existante n'est modifiée.
insert into public.document_liens(organization_id, document_id, entite, entite_id)
select b.organization_id, p.document_id, 'personne'::public.entite_liee, l.person_id
from public.baux b
join public.pieces_attendues_bail p on p.bail_id = b.id and p.organization_id = b.organization_id
  and p.nature = 'assurance_locataire'
join public.documents d on d.id = p.document_id and d.organization_id = p.organization_id and d.purged_at is null
cross join lateral (
  select b.locataire_principal as person_id
  union
  select bp.person_id from public.bail_personnes bp
  where bp.bail_id = b.id and bp.role = 'colocataire' and bp.date_depart is null
) l
where b.etat in ('actif', 'preavis') and l.person_id is not null
on conflict on constraint document_liens_unique do nothing;

-- CB-15 : l'étape du type de bail s'appelle « Le bail » depuis la refonte du
-- parcours (le texte citait encore « Dates et montants »). Dernière définition :
-- 20261009150000_personnes_bail_simplifie.sql ; seul ce message change.
create or replace function public.choisir_personne_bail(
  p_bail uuid, p_person uuid, p_role text, p_garant_de uuid default null,
  p_principal_attendu uuid default null
) returns void language plpgsql security invoker set search_path = '' as $$
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
      raise exception 'Pour plusieurs locataires sur ce contrat, choisissez la colocation à l’étape Le bail.';
    end if;
    if p_role='garant' and (p_garant_de is null or not (p_garant_de=b.locataire_principal or exists (
      select 1 from public.bail_personnes where bail_id=p_bail and person_id=p_garant_de and role='colocataire' and date_depart is null
    ))) then raise exception 'Choisissez le locataire couvert par ce garant.'; end if;
    insert into public.bail_personnes(organization_id,bail_id,person_id,role,garant_de)
      values(b.organization_id,p_bail,p_person,p_role,case when p_role='garant' then p_garant_de end);
  end if;
end;
$$;
revoke all on function public.choisir_personne_bail(uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.choisir_personne_bail(uuid,uuid,text,uuid,uuid) to authenticated;

select public.fermer_fonctions_a_anon();
