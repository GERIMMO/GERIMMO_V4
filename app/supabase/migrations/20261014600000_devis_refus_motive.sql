-- Refus motivé d'un devis reçu (décision D18 du 14/10/2026 : option A en deux livraisons, celle-ci est la
-- première, l'option B seule ; fiches ART-13 et PRO2-12 de l'audit du 13 octobre 2026).
--
-- Constat : un devis reçu ne pouvait qu'être retenu (`retenir_devis`). Pour écarter une offre, le gérant ou le
-- propriétaire devait solliciter un autre artisan, ce qui était parfois impossible (deux artisans déjà sollicités,
-- RM-9.1.1) ; l'artisan, lui, ne savait jamais ce qu'il advenait de son devis non retenu.
--
-- Ce que cette livraison ajoute (section A de « Propositions de fonctions majeures », réponses A.15-4 et A.15-5
-- ratifiées : le motif du refus est montré à l'artisan ; un refus libère la place dans le plafond de deux artisans) :
--   · deux valeurs d'énumération : devis `refuse`, sollicitation `refusee` (une valeur ajoutée ne se retire pas ;
--     elles ne sont employées que dans des corps de fonction, jamais dans un index ni une contrainte : dans la
--     transaction du chantier `migrations.yml`, une valeur nouvelle n'est utilisable qu'une fois le lot validé) ;
--   · sur `incident_devis`, la décision du gérant : `decision` (« refus » ; « revision » est réservé à la seconde
--     livraison), `decide_par`, `decide_le`, `decision_motif` (10 à 4 000 caractères), `decision_cle` (clé d'envoi,
--     rejeu sûr : patron de `retours_utilisateurs.cle_envoi`), avec une contrainte de cohérence calquée sur
--     `devis_avenants_decision_coherente` ;
--   · la fonction `refuser_devis(p_org, p_devis, p_motif, p_cle)` : devis `refuse`, sollicitation `refusee`,
--     événement `devis_refuse` au fil de l'incident (motif compris : il est destiné à l'artisan, qui lit ce fil),
--     alerte `devis_a_decider` fermée par le déclencheur existant avec la raison « Devis refusé ». La mise en
--     concurrence reste ouverte ; `solliciter_artisan` ne compte pas `refusee` : la place est libre pour un autre
--     artisan sans rien changer au plafond. Rend vrai si la décision est nouvelle, faux si le même envoi est rejoué.
--   · `retenir_devis` dit « a été refusé » plutôt qu'un état technique ; `mes_sollicitations` rend à l'artisan le
--     motif de la décision prise sur SON devis (type de retour étendu : drop puis create, puis fermeture à anon).
--   · la liste fermée des types d'événement gagne `devis_refuse`.
--
-- Aucune ligne existante n'est modifiée. Les fonctions existantes sont modifiées EN RELISANT leur définition en
-- vigueur (pg_get_functiondef), par une ancre d'UNE SEULE ligne dont le nombre d'occurrences est contrôlé (la mise
-- en forme en production peut différer du banc : une ancre de plusieurs lignes s'y est déjà arrêtée le 15/10).
-- Elle se rejoue sans effet : chaque bloc cherche la marque « Décision D18 du 14/10 (livraison 1) ».
--
-- Retour arrière : app/supabase/retours-arriere/20261014600000_devis_refus_motive.retour.sql

-- 1. Les deux valeurs d'énumération.
alter type public.devis_statut add value if not exists 'refuse';
alter type public.sollicitation_statut add value if not exists 'refusee';

-- 2. La décision du gérant sur le devis.
alter table public.incident_devis
  add column if not exists decision text,
  add column if not exists decide_par uuid references public.accounts(id),
  add column if not exists decide_le timestamptz,
  add column if not exists decision_motif text,
  add column if not exists decision_cle uuid;

-- Index couvrant de la clé étrangère vers accounts (règle du schéma : chaque clé étrangère publique a son index).
create index if not exists incident_devis_decide_par_idx on public.incident_devis (decide_par);

do $correctif$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.incident_devis'::regclass
                   and conname = 'incident_devis_decision_coherente') then
    alter table public.incident_devis add constraint incident_devis_decision_coherente check (
      (decision is null and decide_par is null and decide_le is null and decision_motif is null and decision_cle is null)
      or (decision in ('refus', 'revision') and decide_par is not null and decide_le is not null
          and length(btrim(decision_motif)) between 10 and 4000));
  end if;
