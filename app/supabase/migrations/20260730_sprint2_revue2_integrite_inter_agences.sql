-- Revue Sprint 2 (itération 2) — intégrité inter-agences et immuabilité.
-- Appliquée le 2026-07-30 sur « Gerimmo V4 » via MCP. Copie de référence.
-- Constat critique : les politiques with check ne contrôlent que
-- organization_id ; un enfant (détention, diagnostic…) pouvait référencer un
-- parent (lot, bien, personne, document) d'une AUTRE agence — la FK simple
-- ignore la RLS. Correctif : FK composites (id, organization_id).

-- 1. Unicité composite sur les parents
alter table public.biens add constraint biens_id_org_unique unique (id, organization_id);
alter table public.lots add constraint lots_id_org_unique unique (id, organization_id);
alter table public.persons add constraint persons_id_org_unique unique (id, organization_id);
alter table public.documents add constraint documents_id_org_unique unique (id, organization_id);

-- 2. Cohérence parent/enfant garantie en base (MATCH SIMPLE : une colonne
--    nulle désactive le contrôle — voulu pour bien_id/lot_id exclusifs)
alter table public.lots add constraint lots_bien_meme_org_fk
  foreign key (bien_id, organization_id) references public.biens (id, organization_id);
alter table public.detentions add constraint detentions_lot_meme_org_fk
  foreign key (lot_id, organization_id) references public.lots (id, organization_id);
alter table public.detentions add constraint detentions_person_meme_org_fk
  foreign key (person_id, organization_id) references public.persons (id, organization_id);
alter table public.diagnostics add constraint diagnostics_bien_meme_org_fk
  foreign key (bien_id, organization_id) references public.biens (id, organization_id);
alter table public.diagnostics add constraint diagnostics_lot_meme_org_fk
  foreign key (lot_id, organization_id) references public.lots (id, organization_id);
alter table public.diagnostics add constraint diagnostics_document_meme_org_fk
  foreign key (document_id, organization_id) references public.documents (id, organization_id);
alter table public.cles_repartition add constraint cles_bien_meme_org_fk
  foreign key (bien_id, organization_id) references public.biens (id, organization_id);

-- 3. lot_equipements n'a pas de colonne org : cohérence par trigger.
--    Sous RLS invoker, un équipement étranger est invisible (org lue = null)
--    → « is distinct from » le rejette aussi.
create function public.verifier_equipement_meme_agence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select organization_id from public.lots where id = new.lot_id)
     is distinct from
     (select organization_id from public.equipements_catalogue where id = new.equipement_id) then
    raise exception 'Équipement et lot doivent appartenir à la même agence';
  end if;
  return new;
end;
$$;
create trigger lot_equipements_meme_agence before insert on public.lot_equipements
  for each row execute function public.verifier_equipement_meme_agence();

-- 4. Immuabilité des clés (RM-0.4.2/4), suite : le privilège colonne seul
--    permettait de REMETTRE invalidated_at à null (réactivation d'une clé
--    historique). Seule transition permise : null → non-null.
create function public.verifier_cle_invalidation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.invalidated_at is not null then
    raise exception 'Une clé invalidée ne se modifie plus (RM-0.4.4)';
  end if;
  if new.invalidated_at is null then
    raise exception 'Seule l''invalidation d''une clé est permise — on valide une nouvelle clé, on n''édite jamais l''ancienne';
  end if;
  return new;
end;
$$;
create trigger cles_repartition_invalidation before update on public.cles_repartition
  for each row execute function public.verifier_cle_invalidation();

