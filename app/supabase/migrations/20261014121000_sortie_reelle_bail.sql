-- Décision D34 du 14 octobre 2026 (fiches SOR-03 et SOR-04), option B : la date de
-- sortie réelle du locataire est enregistrée à la clôture du bail, et un bail ne peut
-- plus être activé avant la sortie réelle du bail précédent du même lot.
--
-- Constat : la base ne portait aucune date de sortie réelle. Après une clôture
-- anticipée, date_fin reste la date théorique du préavis, et rien ne comparait les
-- dates de deux baux d'un même lot : un second bail pouvait être activé sur une
-- période déjà couverte.
--
--   1. baux.date_sortie_reelle (facultative) : remplie par terminer_bail. Les baux
--      déjà clôturés la laissent vide ; on n'invente aucune date.
--   2. terminer_bail(bail, date de sortie, confirmation) : la date par défaut est
--      aujourd'hui (jour de Paris), jamais dans le futur ni avant l'entrée ; si elle
--      précède la date d'effet du préavis, la clôture exige une confirmation
--      explicite (erreur GRC01 sinon). La date de fin du bail n'est pas modifiée :
--      aucun appel de loyer, aucun solde, aucun montant ne change.
--   3. controler_mise_en_location : un bail n'entre pas avant la sortie réelle du
--      bail précédent du même lot (même chambre en colocation) ; à défaut de sortie
--      réelle enregistrée, la date de fin du bail précédent fait foi.
--
-- Pas la contrainte d'exclusion (option C), et pas la comparaison à date_fin seule
-- (option D) : après un départ anticipé, date_fin reste la date théorique du préavis,
-- elle refuserait une remise en location légitime.
--
-- terminer_bail change de signature : l'ancienne (un seul argument) est retirée, la
-- nouvelle garde des valeurs par défaut — l'appel `terminer_bail(bail)` reste valable,
-- mais refuse désormais une clôture anticipée non confirmée. controler_mise_en_location
-- est modifiée EN RELISANT sa définition en vigueur (comme 20261013120000) ; si elle
-- n'est pas celle attendue, la migration s'arrête. Elle se rejoue sans effet.
-- Retour arrière : supabase/retours-arriere/20261014121000_sortie_reelle_bail.retour.sql

alter table public.baux add column if not exists date_sortie_reelle date;

comment on column public.baux.date_sortie_reelle is
  'Décision D34 du 14/10 (SOR-04) : jour où le locataire a réellement quitté le logement, enregistré à la clôture (terminer_bail). Facultative : vide pour les baux clôturés avant cette décision, auquel cas date_fin fait foi.';

-- terminer_bail : date de sortie réelle et confirmation d'une clôture anticipée.
drop function if exists public.terminer_bail(uuid);