end $correctif$;

comment on column public.incident_devis.decision is
  'Décision du gérant ou du propriétaire sur ce devis : refus (D18, livraison 1) ou revision (livraison 2). Nulle tant que le devis attend.';
comment on column public.incident_devis.decision_motif is
  'Motif de la décision, 10 à 4 000 caractères. Il est transmis à l''artisan (réponse A.15-4 de la décision D18).';
comment on column public.incident_devis.decision_cle is
  'Clé d''envoi du formulaire qui a pris la décision : rejouer la même clé ne refait rien (patron retours_utilisateurs.cle_envoi).';

-- 3. Le fil de l'incident sait dire le refus d'un devis.
do $correctif$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.incident_evenements'::regclass
               and conname = 'incident_evenements_type_check'
               and pg_get_constraintdef(oid) like '%devis_refuse%') then
    return;
  end if;
  alter table public.incident_evenements drop constraint if exists incident_evenements_type_check;
  alter table public.incident_evenements add constraint incident_evenements_type_check
    check (type = any (array[
      'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
      'attribution', 'photo', 'consultation', 'sollicitation', 'devis',
      'selection_devis', 'mission_confiee', 'mission_acceptee', 'mission_refusee',
      'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
      'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation',
      'creneaux_refuses', 'facture_deposee', 'facture_validee', 'mission_annulee',
      'devis_refuse'
    ]::text[]));
end $correctif$;

-- 4. Le refus motivé.
create or replace function public.refuser_devis(p_org uuid, p_devis uuid, p_motif text, p_cle uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
-- Décision D18 du 14/10 (livraison 1), fiches ART-13 et PRO2-12 : le gérant ou le propriétaire refuse un devis
-- reçu, avec un motif transmis à l'artisan. Rend vrai si la décision est nouvelle, faux si le même envoi (même
-- clé) est rejoué : rien n'est alors refait, ni événement, ni e-mail côté application.
declare d record; s record; i record; v_motif text;
begin
  -- Périmètre de l'agent restreint, puis rôle : les mêmes gardes que retenir_devis.
  if public.devis_hors_portefeuille(p_org, p_devis) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if (select auth.uid()) is null or not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la décision sur un devis appartient à l''agence ou au propriétaire' using errcode = '42501';
  end if;
  if p_cle is null then
    raise exception 'La référence de cet envoi manque : rechargez la page avant de refuser le devis.';
  end if;
  v_motif := nullif(btrim(coalesce(p_motif, '')), '');
  if v_motif is null or length(v_motif) < 10 then
    raise exception 'Expliquez le refus à l''artisan en dix caractères au moins : ce motif lui est transmis.';
  end if;
  if length(v_motif) > 4000 then
    raise exception 'Le motif du refus est trop long : 4 000 caractères au plus.';
  end if;

  -- Ordre de verrou fixe, le même pour toute décision sur un devis : devis, puis sollicitation, puis incident.
  select * into d from public.incident_devis where id = p_devis and organization_id = p_org for update;
  if not found then raise exception 'Devis introuvable'; end if;

  -- Rejeu du même envoi (réponse perdue, second clic) : la décision est déjà prise, rien n'est refait.
  if d.statut = 'refuse' and d.decision_cle = p_cle then
    return false;
  end if;
  if d.statut = 'refuse' then
    raise exception 'Ce devis a déjà été refusé.';
  end if;
  if d.statut = 'retenu' then
    raise exception 'Ce devis a déjà été retenu : la mission est confiée à l''artisan.';
  end if;
  if d.statut = 'non_retenu' then
    raise exception 'Un autre devis a été retenu sur ce dossier : celui-ci est déjà écarté.';
  end if;
  if d.statut = 'annule' then
    raise exception 'Ce devis a été annulé (artisan écarté) : il n''y a rien à refuser.';
  end if;
  if d.statut = 'expire' or d.valide_jusqu_au < public.aujourdhui_paris() then
    raise exception 'Ce devis a expiré le % : il est caduc, il n''y a rien à refuser.', to_char(d.valide_jusqu_au, 'DD/MM/YYYY');
  end if;
  if d.statut <> 'depose' then
    raise exception 'Ce devis n''attend plus de décision.';
  end if;

  select * into s from public.incident_sollicitations
  where id = d.sollicitation_id and organization_id = p_org for update;
  select * into i from public.incidents
  where id = d.incident_id and organization_id = p_org for update;
  if i.etat <> 'qualifie' then
    raise exception 'Ce dossier n''est plus en attente d''un artisan (déjà affecté, ou clos) : le devis ne peut plus être décidé ici.';
  end if;

  update public.incident_devis
  set statut = 'refuse', decision = 'refus', decide_par = (select auth.uid()), decide_le = now(),
      decision_motif = v_motif, decision_cle = p_cle
  where id = p_devis;

  -- La demande est close pour cet artisan ; sa place dans le plafond de deux artisans est libre (réponse A.15-5) :
  -- solliciter_artisan ne compte que « envoyee », « devis_depose » et « retenue ». La mise en concurrence reste ouverte.
  update public.incident_sollicitations set statut = 'refusee' where id = s.id;

  -- Le fil de l'incident porte le motif : il est destiné à l'artisan, qui le lit sur sa demande.
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, d.incident_id, 'devis_refuse', (select auth.uid()),
          jsonb_build_object('devis_id', p_devis, 'artisan_id', d.artisan_id,
                             'sollicitation_id', s.id,
                             'montant_ttc_cents', d.montant_ttc_cents,
                             'motif', v_motif));
  return true;
