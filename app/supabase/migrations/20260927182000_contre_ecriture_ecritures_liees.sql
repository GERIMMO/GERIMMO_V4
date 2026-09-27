-- Audit agence du 27/09 — « Annuler l'écriture » ne contredit plus l'écran des
-- loyers.
--
-- CONSTAT (rejoué sous l'identité de l'agent, transaction annulée) : le journal
-- proposait « Annuler l'écriture » sur l'écriture « Encaissement de loyer »
-- née d'un encaissement. La contre-écriture passait, mais l'encaissement, son
-- imputation (« partiel, couvert 300 € ») et le reçu restaient : le journal
-- affichait 0 € encaissé, le bail et « Loyers & charges » 300 €. On pouvait
-- aussi annuler une contre-écriture (« annuler l'annulation »).
--
-- RÈGLE. Une écriture née d'un geste de gestion (encaissement de loyer et ses
-- honoraires automatiques, encaissement du dépôt, décompte de restitution) ne
-- s'annule que par le geste inverse, qui défait l'ensemble dans la même
-- transaction : « Retirer l'encaissement » (`contre_passer_encaissement`, avec
-- son motif), le retrait du dépôt (`contre_passer_depot_encaissement`). Le
-- journal et l'écran des loyers ne peuvent plus se contredire. Une
-- contre-écriture ne se contre-passe pas : on ressaisit l'écriture juste
-- (RM-A6.4 : l'annulation se fait par contre-écriture, pas par empilement).
--
-- DEUX PORTES :
--   1. `contre_ecriture()` refuse ces écritures, avec le geste à faire ;
--   2. un INSERT direct (policy `ecritures_insert`) portant
--      `contre_ecriture_de` est soumis à la même règle. Les fonctions internes
--      (SECURITY DEFINER, sous le propriétaire du journal) gardent leur droit :
--      ce sont elles qui contre-passent proprement.
--
-- Idempotent : create or replace, trigger recréé.

create or replace function public.ecriture_annulable_depuis_le_journal(p_ecriture uuid)
returns text
language sql
stable
set search_path to ''
as $function$
  -- NULL = annulable ; sinon, le motif du refus (lu tel quel à l'écran).
  -- Fonction de l'appelant (pas SECURITY DEFINER) : sous un client, la RLS du
  -- journal s'applique, une écriture d'une autre agence est « introuvable ».
  select case
    when e.id is null then 'Écriture introuvable'
    when e.contre_ecriture_de is not null then
      'Cette ligne est déjà une annulation : elle ne s''annule pas à son tour. Ressaisissez l''écriture juste'
    when e.encaissement_id is not null then
      'Cette écriture vient d''un encaissement de loyer : retirez l''encaissement depuis le bail (« Retirer l''encaissement »), qui annule en une fois l''écriture, les honoraires et l''imputation sur les loyers'
    when e.depot_encaissement_id is not null then
      'Cette écriture vient de l''encaissement du dépôt de garantie : retirez-le depuis le bail, qui annule l''écriture et le dépôt ensemble'
    when e.systeme then
      'Cette écriture a été créée automatiquement par un geste de gestion (restitution, régularisation…) : elle se corrige depuis ce geste, pas depuis le journal'
  end
  from (select 1) x
  left join public.ecritures e on e.id = p_ecriture;
$function$;

revoke execute on function public.ecriture_annulable_depuis_le_journal(uuid) from public, anon;
grant execute on function public.ecriture_annulable_depuis_le_journal(uuid) to authenticated;

create or replace function public.contre_ecriture(p_ecriture uuid, p_motif text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v record; v_new uuid; v_refus text;
begin
  select * into v from public.ecritures where id = p_ecriture;
  if v.id is null then raise exception 'Écriture introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  -- Audit agence 27/09 : une écriture née d'un geste de gestion s'annule par
  -- le geste inverse, jamais seule depuis le journal.
  v_refus := public.ecriture_annulable_depuis_le_journal(p_ecriture);
  if v_refus is not null then raise exception '%', v_refus; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Motif de contre-écriture obligatoire'; end if;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
     date_piece, date_imputation, libelle, systeme, contre_ecriture_de, motif)
  values (v.organization_id, v.bail_id, v.lot_id, v.mandat_id, v.categorie,
     case when v.sens = 'recette' then 'depense' else 'recette' end, v.montant,
     v.date_piece, current_date, 'Contre-écriture : ' || p_motif, v.systeme, v.id,
     btrim(p_motif))
  returning id into v_new;
  return v_new;
end; $function$;

-- Seconde porte : l'INSERT direct d'une contre-écriture par un client.
create or replace function public.contre_ecriture_client_controlee()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare v_refus text;
begin
  if new.contre_ecriture_de is not null
     and current_user in ('authenticated', 'anon') then
    v_refus := public.ecriture_annulable_depuis_le_journal(new.contre_ecriture_de);
    if v_refus is not null then raise exception '%', v_refus; end if;
  end if;
  return new;
end $function$;

revoke execute on function public.contre_ecriture_client_controlee()
  from public, anon, authenticated, service_role;

drop trigger if exists ecritures_contre_ecriture_client on public.ecritures;
create trigger ecritures_contre_ecriture_client
  before insert on public.ecritures
  for each row execute function public.contre_ecriture_client_controlee();

select public.fermer_fonctions_a_anon();