-- 5. valider_cle_repartition : les lignes doivent couvrir EXACTEMENT les lots
--    actifs du bien (avant : seul le nombre était vérifié — une clé pouvait
--    citer un lot archivé, d'un autre bien, voire d'une autre agence), et
--    chaque pourcentage est arrondi au centime AVANT le contrôle du total
--    (3 × 33,333333 passait le contrôle mais stockait 99,99).
create or replace function public.valider_cle_repartition(
  p_bien uuid, p_mode public.cle_mode, p_lignes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien record;
  v_total numeric := 0;
  v_ligne jsonb;
  v_cle uuid;
  v_nb_lots int;
begin
  select * into v_bien from public.biens where id = p_bien;
  if not found then raise exception 'Bien introuvable'; end if;

  select count(*) into v_nb_lots from public.lots
  where bien_id = p_bien and etat <> 'archive';
  if (select count(distinct (l->>'lot_id')::uuid) from jsonb_array_elements(p_lignes) l)
     <> v_nb_lots
     or exists (
       select 1 from jsonb_array_elements(p_lignes) l
       where (l->>'lot_id')::uuid not in
         (select id from public.lots where bien_id = p_bien and etat <> 'archive')
     ) then
    raise exception 'La clé doit couvrir exactement les % lots actifs du bien', v_nb_lots;
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_total := v_total + round((v_ligne->>'pourcentage')::numeric, 2);
  end loop;
  if round(v_total, 2) <> 100.00 then
    raise exception 'La somme des pourcentages fait %, il faut exactement 100 (RM-0.4.1)', v_total;
  end if;

  update public.cles_repartition set invalidated_at = now()
  where bien_id = p_bien and invalidated_at is null;

  insert into public.cles_repartition (bien_id, organization_id, mode, created_by)
  values (p_bien, v_bien.organization_id, p_mode, (select auth.uid()))
  returning id into v_cle;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    insert into public.cle_repartition_lignes (cle_id, lot_id, pourcentage)
    values (v_cle, (v_ligne->>'lot_id')::uuid, round((v_ligne->>'pourcentage')::numeric, 2));
  end loop;

  return v_cle;
end;
$$;

-- 6. decouper_bien : bien sans lot actif = erreur explicite (avant : les
--    nouveaux lots naissaient silencieusement sans héritage de propriétaires).
create or replace function public.decouper_bien(p_bien uuid, p_lots jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien record;
  v_origine record;
  v_lot jsonb;
  v_nouveau uuid;
begin
  select * into v_bien from public.biens where id = p_bien;
  if not found then raise exception 'Bien introuvable'; end if;

  select * into v_origine from public.lots
  where bien_id = p_bien and etat <> 'archive'
  order by created_at limit 1;
  if not found then
    raise exception 'Aucun lot actif : réactiver un lot avant de découper';
  end if;
  if v_origine.etat in ('loue', 'preavis') then
    raise exception 'Lot loué : résilier, archiver puis recréer (RM-0.3.8)';
  end if;

  if jsonb_typeof(p_lots) <> 'array' or jsonb_array_length(p_lots) = 0 then
    raise exception 'Aucun lot à créer';
  end if;

  for v_lot in select * from jsonb_array_elements(p_lots) loop
    insert into public.lots (bien_id, organization_id, nom, surface_m2, pieces)
    values (p_bien, v_bien.organization_id,
            v_lot->>'nom',
            nullif(v_lot->>'surface_m2', '')::numeric,
            nullif(v_lot->>'pieces', '')::integer)
    returning id into v_nouveau;
    insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut)
    select v_nouveau, organization_id, person_id, quote_part, current_date
    from public.detentions
    where lot_id = v_origine.id and date_fin is null;
    return next v_nouveau;
  end loop;

  update public.cles_repartition set invalidated_at = now()
  where bien_id = p_bien and invalidated_at is null;
  update public.lots set etat = 'brouillon'
  where bien_id = p_bien and etat = 'disponible';
end;
$$;

-- 7. Quote-parts HISTORIQUES : le contrôle ne portait que sur les détentions
--    actives — une détention antidatée pouvait faire dépasser 100 % sur une
--    période passée (les rapports de mars doivent rester justes, RM-0.2.4).
--    Contrôle à chaque borne de période chevauchante.
create or replace function public.verifier_detention_totale()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_date date;
  v_total numeric;
begin
  for v_date in
    select distinct d.date_debut from public.detentions d
    where d.lot_id = new.lot_id and d.id <> new.id
      and d.date_debut <= coalesce(new.date_fin, 'infinity'::date)
      and coalesce(d.date_fin, 'infinity'::date) >= new.date_debut
    union select new.date_debut
  loop
    select coalesce(sum(d.quote_part), 0) into v_total
    from public.detentions d
    where d.lot_id = new.lot_id and d.id <> new.id
      and d.date_debut <= v_date
      and coalesce(d.date_fin, 'infinity'::date) >= v_date;
    if new.date_debut <= v_date
       and coalesce(new.date_fin, 'infinity'::date) >= v_date then
      v_total := v_total + new.quote_part;
    end if;
    if v_total > 100 then
      raise exception 'La somme des quote-parts dépasserait 100 %% au % (% %%)',
        to_char(v_date, 'DD/MM/YYYY'), round(v_total, 2);
    end if;
  end loop;
  return new;
end;
$$;
