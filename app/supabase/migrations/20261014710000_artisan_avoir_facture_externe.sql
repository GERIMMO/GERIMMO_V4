-- Lot « avoir-facture-externe », décision D24-C du dirigeant (14/10/2026), fiches ARC-07 et ARC-04.
-- Le module « clients externes » de l'artisan reste DÉSACTIVÉ en production : rien n'est activé ici.
-- La fiche recommande une validation comptable AVANT d'activer le module (mentions d'un avoir, numérotation).
--
-- LE DÉFAUT (ARC-07). Une facture externe déposée avec une erreur (numéro, montant, pièce) était définitive : aucune
-- action ne permettait de la corriger ni de l'annuler, et le chantier terminé restait figé. D24-B (vague 3, migrations
-- 20261014310000 et 20261014311000) a posé la relecture avant dépôt et l'unicité du numéro ; D24-C ajoute la voie de
-- correction tracée :
--
--   1. artisan_externe_ecrire, action « annuler_facture » : MOTIVÉE (10 caractères au moins), elle émet un AVOIR
--      NUMÉROTÉ du même montant TTC que la facture, puis la facture est marquée annulée (annulee_le). Mêmes gardes que
--      les autres écritures de l'outil : module activé, artisan ni refusé ni sur liste noire (D25-B, le bloc ARC-08
--      passe AVANT la relecture de la clé), verrou de l'artisan, révision du chantier, rejeu sûr par clé d'envoi
--      (artisan_evenements_prives). Une facture qui porte un règlement déclaré actif ne s'annule pas : il faut d'abord
--      annuler ces déclarations (sinon une somme déclarée reçue resterait accrochée à une facture annulée) ;
--   2. la table artisan_avoirs_externes : numérotation PROPRE aux avoirs de chaque artisan (rang 1, 2, 3…, affiché
--      « AV-0001 »), continue, sans trou, unique, jamais réutilisée : un déclencheur refuse un rang qui ne suit pas le
--      dernier, un montant différent de la facture, et toute modification ou suppression d'un avoir émis ;
--   3. une nouvelle facture est autorisée sur le chantier : l'unicité « une facture par chantier » devient « une facture
--      EN VIGUEUR par chantier » (index unique partiel). Le numéro de la facture annulée reste RÉSERVÉ : la ligne est
--      conservée, donc le contrôle ARC-04 et les index uniques sur le numéro le refusent toujours ;
--   4. artisan_reglement_ecrire : un règlement ne se déclare plus sur une facture annulée ;
--   5. mon_activite_artisan_privee (écran et export) : la facture annulée garde sa place, avec annulee_le, et la clé
--      « avoirs » liste les avoirs (numéro, facture d'origine, montant, motif, jour d'émission à Paris).
--
-- AUCUNE SUPPRESSION ni réécriture de donnée : aucune facture n'est modifiée par la migration ; la colonne ajoutée est
-- vide. Si deux factures existaient déjà sur un même chantier (impossible jusqu'ici), l'index partiel les accepterait
-- toutes deux « en vigueur » : la migration s'arrête alors avant tout changement, plutôt que de choisir.
-- Jour métier = public.aujourdhui_paris() (migration 20261014500000), jamais current_date.
--
-- Les trois fonctions existantes sont modifiées EN RELISANT leur définition en vigueur (pg_get_functiondef), avec des
-- ancres d'UNE ligne dont le nombre d'occurrences est contrôlé (exactement une), comme 20261013120000, 20261014310000 et
-- 20261014311000 : une fonction réécrite à la main écraserait leurs correctifs. Chaque bloc cherche d'abord la marque
-- de son correctif et ne fait alors rien : la migration se rejoue sans effet. Le DDL des tables ne s'exécute que s'il
-- manque quelque chose (au rejeu, aucun verrou de table n'est pris).
-- Retour arrière : supabase/retours-arriere/20261014710000_artisan_avoir_facture_externe.retour.sql

-- 0/7. Garde : jamais deux factures sur un même chantier avant de relâcher l'unicité (comptées, jamais corrigées).
do $correctif$
declare v_chantiers bigint;
begin
  if to_regclass('public.artisan_factures_externes_chantier_en_vigueur_key') is not null then return; end if;
  select count(*) into v_chantiers from (
    select 1 from public.artisan_factures_externes group by chantier_id having count(*) > 1
  ) q;
  if v_chantiers > 0 then
    raise exception 'Chantiers externes portant déjà plusieurs factures : %. Aucune donnée n''a été modifiée ; la décision revient au dirigeant (fiche ARC-07).', v_chantiers;
  end if;
end $correctif$;

-- 1/7. La facture garde la trace de son annulation ; une seule facture EN VIGUEUR par chantier.
do $correctif$
begin
  if not exists (select 1 from pg_attribute
                 where attrelid = 'public.artisan_factures_externes'::regclass and attname = 'annulee_le' and not attisdropped) then
    alter table public.artisan_factures_externes add column annulee_le timestamptz;
    comment on column public.artisan_factures_externes.annulee_le is
      'Décision D24-C (ARC-07) : instant de l''annulation de la facture par un avoir (artisan_avoirs_externes). NULL = facture en vigueur. La ligne n''est jamais supprimée : son numéro reste réservé.';
  end if;
  if to_regclass('public.artisan_factures_externes_chantier_en_vigueur_key') is null then
    create unique index artisan_factures_externes_chantier_en_vigueur_key
      on public.artisan_factures_externes (chantier_id) where annulee_le is null;
  end if;
  if exists (select 1 from pg_constraint
             where conrelid = 'public.artisan_factures_externes'::regclass and conname = 'artisan_factures_externes_chantier_id_key') then
    alter table public.artisan_factures_externes drop constraint artisan_factures_externes_chantier_id_key;
  end if;
end $correctif$;

-- 2/7. Les avoirs. Lecture seule pour l'artisan réel (RLS, comme les autres tables de l'outil) ; écriture par la seule
-- fonction artisan_externe_ecrire (security definer). Chaque clé étrangère a son index couvrant (non partiel).
do $correctif$
begin
  if to_regclass('public.artisan_avoirs_externes') is not null then return; end if;
  create table public.artisan_avoirs_externes (
    id uuid primary key default gen_random_uuid(),
    artisan_id uuid not null references public.artisans(id),
    facture_id uuid not null,
    -- Le rang dans la suite des avoirs de CET artisan : 1, 2, 3… sans trou (déclencheur ci-dessous).
    rang integer not null check (rang >= 1),
    -- Le numéro affiché, déduit du rang : il ne peut pas diverger de la suite.
    numero text generated always as ('AV-' || lpad(rang::text, greatest(4, length(rang::text)), '0')) stored,
    -- L'avoir annule toute la facture : son montant est celui de la facture (déclencheur ci-dessous).
    montant_ttc_cents bigint not null check (montant_ttc_cents between 1 and 100000000000),
    motif text not null check (length(btrim(motif)) between 10 and 4000),
    -- Le jour d'émission, à Paris (public.aujourdhui_paris()).
    jour date not null,
    auteur uuid not null references public.accounts(id),
    created_at timestamptz not null default clock_timestamp(),
    unique (artisan_id, rang),
    unique (artisan_id, numero),
    -- Une facture n'a qu'un avoir. (facture_id, artisan_id) équivaut à facture_id seul (l'identifiant de la facture est
    -- unique) et sert d'index couvrant à la clé étrangère composée.
    unique (facture_id, artisan_id),
    foreign key (facture_id, artisan_id) references public.artisan_factures_externes(id, artisan_id)
  );
  create index artisan_avoirs_externes_auteur_idx on public.artisan_avoirs_externes (auteur);
  comment on table public.artisan_avoirs_externes is
    'Décision D24-C (ARC-07) : avoirs émis par l''annulation motivée d''une facture externe. Numérotation propre à chaque artisan, continue, sans trou, jamais réutilisée ; un avoir émis ne se modifie ni ne se supprime.';
  alter table public.artisan_avoirs_externes enable row level security;
  revoke all on public.artisan_avoirs_externes from public, anon, authenticated;
  grant select on public.artisan_avoirs_externes to authenticated;
  create policy lecture_artisan_reel on public.artisan_avoirs_externes for select to authenticated
    using (artisan_id = (select public.artisan_identite_reelle()));
end $correctif$;

-- 3/7. La garde de la suite : continuité, montant, immuabilité. Fonction de déclencheur ordinaire (sans privilège propre).
create or replace function public.artisan_avoirs_externes_garde()
returns trigger
language plpgsql
set search_path = ''
as $fonction$
declare v_suivant integer; v_facture bigint;
begin
  if tg_op = 'INSERT' then
    select coalesce(max(x.rang), 0) + 1 into v_suivant from public.artisan_avoirs_externes x where x.artisan_id = new.artisan_id;
    if new.rang is distinct from v_suivant then
      raise exception 'Numérotation des avoirs sans trou : le numéro suivant de cet artisan est le rang %, pas %.', v_suivant, new.rang;
    end if;
    select f.montant_ttc_cents into v_facture from public.artisan_factures_externes f where f.id = new.facture_id and f.artisan_id = new.artisan_id;
    if new.montant_ttc_cents is distinct from v_facture then
      raise exception 'Un avoir annule toute la facture : son montant est celui de la facture.';
    end if;
    return new;
  end if;
  raise exception 'Un avoir émis ne se modifie ni ne se supprime : son numéro n''est jamais réutilisé.';
end $fonction$;
revoke all on function public.artisan_avoirs_externes_garde() from public, anon, authenticated;

do $correctif$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.artisan_avoirs_externes'::regclass and tgname = 'artisan_avoirs_externes_suite' and not tgisinternal) then
    create trigger artisan_avoirs_externes_suite before insert or update or delete on public.artisan_avoirs_externes
      for each row execute function public.artisan_avoirs_externes_garde();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.artisan_avoirs_externes'::regclass and tgname = 'artisan_avoirs_externes_sans_vidage' and not tgisinternal) then
    create trigger artisan_avoirs_externes_sans_vidage before truncate on public.artisan_avoirs_externes
      for each statement execute function public.artisan_avoirs_externes_garde();
  end if;
end $correctif$;

-- 4/7. artisan_externe_ecrire : l'action « annuler_facture ». Deux ancres d'une ligne, chacune présente une fois :
--   (a) la garde du chantier terminé laisse passer l'annulation de facture comme le dépôt ;
--   (b) la branche nouvelle s'insère juste avant celle du dépôt (« elsif p_action='facture' then »).
-- Variables propres à la branche dans un bloc imbriqué : la ligne de déclarations n'est pas touchée.
do $correctif$
declare v_def text; v_garde text; v_branche text;
begin
  select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) into v_def;
  if position('-- >> Audit du 14/10 (ARC-07, D24-C)' in v_def) > 0 then return; end if;

  v_garde := $ancre$not(p_action='facture' and h.statut='termine')$ancre$;
  if (length(v_def) - length(replace(v_def, v_garde, ''))) <> length(v_garde) then
    raise exception 'Correctif ARC-07 (écriture) : définition inattendue (la garde du chantier terminé est absente ou répétée)';
  end if;
  v_branche := $ancre$elsif p_action='facture' then$ancre$;
  if (length(v_def) - length(replace(v_def, v_branche, ''))) <> length(v_branche) then
    raise exception 'Correctif ARC-07 (écriture) : définition inattendue (la branche du dépôt de facture est absente ou répétée)';
  end if;

  v_def := replace(v_def, v_garde, $nouveau$not(p_action in ('facture','annuler_facture') and h.statut='termine')$nouveau$);
  v_def := replace(v_def, v_branche, $nouveau$-- >> Audit du 14/10 (ARC-07, D24-C) : annuler une facture déposée, avec un motif, par un avoir numéroté du même
  -- montant. La facture reste (son numéro reste réservé) ; une nouvelle facture peut ensuite être déposée sur le chantier.
  elsif p_action='annuler_facture' then
   declare
    v_facture public.artisan_factures_externes;
    v_rang integer;
   begin
    if coalesce(p_donnees->>'facture_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
     raise exception 'Cette facture n’est plus celle du chantier. Rechargez la page avant de recommencer.';
    end if;
    select * into v_facture from public.artisan_factures_externes fe where fe.id=(p_donnees->>'facture_id')::uuid and fe.chantier_id=h.id and fe.artisan_id=a for update;
    if not found then
     raise exception 'Cette facture n’est plus celle du chantier. Rechargez la page avant de recommencer.';
    end if;
    if v_facture.annulee_le is not null then
     raise exception 'Cette facture est déjà annulée par un avoir. Rechargez la page pour voir l’avoir et, si besoin, déposer la facture qui la remplace.';
    end if;
    if length(btrim(coalesce(p_donnees->>'motif',''))) not between 10 and 4000 then
     raise exception 'Expliquez pourquoi la facture est annulée (10 caractères au moins) : ce motif figure sur l’avoir et dans votre registre.';
    end if;
    if exists(select 1 from public.artisan_reglements rg where rg.artisan_id=a and rg.facture_externe_id=v_facture.id and rg.annule_le is null) then
     raise exception 'Des règlements sont déclarés sur cette facture : annulez d’abord ces déclarations depuis le suivi de la facture, puis annulez la facture.';
    end if;
    -- Le rang suivant de CET artisan : sous le verrou de l'artisan (pg_advisory_xact_lock plus haut), pas de course.
    select coalesce(max(av.rang),0)+1 into v_rang from public.artisan_avoirs_externes av where av.artisan_id=a;
    insert into public.artisan_avoirs_externes(artisan_id,facture_id,rang,montant_ttc_cents,motif,jour,auteur)
     values(a,v_facture.id,v_rang,v_facture.montant_ttc_cents,btrim(p_donnees->>'motif'),public.aujourdhui_paris(),(select auth.uid()));
    update public.artisan_factures_externes set annulee_le=clock_timestamp() where id=v_facture.id;
   end;
  -- << Audit du 14/10 (ARC-07, D24-C)
  $nouveau$ || v_branche);
  execute v_def;
end $correctif$;

-- 5/7. artisan_reglement_ecrire : aucun règlement déclaré sur une facture annulée. Une ancre d'une ligne, présente une fois.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)'::regprocedure) into v_def;
  if position('-- >> Audit du 14/10 (ARC-07, D24-C)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$if p_action='reglement' then$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ARC-07 (règlement) : définition inattendue (la branche du règlement est absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $nouveau$
  -- >> Audit du 14/10 (ARC-07, D24-C) : une facture annulée par un avoir ne reçoit plus de règlement déclaré.
  if p_origine='externe' and exists(select 1 from public.artisan_factures_externes fe where fe.id=p_facture and fe.artisan_id=a and fe.annulee_le is not null) then
   raise exception 'Cette facture est annulée par un avoir : aucun règlement ne peut plus y être déclaré. Déclarez-le sur la facture qui la remplace.';
  end if;
  -- << Audit du 14/10 (ARC-07, D24-C)$nouveau$);
  execute v_def;