end;
$$;
revoke all on function public.refuser_devis(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.refuser_devis(uuid, uuid, text, uuid) to authenticated, service_role;

-- 5. L'alerte « devis à décider » se ferme avec la bonne raison.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.fermer_alerte_devis_a_decider()'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 1)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$when 'expire' then 'Devis expiré'$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 (fermer_alerte_devis_a_decider) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$when 'expire' then 'Devis expiré'
        -- Décision D18 du 14/10 (livraison 1) : le refus motivé ferme l'alerte avec sa raison.
        when 'refuse' then 'Devis refusé'$nouveau$);
  execute v_def;
end $correctif$;

-- 6. Retenir un devis refusé : un message clair, pas un état technique.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.retenir_devis(uuid,uuid)'::regprocedure) into v_def;
  if position('Décision D18 du 14/10 (livraison 1)' in v_def) > 0 then return; end if;
  v_ancre := $ancre$raise exception 'Ce devis n''est plus sélectionnable (état : %)', d.statut;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Décision D18 (retenir_devis) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- Décision D18 du 14/10 (livraison 1) : un devis refusé ne se retient plus, et l'écran le dit en clair.
    if d.statut = 'refuse' then
      raise exception 'Ce devis a été refusé : il ne peut plus être retenu. Sollicitez un autre artisan.';
    end if;
    raise exception 'Ce devis n''est plus sélectionnable (état : %)', d.statut;$nouveau$);
  execute v_def;
end $correctif$;

-- 7. L'artisan lit le motif de la décision prise sur SON devis (jamais celui d'un concurrent : la projection reste
--    filtrée par mon_artisan_id()). Type de retour étendu : drop puis create, droits reposés à l'identique.
drop function if exists public.mes_sollicitations();
create function public.mes_sollicitations()
returns table (
  sollicitation_id uuid, organization_id uuid, agence_nom text,
  incident_numero text, categorie text, description text,
  urgence public.incident_urgence, metier public.artisan_metier,
  nature_travaux public.nature_travaux, decennale_requise boolean,
  code_postal text, ville text, envoyee_le timestamptz,
  statut public.sollicitation_statut, valide_jusqu_au date, montant_ttc_cents bigint,
  decision_motif text)
language sql stable security definer set search_path = '' as $$
  -- Décision D18 du 14/10 (livraison 1) : la dernière colonne porte le motif du refus de son devis.
  select s.id, s.organization_id, o.name, i.numero, i.categorie, i.description,
         i.urgence, c.metier, c.nature_travaux, c.decennale_requise,
         b.postal_code, b.city, s.envoyee_le, s.statut,
         d.valide_jusqu_au, d.montant_ttc_cents,
         d.decision_motif
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
  join public.incidents i on i.id = s.incident_id
  join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = s.organization_id
  left join public.incident_devis d on d.sollicitation_id = s.id
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  order by (s.statut = 'envoyee') desc, s.envoyee_le desc;
$$;
revoke all on function public.mes_sollicitations() from public, anon;
grant execute on function public.mes_sollicitations() to authenticated, service_role;

select public.fermer_fonctions_a_anon();
