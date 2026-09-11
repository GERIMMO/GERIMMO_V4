-- Le cycle mensuel tourne sans personne.
--
-- CONSTAT DU 11/09. Les appels de loyer d'un mois n'existent que si un gérant
-- ouvre le bail et clique « Générer l'échéancier ». Le wiki décrit pourtant le
-- contraire depuis le 24/07 : « appel de loyer émis par tâche planifiée »
-- (processus « Quittancement des loyers », cible V3 du module 3). Un client qui
-- oublie de cliquer n'a pas d'appel, donc pas de quittance, donc pas d'impayé
-- détectable : le produit ne sait plus ce qu'on lui doit. On ne peut pas vendre
-- « ça se gère presque tout seul » sur un échéancier à la main.
--
-- CE QUE CETTE MIGRATION AUTOMATISE, ET CE QU'ELLE LAISSE À L'HUMAIN.
-- Automatique : les APPELS du mois (ce qui est dû, calculé du bail), et la
-- resynchronisation des quittances et reçus qui en découlent. Automatique
-- aussi : le CONSTAT d'impayé, sous forme d'alerte.
-- Pas automatique, et volontairement : la RELANCE. Le wiki (« Relances et mise
-- en demeure », cible V3) veut un montant plancher et trois délais PARAMÉTRÉS
-- PAR AGENCE (module 18, pas encore construit). Poser ici « relance à J+5 »
-- serait inventer une règle métier que personne n'a arrêtée, et l'inscrire dans
-- un acte qui fonde ensuite un recours. La tâche pose donc le fait — « 1 240 €
-- impayés depuis le 05/08 » — et l'escalade reste un geste du gérant.
--
-- POURQUOI DEUX FONCTIONS POUR LES APPELS. `generer_appels_loyer` vérifie que
-- l'appelant est admin, agent ou propriétaire de l'organisation. Le cron n'est
-- personne : `auth.uid()` y vaut NULL, la vérification échouerait. La logique de
-- calcul (prorata d'entrée et de sortie, arrondi unique) descend donc dans
-- `generer_appels_loyer_interne`, et la fonction publique n'est plus que sa
-- garde. Un seul calcul, deux portes.
--
-- UNE ORGANISATION SUSPENDUE N'EST PAS SERVIE. Le cycle ne tourne que là où
-- l'écriture est ouverte (migration du 11/09 sur l'abonnement) : générer des
-- appels pour un client qui ne paie plus reviendrait à produire son mois de
-- gestion gratuitement. Ses données restent lisibles et exportables ; elles ne
-- s'enrichissent plus. La tâche ne pose donc PAS `tache_systeme()` — à la
-- différence de la rétention légale, qui, elle, doit continuer partout.