end $correctif$;

-- 6/7. mon_activite_artisan_privee (écran et export) : la facture dit si elle est annulée ; la clé « avoirs » liste les
-- avoirs. Deux ancres d'une ligne, chacune présente une fois ; les ajouts eux-mêmes servent de marque.
do $correctif$
declare v_def text; v_facture text; v_evenements text;
begin
  select pg_get_functiondef('public.mon_activite_artisan_privee()'::regprocedure) into v_def;
  if position($marque$'avoirs',coalesce($marque$ in v_def) > 0 then return; end if;

  v_facture := $ancre$'origine','externe','chantier_id',f.chantier_id,$ancre$;
  if (length(v_def) - length(replace(v_def, v_facture, ''))) <> length(v_facture) then
    raise exception 'Correctif ARC-07 (lecture) : définition inattendue (la facture externe est absente ou répétée)';
  end if;
  v_evenements := $ancre$'evenements',coalesce($ancre$;
  if (length(v_def) - length(replace(v_def, v_evenements, ''))) <> length(v_evenements) then
    raise exception 'Correctif ARC-07 (lecture) : définition inattendue (la clé evenements est absente ou répétée)';
  end if;

  v_def := replace(v_def, v_facture, v_facture || $nouveau$'annulee_le',f.annulee_le,$nouveau$);
  v_def := replace(v_def, v_evenements, $nouveau$'avoirs',coalesce((select jsonb_agg(to_jsonb(av)||jsonb_build_object('facture_numero',fe.numero,'chantier_id',fe.chantier_id) order by av.rang) from public.artisan_avoirs_externes av join public.artisan_factures_externes fe on fe.id=av.facture_id where av.artisan_id=a),'[]'),
 $nouveau$ || v_evenements);
  execute v_def;
end $correctif$;

-- 7/7. Droits explicites (une redéfinition les conserve ; on les repose comme les migrations voisines).
revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public, anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;
revoke all on function public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid) from public, anon;
grant execute on function public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid) to authenticated;
revoke all on function public.mon_activite_artisan_privee() from public, anon;
grant execute on function public.mon_activite_artisan_privee() to authenticated;

select public.fermer_fonctions_a_anon();
