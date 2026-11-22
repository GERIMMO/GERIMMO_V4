-- ARTISAN : SES LIGNES DE DEVIS RÉUTILISABLES (audit palier 1 du 22/11/2026, P2-04, troisième partie).
--
-- L'ÉCART. Un artisan ressaisit à chaque devis les mêmes prestations (« Déplacement », « Remplacement d'un mitigeur »…),
-- avec le même prix et le même taux de TVA. Sans IA, rien ne l'aidait.
--
-- CE QUE FAIT CETTE MIGRATION.
--   `artisan_lignes_devis` : les lignes qu'un artisan choisit de garder (libellé, prix unitaire hors taxes et taux de
--   TVA facultatifs). Lui seul les écrit et les lit, par trois fonctions : `mes_lignes_devis`,
--   `garder_ma_ligne_devis` (une ligne du même libellé est mise à jour, pas doublée ; 200 lignes au plus) et
--   `retirer_ma_ligne_devis`. Personne d'autre : ni agence, ni propriétaire, ni super admin.
--   Ces lignes ne sont qu'une aide à la saisie : reprendre une ligne la recopie dans le devis en cours, que l'artisan
--   relit et modifie librement. Un devis déjà déposé n'est jamais touché par la modification d'une ligne gardée.
--
-- La table est fermée (cloisonnement activé, aucun droit direct). Aucune donnée existante n'est modifiée.
--
-- Retour arrière : supabase/retours-arriere/20261122235900_artisan_lignes_devis.retour.sql.

create table if not exists public.artisan_lignes_devis (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  libelle text not null,
  prix_unitaire_ht_cents bigint,
  tva_bps integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artisan_lignes_devis_libelle check (char_length(libelle) between 1 and 240 and libelle = btrim(libelle, E' \t\n\r')),
  constraint artisan_lignes_devis_prix check (prix_unitaire_ht_cents is null or prix_unitaire_ht_cents between 0 and 1000000000),
  constraint artisan_lignes_devis_tva check (tva_bps is null or tva_bps in (0, 210, 550, 1000, 2000))
);
create index if not exists artisan_lignes_devis_artisan_idx on public.artisan_lignes_devis (artisan_id, created_at);
create unique index if not exists artisan_lignes_devis_libelle_unique on public.artisan_lignes_devis (artisan_id, lower(libelle));
alter table public.artisan_lignes_devis enable row level security;
revoke all on public.artisan_lignes_devis from anon, authenticated;
grant all on public.artisan_lignes_devis to service_role;
drop trigger if exists diagnostic_artisan_lecture on public.artisan_lignes_devis;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.artisan_lignes_devis
  for each row execute function public.refuser_mutation_diagnostic_artisan();
comment on table public.artisan_lignes_devis is
  'P2-04 (22/11/2026) : lignes de devis que l''artisan garde pour les reprendre (libellé, prix HT et TVA facultatifs). Lues et écrites par lui seul, par fonctions.';

create or replace function public.mes_lignes_devis()
returns table (id uuid, libelle text, prix_unitaire_ht_cents bigint, tva_bps integer)
language sql stable security definer set search_path = '' as $$
  select l.id, l.libelle, l.prix_unitaire_ht_cents, l.tva_bps
  from public.artisan_lignes_devis l
  where public.mon_artisan_id() is not null
    and l.artisan_id = public.mon_artisan_id()
  order by lower(l.libelle), l.id;
$$;

create or replace function public.garder_ma_ligne_devis(p_libelle text, p_prix_cents bigint, p_tva_bps integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
  v_libelle text := btrim(coalesce(p_libelle, ''), E' \t\n\r');
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  v_artisan := public.exiger_artisan_reel();
  if v_libelle = '' then
    raise exception 'Écrivez la prestation ou la fourniture avant de la garder';
  end if;
  if char_length(v_libelle) > 240 then
    raise exception 'Raccourcissez le libellé (240 caractères au plus)';
  end if;
  if p_prix_cents is not null and (p_prix_cents < 0 or p_prix_cents > 1000000000) then
    raise exception 'Le prix unitaire de cette ligne n''est pas valide (10 000 000 € au plus)';
  end if;
  if p_tva_bps is not null and p_tva_bps not in (0, 210, 550, 1000, 2000) then
    raise exception 'Le taux de TVA de cette ligne n''est pas valide';
  end if;

  -- Deux enregistrements simultanés du même artisan ne se croisent pas.
  perform pg_advisory_xact_lock(hashtextextended('artisan_ligne_devis:' || v_artisan::text, 0));
  select l.id into v_id from public.artisan_lignes_devis l
   where l.artisan_id = v_artisan and lower(l.libelle) = lower(v_libelle);
  if found then
    update public.artisan_lignes_devis
       set libelle = v_libelle, prix_unitaire_ht_cents = p_prix_cents, tva_bps = p_tva_bps, updated_at = now()
     where id = v_id;
    return v_id;
  end if;
  if (select count(*) from public.artisan_lignes_devis l where l.artisan_id = v_artisan) >= 200 then
    raise exception 'Vous gardez déjà 200 lignes : retirez-en une avant d''en garder une autre';
  end if;
  insert into public.artisan_lignes_devis (artisan_id, libelle, prix_unitaire_ht_cents, tva_bps)
  values (v_artisan, v_libelle, p_prix_cents, p_tva_bps)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.retirer_ma_ligne_devis(p_ligne uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  v_artisan := public.exiger_artisan_reel();
  delete from public.artisan_lignes_devis where id = p_ligne and artisan_id = v_artisan;
  if not found then
    raise exception 'Ligne introuvable';
  end if;
end;
$$;

do $droits$
declare
  f text;
begin
  foreach f in array array[
    'public.mes_lignes_devis()',
    'public.garder_ma_ligne_devis(text, bigint, integer)',
    'public.retirer_ma_ligne_devis(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $droits$;

comment on function public.garder_ma_ligne_devis(text, bigint, integer) is
  'P2-04 (22/11/2026) : l''artisan garde une ligne de devis (libellé, prix HT et TVA facultatifs) pour la reprendre. Même libellé = mise à jour. 200 lignes au plus.';

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
