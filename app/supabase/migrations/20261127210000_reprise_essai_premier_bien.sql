-- Le registre privé conserve le droit déjà utilisé, indépendamment de la
-- rétention du journal de supervision.
create table if not exists support_interne.reprises_premier_bien (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  fin date not null
);
alter table support_interne.reprises_premier_bien enable row level security;
revoke all on support_interne.reprises_premier_bien from public, anon, authenticated, service_role;

-- La date peut changer uniquement avec la preuve privée du geste en cours.
-- Les autres champs réservés restent protégés par la garde d'origine.
do $garde$
declare
  definition text := pg_get_functiondef('public.organizations_champs_reserves_sa()'::regprocedure);
  ancre constant text := '  if (new.status is distinct from old.status';
  exception_reprise constant text := $bloc$  -- reprise_essai_premier_bien
  if new.essai_fin is distinct from old.essai_fin
     and new.status = old.status and new.type = old.type
     and new.grille_tarifaire = old.grille_tarifaire
     and exists (
       select from support_interne.controles_organisation c
       join support_interne.reprises_premier_bien r using (organization_id)
       where c.transaction_id = txid_current() and c.auteur = auth.uid()
         and r.organization_id = old.id and r.fin = new.essai_fin
     ) then
    return new;
  end if;
  -- fin_reprise_essai_premier_bien
$bloc$;
begin
  if strpos(definition, '-- reprise_essai_premier_bien') > 0 then return; end if;
  if strpos(definition, ancre) = 0 then raise exception 'Garde de l’essai inattendue'; end if;
  execute replace(definition, ancre, exception_reprise || ancre);
end;
$garde$;

create or replace function public.reprise_premier_bien_possible(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    join public.memberships m on m.organization_id = o.id
    where o.id = p_org
      and m.account_id = (select auth.uid())
      and m.role = 'proprietaire_direct' and m.status = 'active'
      and o.type = 'proprietaire_direct' and o.status = 'essai'
      and o.essai_fin < public.aujourdhui_paris()
      and public.org_ecriture_ouverte(o.id) is false
      and public.unites_a_couvrir(o.id) = 0
      and not exists (
        select from public.abonnements a where a.organization_id = o.id
          and (a.stripe_subscription_id is not null or a.premiere_facture_payee)
      )
      and not exists (
        select from public.intentions_souscription i where i.organization_id = o.id
          and i.statut = 'en_cours' and i.expire_le > now()
      )
      and not exists (
        select from public.fermetures_comptes f where f.account_id = m.account_id and f.statut = 'programmee'
      )
      and not exists (
        select from support_interne.reprises_premier_bien r where r.organization_id = o.id
      )
  );
$$;
revoke all on function public.reprise_premier_bien_possible(uuid) from public, anon, service_role;
grant execute on function public.reprise_premier_bien_possible(uuid) to authenticated;

create or replace function public.rouvrir_essai_premier_bien(p_org uuid)
returns date
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fin date;
begin
  if not public.reprise_premier_bien_possible(p_org) then return null; end if;

  -- Même verrou que la réservation d'une souscription et les accès offerts.
  perform pg_catalog.pg_advisory_xact_lock(623101, pg_catalog.hashtext(p_org::text));
  perform from public.organizations where id = p_org for update;
  if not public.reprise_premier_bien_possible(p_org) then return null; end if;

  -- Le jour de la demande compte. essai_fin est inclusif, à Paris.
  fin := public.aujourdhui_paris() + 6;
  insert into support_interne.reprises_premier_bien (organization_id, fin) values (p_org, fin);
  insert into support_interne.controles_organisation values (txid_current(), auth.uid(), p_org);
  update public.organizations set essai_fin = fin where id = p_org;
  delete from support_interne.controles_organisation
    where transaction_id = txid_current() and auteur = auth.uid() and organization_id = p_org;

  insert into public.audit_log (account_id, organization_id, action, details)
    values (auth.uid(), p_org, 'reprise_essai_premier_bien',
      jsonb_build_object('jours', 7, 'essai_fin', fin));
  return fin;
end;
$$;
revoke all on function public.rouvrir_essai_premier_bien(uuid) from public, anon, service_role;
grant execute on function public.rouvrir_essai_premier_bien(uuid) to authenticated;

select public.fermer_fonctions_a_anon();
