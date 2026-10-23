-- Retour de 20261023161500 (A03, 23/10) : rend aux deux agrégats de charges leur texte de 20260910130000.
-- Effet : un agent restreint lit de nouveau les totaux d'un lot ou d'un bail hors de son portefeuille (la faille A03
-- revient) ; le contrôle d'appartenance à l'agence reste. Aucune donnée, aucun droit modifié ; aucun code à remettre
-- avant (l'application n'appelle pas ces fonctions). Une seule instruction DO atomique : seule en autocommit, ou
-- intégralement annulable dans une transaction externe, qu'elle ne valide jamais.
do $retour_atomique$
begin
  perform set_config('lock_timeout', '10s', true);

  create or replace function public.charges_recuperables_exercice(p_lot uuid, p_exercice integer)
  returns numeric
  language sql stable security definer set search_path = ''
  as $fonction$
  select coalesce(sum(p.montant), 0)
  from public.appel_charges_postes p
  join public.appels_charges a on a.id = p.appel_id
  join public.lots l on l.id = a.lot_id
  where a.lot_id = p_lot and a.exercice = p_exercice
    and a.statut in ('ventile', 'fige') and p.nature = 'recuperable'
    and l.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  $fonction$;
  revoke execute on function public.charges_recuperables_exercice(uuid, integer) from public, anon;

  create or replace function public.provisions_charges_annee(p_bail uuid, p_annee integer)
  returns numeric
  language sql stable security definer set search_path = ''
  as $fonction$
  select coalesce(sum(a.charges), 0)
  from public.appels_loyer a
  join public.baux b on b.id = a.bail_id
  where a.bail_id = p_bail
    and extract(year from a.periode) = p_annee
    and b.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  $fonction$;
  revoke execute on function public.provisions_charges_annee(uuid, integer) from public, anon;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261023161500';
  end if;
end;
$retour_atomique$;