-- ── 1. Le calcul des appels, sans la garde de rôle ─────────────────────────
create or replace function public.generer_appels_loyer_interne(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_mois date;
  v_fin date;
  v_jours_mois int;
  v_jours_dus int;
  v_premier int;   -- premier jour facturé du mois
  v_dernier int;   -- dernier jour facturé du mois
  v_loyer numeric;
  v_charges numeric;
  v_crees int := 0;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if v.etat not in ('actif', 'preavis', 'termine') then
    raise exception 'Les appels de loyer ne se génèrent que sur un bail actif';
  end if;
  if v.date_debut is null then raise exception 'Le bail n''a pas de date de début'; end if;

  v_mois := date_trunc('month', v.date_debut)::date;
  v_fin := least(
    date_trunc('month', current_date)::date,
    coalesce(date_trunc('month', v.date_fin)::date, date_trunc('month', current_date)::date)
  );

  while v_mois <= v_fin loop
    if not exists (select 1 from public.appels_loyer a where a.bail_id = p_bail and a.periode = v_mois) then
      v_jours_mois := extract(day from (v_mois + interval '1 month' - interval '1 day'))::int;

      -- Bornes de facturation dans le mois : entrée en cours de mois et/ou
      -- sortie en cours de mois réduisent la période due.
      v_premier := case
        when v_mois = date_trunc('month', v.date_debut)::date then extract(day from v.date_debut)::int
        else 1 end;
      v_dernier := case
        when v.date_fin is not null and v_mois = date_trunc('month', v.date_fin)::date
          then extract(day from v.date_fin)::int
        else v_jours_mois end;
      v_jours_dus := greatest(0, v_dernier - v_premier + 1);

      -- Un seul arrondi, à la fin, sur chaque composante.
      if v_jours_dus = v_jours_mois then
        v_loyer := round(coalesce(v.loyer_hc, 0), 2);
        v_charges := round(coalesce(v.charges, 0), 2);
      else
        v_loyer := round(coalesce(v.loyer_hc, 0) * v_jours_dus / v_jours_mois, 2);
        v_charges := round(coalesce(v.charges, 0) * v_jours_dus / v_jours_mois, 2);
      end if;

      insert into public.appels_loyer
        (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
      values (
        v.organization_id, p_bail, v_mois, v_loyer, v_charges,
        v_loyer + v_charges,   -- le total EST la somme des lignes affichées
        (v_mois + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
        v_jours_dus < v_jours_mois
      );
      v_crees := v_crees + 1;
    end if;
    v_mois := (v_mois + interval '1 month')::date;
  end loop;
  return v_crees;
end;
$$;
comment on function public.generer_appels_loyer_interne(uuid) is
  'Calcul des appels manquants d''un bail, SANS contrôle de rôle : réservé à la tâche planifiée. La porte pour les humains est generer_appels_loyer.';
-- Elle ne vérifie rien : exposée, elle laisserait n'importe quel compte créer
-- des appels sur n'importe quel bail à partir de son seul identifiant.
revoke execute on function public.generer_appels_loyer_interne(uuid) from public, anon, authenticated;

-- La fonction publique n'est plus que la garde de rôle.
create or replace function public.generer_appels_loyer(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  return public.generer_appels_loyer_interne(p_bail);
end;
$$;

-- ── 2. Le constat d'impayé ─────────────────────────────────────────────────
-- Une alerte PAR BAIL, pas par terme : un locataire en retard de trois mois est
-- un dossier, pas trois alertes. Le seuil est le NOMBRE de termes dus — un fait
-- constaté, pas un délai choisi. La criticité qui en découle n'est qu'une
-- échelle d'affichage : elle ne déclenche aucun acte, ne fixe aucune date, et
-- ne préjuge pas du circuit de relance que le module 18 rendra paramétrable.
-- Aucun montant plancher n'est codé : le wiki en veut un (~50 €), paramétrable
-- par agence ; l'inventer ici le figerait pour tout le monde.
create or replace function public.suivre_impayes_bail(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_termes int;
  v_du numeric;
  v_depuis date;
  v_qui text;
begin
  select b.id, b.organization_id, b.locataire_principal, l.nom as lot_nom
    into v
  from public.baux b
  left join public.lots l on l.id = b.lot_id
  where b.id = p_bail;
  if v.id is null then return 0; end if;

  -- Ce qui reste dû sur les termes DÉJÀ ÉCHUS. L'imputation étant du plus
  -- ancien au plus récent (RM-3.3.2), ce sont les premiers de la liste.
  select count(*) filter (where e.montant_du > e.montant_couvert),
         coalesce(sum(e.montant_du - e.montant_couvert) filter (where e.montant_du > e.montant_couvert), 0),
         min(e.date_echeance) filter (where e.montant_du > e.montant_couvert)
    into v_termes, v_du, v_depuis
  from public.etat_loyers_bail_brut(p_bail) e
  where e.date_echeance < current_date;

  if v_termes = 0 or v_du <= 0 then
    -- Soldé : l'alerte se ferme d'elle-même, avec son motif, et reste à
    -- l'historique (mécanique du 29/08 sur l'origine des alertes).
    perform public.fermer_alertes_origine(
      v.organization_id, 'bail', p_bail, 'Impayé soldé', array['loyer_impaye']);
    return 0;
  end if;

  select p.nom || coalesce(' ' || p.prenom, '') into v_qui
  from public.persons p where p.id = v.locataire_principal;

  return public.poser_alerte_seuil(
    v.organization_id, 'loyer_impaye', 'bail_id', p_bail, v_termes::text,
    case when v_termes >= 2 then 'critique'::public.alerte_criticite
         else 'normale'::public.alerte_criticite end,
    format('Loyer impayé — %s%s : %s dus depuis le %s',
           coalesce(v_qui, 'locataire'),
           coalesce(' (' || v.lot_nom || ')', ''),
           replace(to_char(v_du, 'FM999999990.00'), '.', ',') || ' €',
           to_char(v_depuis, 'DD/MM/YYYY')),
    jsonb_build_object('bail_id', p_bail, 'montant_du', v_du, 'termes', v_termes,
                       'depuis', v_depuis),
    v_depuis);
end;
$$;
comment on function public.suivre_impayes_bail(uuid) is
  'Pose ou ferme l''alerte d''impayé d''un bail. Constate, ne relance pas : le circuit de relance (plancher + délais) est paramétrable par agence, module 18.';
revoke execute on function public.suivre_impayes_bail(uuid) from public, anon, authenticated;

-- Le type d'alerte doit être rattachable à son bail, sans quoi il ne se
-- fermerait jamais tout seul (fermer_alertes_origine cherche par origine).
create or replace function public.alerte_origine(p_type text, p_details jsonb,
  out origine_type text, out origine_id uuid)
returns record
language plpgsql
immutable
set search_path = ''
as $$
declare v_cle text;
begin
  origine_type := case p_type
    when 'edl_entree' then 'bail' when 'edl_sortie' then 'bail'
    when 'conge_intention' then 'bail'
    when 'loyer_impaye' then 'bail'
    when 'diagnostic_expiration' then 'diagnostic'
    when 'assurance_expiration' then 'document' when 'attestation_a_verifier' then 'document'
    when 'piece_deposee' then 'document'
    when 'signature_retournee' then 'document'
    when 'incident_a_qualifier' then 'incident' when 'incident_conteste' then 'incident'
    when 'versement_proprietaire' then 'rapport' when 'ecart_versement' then 'rapport'
    when 'decompte' then 'restitution' when 'decompte_lrar' then 'restitution'
    when 'restitution_echeance' then 'restitution'
    when 'retenue_sans_justificatif' then case when p_details ? 'retenue_id' then 'retenue' else 'restitution' end
    else null end;
  v_cle := case origine_type
    when 'bail' then 'bail_id' when 'diagnostic' then 'diagnostic_id'
    when 'document' then 'document_id' when 'incident' then 'incident_id'
    when 'rapport' then 'rapport_id' when 'restitution' then 'restitution_id'
    when 'retenue' then 'retenue_id' else null end;
  if v_cle is null or not (p_details ? v_cle) then origine_type := null; origine_id := null; return; end if;
  begin origine_id := (p_details ->> v_cle)::uuid;
  exception when others then origine_type := null; origine_id := null; end;
end $$;

-- ── 3. Les deux tâches planifiées ──────────────────────────────────────────
-- Le 1er du mois : les appels du mois, puis les documents qui en découlent.
create or replace function public.cycle_mensuel_interne()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bail record;
  v_appels int;
  v_crees int := 0;
  v_baux int := 0;
  v_quittances int := 0;
  v_recus int := 0;
  v_echecs jsonb := '[]'::jsonb;
  r record;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'cycle_mensuel_interne: reserve au cron et au super admin';
  end if;

  for v_bail in
    select b.id
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    where b.date_debut is not null
      and (b.etat in ('actif', 'preavis')
           -- Un bail clos ce mois-ci ou le mois dernier doit encore recevoir
           -- son dernier appel proratisé ; au-delà, tout a déjà été généré.
           or (b.etat = 'termine' and b.date_fin is not null
               and b.date_fin >= (date_trunc('month', current_date) - interval '1 month')::date))
      -- Une organisation suspendue n'est plus servie : elle lit, elle n'écrit plus.
      and public.org_ecriture_ouverte(o.id)
    order by b.id
  loop
    v_baux := v_baux + 1;
    -- Un bail en défaut (mention manquante, données incohérentes) ne doit pas
    -- emporter le mois de tous les autres : on note et on continue.
    begin
      v_appels := public.generer_appels_loyer_interne(v_bail.id);
      v_crees := v_crees + v_appels;
      select q.quittances, q.recus into r
        from public.resynchroniser_quittances(v_bail.id) q;
      v_quittances := v_quittances + coalesce(r.quittances, 0);
      v_recus := v_recus + coalesce(r.recus, 0);
    exception when others then
      v_echecs := v_echecs || jsonb_build_object('bail_id', v_bail.id, 'erreur', sqlerrm);
    end;
  end loop;

  -- Le journal technique garde la trace du passage : sans elle, « le cycle n'a
  -- pas tourné » et « le cycle n'avait rien à faire » ne se distinguent pas.
  insert into public.tech_log (evenement, details)
  values ('cycle_mensuel', jsonb_build_object(
    'baux', v_baux, 'appels_crees', v_crees,
    'quittances', v_quittances, 'recus', v_recus,
    'echecs', jsonb_array_length(v_echecs), 'detail_echecs', v_echecs));

  return jsonb_build_object('baux', v_baux, 'appels_crees', v_crees,
    'quittances', v_quittances, 'recus', v_recus, 'echecs', v_echecs);
end;
$$;
revoke execute on function public.cycle_mensuel_interne() from public, anon, authenticated;

-- Chaque jour : l'état des impayés, constaté et non relancé.
create or replace function public.generer_alertes_impayes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bail record;
  v_posees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_impayes: reserve au cron et au super admin';
  end if;

  for v_bail in
    select b.id
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    where b.etat in ('actif', 'preavis', 'termine')
      -- La dette survit au bail (RM-3.6.8) : un bail terminé qui doit encore
      -- reste suivi. Ce qui s'arrête, c'est le service d'une organisation
      -- suspendue — elle ne reçoit plus d'alertes neuves.
      and public.org_ecriture_ouverte(o.id)
    order by b.id
  loop
    v_posees := v_posees + public.suivre_impayes_bail(v_bail.id);
  end loop;
  return v_posees;
end;
$$;
revoke execute on function public.generer_alertes_impayes() from public, anon, authenticated;

-- ── 4. Inscription au planificateur ────────────────────────────────────────
-- 5 h 00 UTC le 1er : après la rétention (3 h) et les alertes documentaires,
-- avant l'ouverture des bureaux.
select cron.schedule('cycle-mensuel', '0 5 1 * *',
  $$select public.cycle_mensuel_interne()$$);
select cron.schedule('alertes-impayes-quotidiennes', '30 5 * * *',
  $$select public.generer_alertes_impayes()$$);