create or replace function public.terminer_bail(
  p_bail uuid,
  p_date_sortie date default null,
  p_confirmer_anticipee boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bail record;
  v_sortie date;
  v_effet date;
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  select b.* into v_bail from public.baux b where b.id = p_bail;
  if v_bail.id is null then raise exception 'Bail introuvable'; end if;
  if not (v_bail.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_bail.etat <> 'preavis' then
    raise exception 'Seul un bail en préavis se clôture — enregistrez d''abord le congé';
  end if;
  if not exists (select 1 from public.etats_des_lieux e
                 where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'Clôture impossible sans état des lieux de sortie signé (RM-3.11.2)';
  end if;

  -- Décision D34 du 14/10 (SOR-04) : la sortie réelle est un fait passé, daté du jour
  -- de Paris par défaut ; elle ne précède pas l'entrée dans les lieux (sauf pour un bail
  -- clôturé avant même son entrée : le locataire n'a alors jamais occupé le logement).
  v_sortie := coalesce(p_date_sortie, v_aujourdhui);
  if v_sortie > v_aujourdhui then
    raise exception 'La date de sortie réelle ne peut pas être postérieure à aujourd''hui (%)',
      to_char(v_aujourdhui, 'DD/MM/YYYY');
  end if;
  if v_bail.date_debut is not null and v_bail.date_debut <= v_aujourdhui and v_sortie < v_bail.date_debut then
    raise exception 'La date de sortie réelle ne peut pas précéder l''entrée dans les lieux (%)',
      to_char(v_bail.date_debut, 'DD/MM/YYYY');
  end if;

  -- Date d'effet du préavis : celle du congé en vigueur (un congé annulé ne compte plus) ;
  -- à défaut, la date de fin du bail, qui la reprend à l'enregistrement du congé.
  select c.date_effet into v_effet
    from public.conges c
   where c.bail_id = p_bail and c.annule_le is null
   order by c.created_at desc
   limit 1;
  v_effet := coalesce(v_effet, v_bail.date_fin);

  -- Clôture avant la fin du préavis : jamais en silence. La date de fin du bail reste
  -- inchangée, la confirmation ne modifie aucun montant.
  if v_effet is not null and v_sortie < v_effet and not coalesce(p_confirmer_anticipee, false) then
    raise exception 'Clôture avant la fin du préavis : le préavis court jusqu''au %, la sortie réelle serait datée du %. Confirmez la clôture anticipée pour l''enregistrer (la date de fin du bail ne change pas).',
      to_char(v_effet, 'DD/MM/YYYY'), to_char(v_sortie, 'DD/MM/YYYY')
      using errcode = 'GRC01';
  end if;

  update public.baux
     set etat = 'termine', date_sortie_reelle = v_sortie, updated_at = now()
   where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_bail.lot_id) where id = v_bail.lot_id and etat in ('loue','preavis');

  -- Les personnes du bail sans autre bail vivant perdent le geste, pas la
  -- lecture : adhésion locataire désactivée (espace en consultation, D2)
  update public.memberships m
     set status = 'inactive'
   where m.organization_id = v_bail.organization_id
     and m.role = 'locataire' and m.status = 'active'
     and m.account_id in (
       select p.account_id from public.persons p
       where p.organization_id = v_bail.organization_id
         and p.account_id is not null
         and (p.id = v_bail.locataire_principal
              or exists (select 1 from public.bail_personnes bp
                         where bp.bail_id = p_bail and bp.person_id = p.id)))
     and not exists (
       select 1 from public.baux b2
       join public.persons p2 on p2.account_id = m.account_id
                             and p2.organization_id = b2.organization_id
       where b2.organization_id = v_bail.organization_id
         and b2.etat in ('actif', 'preavis')
         and (b2.locataire_principal = p2.id
              or exists (select 1 from public.bail_personnes bp2
                         where bp2.bail_id = b2.id and bp2.person_id = p2.id)));

  -- Les alertes encore ouvertes du bail (EDL de sortie, intention) se ferment
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Bail clôturé'
   where organization_id = v_bail.organization_id and statut = 'ouverte'
     and details ->> 'bail_id' = p_bail::text
     and type in ('edl_sortie', 'edl_entree', 'conge_intention');
end;
$function$;

revoke all on function public.terminer_bail(uuid, date, boolean) from public, anon;
grant execute on function public.terminer_bail(uuid, date, boolean) to authenticated, service_role;

-- controler_mise_en_location : le bail suivant n'entre pas avant la sortie du précédent.
do $correctif$
declare
  v_def text;
  v_ancre text;
begin
  select pg_get_functiondef('public.controler_mise_en_location(uuid)'::regprocedure) into v_def;
  if position('Décision D34 du 14/10 (SOR-03)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$  v_plafond numeric;
begin
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D34 : définition inattendue (ancre 1 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  v_plafond numeric;
  v_sortie_precedente date;
  v_sortie_enregistree boolean;
begin
$nouveau$);

  v_ancre := $ancre$    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;
$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D34 : définition inattendue (ancre 2 absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;

  -- Décision D34 du 14/10 (SOR-03), option B : un bail n'entre pas avant la sortie réelle
  -- du bail précédent du même lot (même chambre en colocation). À défaut de sortie réelle
  -- enregistrée (bail clôturé avant cette décision), la date de fin du précédent fait foi.
  select b.date_sortie_reelle is not null, coalesce(b.date_sortie_reelle, b.date_fin)
    into v_sortie_enregistree, v_sortie_precedente
    from public.baux b
   where b.lot_id = v.lot_id and b.id <> p_bail and b.etat = 'termine'
     and coalesce(b.date_sortie_reelle, b.date_fin) is not null
     and (v.chambre_id is null or b.chambre_id is null or b.chambre_id = v.chambre_id)
   order by coalesce(b.date_sortie_reelle, b.date_fin) desc
   limit 1;
  if v_sortie_precedente is not null and v.date_debut < v_sortie_precedente then
    if v_sortie_enregistree then
      raise exception 'Mise en location refusée : le bail précédent de ce lot s''est terminé le % (sortie réelle du locataire), et ce bail entre le % — l''entrée ne peut pas précéder cette sortie. Corrigez la date d''entrée du brouillon, puis déposez le bail signé',
        to_char(v_sortie_precedente, 'DD/MM/YYYY'), to_char(v.date_debut, 'DD/MM/YYYY');
    end if;
    raise exception 'Mise en location refusée : le bail précédent de ce lot court jusqu''au % (date de fin prévue ; aucune sortie réelle n''est enregistrée), et ce bail entre le % — l''entrée ne peut pas précéder cette date. Corrigez la date d''entrée du brouillon, puis déposez le bail signé',
      to_char(v_sortie_precedente, 'DD/MM/YYYY'), to_char(v.date_debut, 'DD/MM/YYYY');
  end if;
$nouveau$);
  execute v_def;
end $correctif$;

revoke all on function public.controler_mise_en_location(uuid) from public, anon;
grant execute on function public.controler_mise_en_location(uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
