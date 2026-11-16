-- Le numéro choisi par l'artisan appartient à sa série comptable. Pour une
-- facture créée ici, il doit être libre sur ses missions ET ses chantiers privés.
-- Les renvois de pièces déjà établies conservent leurs règles antérieures.
lock table public.intervention_factures, public.artisan_factures_externes in share row exclusive mode;

create table public.artisan_numeros_factures (
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  numero text not null,
  emise_dans_gerimmo boolean not null,
  primary key (artisan_id,numero)
);
alter table public.artisan_numeros_factures enable row level security;
revoke all on public.artisan_numeros_factures from public, anon, authenticated;

insert into public.artisan_numeros_factures (artisan_id,numero,emise_dans_gerimmo)
select artisan_id, lower(btrim(numero)), false from public.intervention_factures
union
select artisan_id, lower(btrim(numero)), false from public.artisan_factures_externes;

create function public.reserver_numero_facture_artisan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare emise boolean := false;
begin
  if tg_table_name = 'intervention_factures' then
    select d.storage_path like new.organization_id::text || '/factures-artisan/' || new.intervention_id::text || '/emises/%'
    into strict emise from public.documents d where d.id = new.document_id and d.organization_id = new.organization_id;
  end if;
  insert into public.artisan_numeros_factures as n (artisan_id,numero,emise_dans_gerimmo)
  values (new.artisan_id,lower(btrim(new.numero)),emise)
  on conflict (artisan_id,numero) do update set emise_dans_gerimmo = false
    where not n.emise_dans_gerimmo and not excluded.emise_dans_gerimmo;
  if not found then
    raise exception 'Ce numéro de facture a déjà été utilisé par votre entreprise. Vérifiez votre série de facturation.';
  end if;
  return new;
end;
$$;
revoke all on function public.reserver_numero_facture_artisan() from public,anon,authenticated;
create trigger verifier_numero_facture_emise before insert on public.intervention_factures
for each row execute function public.reserver_numero_facture_artisan();
create trigger verifier_numero_facture_emise before insert on public.artisan_factures_externes
for each row execute function public.reserver_numero_facture_artisan();

-- Même mission autorisée ; un PDF émis dispose d’un chemin distinct.
create or replace function public.ged_depot_artisan_autorise(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and public.mon_artisan_id() is not null and coalesce((
   (p_path ~ '^artisans/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
     and split_part(p_path,'/',2)=public.mon_artisan_id()::text)
   or (p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
     and split_part(p_path,'/',1) in (select o::text from public.orgs_de_mes_missions() o))
   or ((p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/factures-artisan/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
      or p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/factures-artisan/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/emises/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')
     and exists(select 1 from public.dossiers_de_mes_factures_a_deposer() d where p_path like d||'%'))
   or (p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/devis-gerimmo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
     and exists(select 1 from public.artisan_devis_preparations p
       join public.incident_sollicitations s on s.id=p.sollicitation_id
       where p.artisan_id=public.mon_artisan_id() and s.artisan_id=p.artisan_id
       and p.statut='valide' and p.pdf_path=p_path
       and s.organization_id::text=split_part(p_path,'/',1)
       and s.statut::text in ('envoyee','revision_demandee')))
 ), false);
$$;
revoke all on function public.ged_depot_artisan_autorise(text) from public,anon;
grant execute on function public.ged_depot_artisan_autorise(text) to authenticated,service_role;
