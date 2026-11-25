-- Audit palier 1, P2-09 — Récapitulatif fiscal : le plafond et l'abattement du micro-foncier sortent du code.
--
-- CE QUI EXISTAIT. L'aide du récapitulatif fiscal (« Références fiscales et limites de cette aide ») disait, en dur
-- dans le texte de l'écran : « si vos recettes brutes n'excèdent pas 15 000 € … abattement automatique de 30 % ».
-- Une loi de finances qui changerait l'une de ces deux valeurs demandait de modifier le code et de republier ; et
-- rien ne disait quand elles avaient été contrôlées.
--
-- CE QUE POSE CETTE MIGRATION.
--   1. `reperes_fiscaux_reglage` : une seule ligne — plafond du micro-foncier (euros entiers), abattement (pour cent
--      entier), date de la dernière vérification. Livrée avec les valeurs que le code affichait (15 000 €, 30 %) et
--      SANS date de vérification : l'écran dit alors qu'aucune vérification n'est enregistrée. Aucune lecture ni
--      écriture directe.
--   2. `reperes_fiscaux()` : la lecture, pour l'écran du propriétaire (tout compte connecté). Trois valeurs, rien
--      d'autre.
--   3. `regler_reperes_fiscaux(plafond, abattement)` : le geste du superviseur permanent en double vérification. Il
--      enregistre les deux valeurs, date la vérification du jour (Paris) et journalise (supervision_operations,
--      action « reperes_fiscaux », avec les valeurs d'avant).
--
-- CE QUI NE CHANGE PAS. Aucun calcul : le récapitulatif ne calcule ni impôt ni droit au micro-foncier ; ces deux
-- valeurs ne servent qu'à la phrase d'aide. Les rubriques de la 2044, les montants et l'export restent tels quels.
--
-- Rejouable : un second passage ne remet pas les valeurs de livraison à la place de celles du superviseur.
-- Retour arrière : supabase/retours-arriere/20261123090000_reperes_fiscaux_reglage.retour.sql

-- ── 1. Le réglage : une ligne, fermée ───────────────────────────────────────────────────────────────────────
create table if not exists public.reperes_fiscaux_reglage (
  singleton boolean primary key default true,
  micro_foncier_plafond_euros integer not null default 15000,
  micro_foncier_abattement_pourcent integer not null default 30,
  verifie_le date,
  modifie_le timestamptz,
  modifie_par uuid references public.accounts(id),
  constraint reperes_fiscaux_reglage_unique check (singleton),
  constraint reperes_fiscaux_plafond_plausible check (micro_foncier_plafond_euros between 1000 and 1000000),
  constraint reperes_fiscaux_abattement_plausible check (micro_foncier_abattement_pourcent between 1 and 99)
);
create index if not exists reperes_fiscaux_reglage_modifie_par on public.reperes_fiscaux_reglage(modifie_par);
comment on table public.reperes_fiscaux_reglage is
  'Repères fiscaux cités par l''aide du récapitulatif fiscal (P2-09) : plafond et abattement du micro-foncier, date de leur dernière vérification. Aucun calcul ne les lit. Écrit par regler_reperes_fiscaux seulement.';
insert into public.reperes_fiscaux_reglage (singleton) values (true) on conflict (singleton) do nothing;

alter table public.reperes_fiscaux_reglage enable row level security;
revoke all on public.reperes_fiscaux_reglage from public, anon, authenticated, service_role;

-- ── 2. Lire ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Trois valeurs sans rapport avec un compte ou un espace (le plafond et le taux sont dans la loi) : tout compte
-- connecté les lit. Réglage absent : null, et l'écran ne cite alors aucune valeur.
create or replace function public.reperes_fiscaux()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'micro_foncier_plafond_euros', r.micro_foncier_plafond_euros,
           'micro_foncier_abattement_pourcent', r.micro_foncier_abattement_pourcent,
           'verifie_le', r.verifie_le)
    from public.reperes_fiscaux_reglage r
   where r.singleton;
$$;
comment on function public.reperes_fiscaux() is
  'Plafond et abattement du micro-foncier affichés par l''aide du récapitulatif fiscal, et date de leur dernière vérification (P2-09). Trois valeurs, aucun autre contenu.';
revoke all on function public.reperes_fiscaux() from public, anon;
grant execute on function public.reperes_fiscaux() to authenticated, service_role;

-- ── 3. Régler ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.regler_reperes_fiscaux(p_plafond_euros integer, p_abattement_pourcent integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reperes_fiscaux_reglage;
  v_jour date := public.aujourdhui_paris();
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
  insert into public.reperes_fiscaux_reglage (singleton) values (true) on conflict (singleton) do nothing;
  select * into r from public.reperes_fiscaux_reglage where singleton for update;
  update public.reperes_fiscaux_reglage
     set micro_foncier_plafond_euros = p_plafond_euros,
         micro_foncier_abattement_pourcent = p_abattement_pourcent,
         verifie_le = v_jour,
         modifie_le = now(),
         modifie_par = auth.uid()
   where singleton;
  insert into public.supervision_operations (objet, action, auteur, details)
  values (null, 'reperes_fiscaux', auth.uid(),
          jsonb_build_object('plafond_euros', p_plafond_euros, 'abattement_pourcent', p_abattement_pourcent,
                             'verifie_le', v_jour,
                             'plafond_precedent', r.micro_foncier_plafond_euros,
                             'abattement_precedent', r.micro_foncier_abattement_pourcent,
                             'verification_precedente', r.verifie_le));
end;
$$;
comment on function public.regler_reperes_fiscaux(integer, integer) is
  'Le superviseur permanent enregistre le plafond et l''abattement du micro-foncier qu''il vient de contrôler (P2-09) ; la vérification est datée du jour, le geste journalisé (supervision_operations, action « reperes_fiscaux »).';
revoke all on function public.regler_reperes_fiscaux(integer, integer) from public, anon, service_role;
grant execute on function public.regler_reperes_fiscaux(integer, integer) to authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
