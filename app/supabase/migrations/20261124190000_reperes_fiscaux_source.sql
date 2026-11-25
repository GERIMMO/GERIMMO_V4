-- Décision du dirigeant du 24/11/2026 (Q38) — repères fiscaux : enregistrer aussi la SOURCE du contrôle.
--
-- CE QUI EXISTAIT (migration 20261123090000). Le superviseur enregistre le plafond et l'abattement du micro-foncier ;
-- la base date la vérification du jour. Rien ne disait SUR QUELLE PAGE OFFICIELLE les deux valeurs avaient été lues.
--
-- CE QUE POSE CETTE MIGRATION.
--   1. Une colonne `source` sur le réglage : le texte libre que le superviseur saisit (nom du site officiel, page, date
--      de sa dernière mise à jour). Vide à la livraison : aucune source n'est inventée ici.
--   2. `reperes_fiscaux_avec_source()` : la lecture pour l'écran — les trois valeurs d'avant, plus la source.
--   3. `regler_reperes_fiscaux_avec_source(plafond, abattement, source)` : le même geste qu'avant (superviseur
--      permanent en double vérification, bornes refaites, vérification datée du jour de Paris, journal), qui exige et
--      enregistre en plus la source.
--
-- CE QUI NE CHANGE PAS. La table, ses contraintes et les deux fonctions de 20261123090000 restent telles quelles
-- (migration additive). L'application n'appelle plus l'ancien réglage à deux arguments : il ne touche pas la source.
-- Aucun calcul ne lit ces valeurs. Aucune donnée n'est écrite : ni valeur, ni date, ni source.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261124190000_reperes_fiscaux_source.retour.sql

-- ── 1. La source : un texte court, sur une ligne ────────────────────────────────────────────────────────────
alter table public.reperes_fiscaux_reglage add column if not exists source text;
alter table public.reperes_fiscaux_reglage drop constraint if exists reperes_fiscaux_source_lisible;
alter table public.reperes_fiscaux_reglage add constraint reperes_fiscaux_source_lisible
  check (source is null or (char_length(source) between 10 and 300 and source !~ '[[:cntrl:]]' and source = btrim(source)));
comment on column public.reperes_fiscaux_reglage.source is
  'Où le superviseur a lu le plafond et l''abattement du micro-foncier à la date verifie_le (texte libre : site officiel, page, date de mise à jour). Décision du 24/11/2026, Q38.';

-- ── 2. Lire ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.reperes_fiscaux_avec_source()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'micro_foncier_plafond_euros', r.micro_foncier_plafond_euros,
           'micro_foncier_abattement_pourcent', r.micro_foncier_abattement_pourcent,
           'verifie_le', r.verifie_le,
           'source', r.source)
    from public.reperes_fiscaux_reglage r
   where r.singleton;
$$;
comment on function public.reperes_fiscaux_avec_source() is
  'Plafond et abattement du micro-foncier affichés par l''aide du récapitulatif fiscal, date de leur dernière vérification et source de ce contrôle (Q38). Quatre valeurs, aucun autre contenu.';
revoke all on function public.reperes_fiscaux_avec_source() from public, anon;
grant execute on function public.reperes_fiscaux_avec_source() to authenticated, service_role;

-- ── 3. Régler ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.regler_reperes_fiscaux_avec_source(p_plafond_euros integer, p_abattement_pourcent integer, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reperes_fiscaux_reglage;
  v_jour date := public.aujourdhui_paris();
  v_source text := btrim(coalesce(p_source, ''));
begin
  if public.is_permanent_super_admin() is not true then
    raise exception 'Supervision permanente et double vérification requises';
  end if;
  if p_plafond_euros is null or p_plafond_euros < 1000 or p_plafond_euros > 1000000 then
    raise exception 'Plafond du micro-foncier : un nombre entier d''euros, entre 1 000 et 1 000 000';
  end if;
  if p_abattement_pourcent is null or p_abattement_pourcent < 1 or p_abattement_pourcent > 99 then
    raise exception 'Abattement du micro-foncier : un pourcentage entier, entre 1 et 99';
  end if;
  if char_length(v_source) < 10 or char_length(v_source) > 300 or v_source ~ '[[:cntrl:]]' then
    raise exception 'Source du contrôle : une ligne de 10 à 300 caractères (site officiel, page, date de mise à jour)';
  end if;
  insert into public.reperes_fiscaux_reglage (singleton) values (true) on conflict (singleton) do nothing;
  select * into r from public.reperes_fiscaux_reglage where singleton for update;
  update public.reperes_fiscaux_reglage
     set micro_foncier_plafond_euros = p_plafond_euros,
         micro_foncier_abattement_pourcent = p_abattement_pourcent,
         verifie_le = v_jour,
         source = v_source,
         modifie_le = now(),
         modifie_par = auth.uid()
   where singleton;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'reperes_fiscaux', auth.uid(),
          jsonb_build_object('plafond_euros', p_plafond_euros, 'abattement_pourcent', p_abattement_pourcent,
                             'verifie_le', v_jour, 'source', v_source,
                             'plafond_precedent', r.micro_foncier_plafond_euros,
                             'abattement_precedent', r.micro_foncier_abattement_pourcent,
                             'verification_precedente', r.verifie_le,
                             'source_precedente', r.source));
end;
$$;
comment on function public.regler_reperes_fiscaux_avec_source(integer, integer, text) is
  'Le superviseur permanent enregistre le plafond et l''abattement du micro-foncier qu''il vient de contrôler, et la source de ce contrôle (Q38) ; la vérification est datée du jour, le geste journalisé (supervision_operations, action « reperes_fiscaux »).';
revoke all on function public.regler_reperes_fiscaux_avec_source(integer, integer, text) from public, anon, service_role;
grant execute on function public.regler_reperes_fiscaux_avec_source(integer, integer, text) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
