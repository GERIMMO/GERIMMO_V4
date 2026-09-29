-- Audit des parcours métier du 29/09 — baux et actes juridiques.
--
-- 1. RÉVISION IRL RÉTROACTIVE (constat 1) et TRIMESTRE DE L'INDICE (constat 21).
--    La base imposait une date d'effet égale à une date anniversaire du bail
--    (20260927100000), l'écran proposait l'anniversaire passé et la lettre
--    annonçait le nouveau loyer « à compter du » cet anniversaire : une
--    révision demandée en septembre pour un anniversaire de mars s'appliquait
--    six mois en arrière.
--    RÈGLE (art. 17-1 I de la loi n° 89-462, rédaction ALUR ; wiki
--    [[Révision annuelle IRL]]) : la révision prend effet à la date convenue
--    (l'anniversaire) si elle est demandée à cette date ; demandée APRÈS, elle
--    prend effet à la date de la demande, sans rétroactivité. Le bailleur
--    dispose d'un an après la date anniversaire pour la demander ; passé ce
--    délai, il est réputé y avoir renoncé pour l'année écoulée.
--    Date d'effet = max(anniversaire, date de la demande).
--    Correction : `reviser_loyer` reçoit la DATE DE LA DEMANDE (par défaut le
--    jour même), jamais la date d'effet ; il retrouve l'échéance (dernière date
--    anniversaire atteinte à la demande), fixe l'effet et conserve les trois
--    dates sur la révision. Une seule révision par ANNÉE DE BAIL (entre deux
--    anniversaires) : une révision tardive (effet en septembre) n'empêche plus
--    celle de l'anniversaire suivant (mars), ce que la garde « un an d'écart »
--    faisait.
--    Constat 21 : l'indice nouveau se compare à l'indice de référence du MÊME
--    trimestre (IRL du 2e trimestre → IRL du 2e trimestre de l'année suivante).
--    Rien ne contrôlait le trimestre. Il est désormais saisi (« T2 2026 ») et
--    doit être celui du bail (baux.irl_trimestre) ; un bail ancien sans
--    trimestre lisible prend celui de sa première révision. L'année doit
--    avancer d'une révision à l'autre.
--
-- 2. DURÉE DU BAIL NU (constat 3). Le PDF (« personne morale » dès que la
--    qualité n'est pas « Personne physique ») et le congé (6 ans si aucun
--    bailleur « Personne physique ») appliquaient 6 ans à une SCI familiale et
--    à une indivision. RÈGLE (art. 10 et 13 de la loi n° 89-462) : 3 ans pour
--    un bailleur personne physique, une SCI familiale (entre parents et alliés
--    jusqu'au 4e degré inclus) ou une indivision de personnes physiques ; 6 ans
--    pour un bailleur personne morale. Bailleurs mixtes : 6 ans dès qu'un
--    bailleur est une personne morale autre qu'une SCI familiale.
--    Correction : liste FERMÉE des qualités (persons.qualite) et UNE règle,
--    `duree_bail_nu_annees(text[])`, reproduite côté PDF par
--    `dureeBailNuAnnees` (src/lib/qualite-bailleur.ts, test de parité).
--
-- 3. CONGÉ POUR VENTE (constats 8 et 20). Le terme du bail se calcule dans
--    `terme_bail_calcule` (extrait d'`enregistrer_conge`) et s'expose par
--    `terme_bail` au PDF du congé, qui ne prend plus une date saisie à la
--    main. Le prix n'est exigé que pour un congé pour vente d'une location
--    NUE : il vaut offre de vente (art. 15 II) ; en meublé (art. 25-8), pas de
--    droit de préemption, pas de prix obligatoire.
--
-- 4. DÉPART D'UN COLOCATAIRE (constat 7). Retirer un colocataire ou un garant
--    d'un bail signé supprimait la ligne : la solidarité de six mois (art. 8-1)
--    disparaissait avec elle, `date_solidarite_fin` n'était jamais renseignée.
--    Correction : suppression réservée au brouillon (déclencheur), et geste
--    `enregistrer_depart_colocataire` : date de départ (date d'effet du congé
--    du colocataire), fin de solidarité = départ + 6 mois, ou le jour du départ
--    s'il est remplacé par un nouveau colocataire figurant au bail ; le garant
--    de ce colocataire reste au bail, son engagement s'éteint à la même date.
--
-- Idempotent : add column if not exists, create or replace, triggers recréés.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Révision IRL
-- ═════════════════════════════════════════════════════════════════════════

alter table public.revisions_loyer add column if not exists date_echeance date;
alter table public.revisions_loyer add column if not exists date_demande date;
alter table public.revisions_loyer add column if not exists irl_trimestre text;
comment on column public.revisions_loyer.date_echeance is
  'Date anniversaire du bail à laquelle la révision se rattache (art. 17-1 I).';
comment on column public.revisions_loyer.date_demande is
  'Date à laquelle le bailleur a demandé la révision. Effet = max(échéance, demande) : pas de rétroactivité (art. 17-1 I, ALUR).';
comment on column public.revisions_loyer.irl_trimestre is
  'Trimestre de l''indice nouveau (« T2 2026 ») — le même trimestre que l''indice de référence du bail.';

-- Année de bail d'une date : le plus grand n tel que début + n ans <= date
-- (0 avant le premier anniversaire, -1 avant le début). « début + n ans »
-- ramène un 29 février au 28 : la même arithmétique que l'échéance.
create or replace function public.annee_de_bail(p_debut date, p_date date)
 returns integer
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare n integer;
begin
  if p_debut is null or p_date is null then return null; end if;
  if p_date < p_debut then return -1; end if;
  n := extract(year from age(p_date, p_debut))::integer;
  while (p_debut + make_interval(years => n + 1))::date <= p_date loop
    n := n + 1;
  end loop;
  while n > 0 and (p_debut + make_interval(years => n))::date > p_date loop
    n := n - 1;
  end loop;
  return n;
end;
$function$;

-- Numéro (1 à 4) et année d'un libellé de trimestre IRL : « T2 2026 »,
-- « 2e trimestre 2026 », « 2ème trimestre », « deuxième trimestre 2025 »…
-- null quand le libellé ne se lit pas.
create or replace function public.trimestre_irl_numero(p text)
 returns smallint
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p is null then null
    when lower(p) ~ '(^|[^a-z0-9])t\s*[1-4]([^0-9]|$)' then substring(lower(p) from 't\s*([1-4])')::smallint
    when lower(p) ~ '(^|[^0-9])[1-4]\s*(er|re|e|è|ème|eme|nd|nde)?\s*trim' then
      substring(lower(p) from '([1-4])\s*(?:er|re|e|è|ème|eme|nd|nde)?\s*trim')::smallint
    when lower(p) ~ 'premier\s+trim' then 1
    when lower(p) ~ '(deuxi[eè]me|second)\s+trim' then 2
    when lower(p) ~ 'troisi[eè]me\s+trim' then 3
    when lower(p) ~ 'quatri[eè]me\s+trim' then 4
    else null
  end;
$function$;

create or replace function public.trimestre_irl_annee(p text)
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$
  select substring(coalesce(p, '') from '((?:19|20)[0-9]{2})')::integer;
$function$;

-- Garde de la base : une révision par ANNÉE DE BAIL (entre deux dates
-- anniversaires), quel que soit le chemin d'écriture. Bail sans date de
-- début : repli sur l'ancien écart d'un an.
create or replace function public.revision_annuelle_par_bail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voisine date;
  v_debut date;
begin
  select b.date_debut into v_debut from public.baux b where b.id = new.bail_id;

  if v_debut is not null then
    select r.date_effet into v_voisine
    from public.revisions_loyer r
    where r.bail_id = new.bail_id
      and r.id <> new.id
      and r.date_effet <> new.date_effet
      and public.annee_de_bail(v_debut, r.date_effet) = public.annee_de_bail(v_debut, new.date_effet)
    order by r.date_effet desc
    limit 1;
  else
    select r.date_effet into v_voisine
    from public.revisions_loyer r
    where r.bail_id = new.bail_id
      and r.id <> new.id
      and r.date_effet <> new.date_effet
      and r.date_effet > (new.date_effet - interval '1 year')
      and r.date_effet < (new.date_effet + interval '1 year')
    order by r.date_effet desc
    limit 1;
  end if;

  if v_voisine is not null then
    raise exception 'Révision annuelle : ce bail a déjà été révisé au % pour la même année de bail que le % demandé. Une seule révision par année de bail (parcours 3.8, RM-3.8.5)',
      to_char(v_voisine, 'DD/MM/YYYY'), to_char(new.date_effet, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;
revoke execute on function public.revision_annuelle_par_bail()
  from public, anon, authenticated, service_role;

-- Nouvelle signature : la date de la DEMANDE remplace la date d'effet, le
-- trimestre de l'indice est exigé. L'ancienne est retirée (pas deux
-- surcharges ambiguës à l'appel par nom).
drop function if exists public.reviser_loyer(uuid, numeric, date);

create or replace function public.reviser_loyer(
  p_bail uuid,
  p_irl_nouveau numeric,
  p_irl_trimestre text,
  p_date_demande date default current_date
)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v record;
  v_dpe text;
  v_reference numeric;
  v_nouveau numeric;
  v_voisine date;
  v_derniere record;
  v_premiere_trimestre text;
  v_n integer;
  v_echeance date;
  v_effet date;
  v_trim smallint;
  v_trim_ref smallint;
  v_annee integer;
  v_annee_ref integer;
  v_trimestre text;
begin
  -- Verrou sur le bail : deux révisions concurrentes (double-clic, rejeu
  -- réseau) se voient au lieu de passer toutes les deux la même vérification.
  select * into v from public.baux where id = p_bail for update;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if not v.revision_irl then
    raise exception 'Ce bail n''a pas de clause de révision — aucune révision possible';
  end if;
  if v.loyer_hc is null then raise exception 'Le loyer n''est pas fixé'; end if;
  if p_date_demande is null then raise exception 'Date de la demande de révision obligatoire'; end if;
  if p_irl_nouveau is null or p_irl_nouveau <= 0 then
    raise exception 'Indice IRL du trimestre de révision obligatoire (saisi par l''admin d''agence, RM-3.8.3)';
  end if;

  -- RM-3.8.2 : l'indice de référence est celui figé au bail à sa signature.
  if v.irl_valeur is null or v.irl_valeur <= 0 then
    raise exception 'Indice de référence absent du bail : le trimestre et la valeur de l''IRL figés à la signature (RM-3.8.2) doivent être renseignés sur le bail avant toute révision';
  end if;

  select d.classe_dpe into v_dpe
  from public.diagnostics d
  where d.lot_id = v.lot_id and d.type = 'dpe' and d.archived_at is null
  order by d.date_realisation desc limit 1;
  if v_dpe in ('F', 'G') then
    raise exception 'Révision interdite : logement classé DPE % (passoire thermique, depuis 2022)', v_dpe;
  end if;

  -- La demande est un fait accompli : jamais datée dans le futur (le loyer
  -- ne s'augmente pas d'avance, RM-3.8.5).
  if p_date_demande > current_date then
    raise exception 'Révision anticipée : la demande datée du % n''a pas encore eu lieu. Une révision se demande à la date anniversaire ou dans l''année qui suit, jamais d''avance (RM-3.8.5)',
      to_char(p_date_demande, 'DD/MM/YYYY');
  end if;

  -- Échéance : la dernière date anniversaire atteinte à la date de la
  -- demande. La demande tombe par construction dans l'année qui la suit :
  -- la prescription d'un an (art. 17-1 I) est tenue.
  if v.date_debut is null then
    raise exception 'Le bail n''a pas de date de début : la date anniversaire de la révision ne peut pas être déterminée';
  end if;
  v_n := public.annee_de_bail(v.date_debut, p_date_demande);
  if v_n < 1 then
    raise exception 'Révision demandée le % refusée : elle se demande à partir de la première date anniversaire du bail (bail débuté le % — première date anniversaire : %)',
      to_char(p_date_demande, 'DD/MM/YYYY'), to_char(v.date_debut, 'DD/MM/YYYY'),
      to_char((v.date_debut + interval '1 year')::date, 'DD/MM/YYYY');
  end if;
  v_echeance := (v.date_debut + make_interval(years => v_n))::date;
  -- Art. 17-1 I (ALUR) : demandée après la date anniversaire, la révision
  -- prend effet à la date de la demande — jamais rétroactivement.
  v_effet := greatest(v_echeance, p_date_demande);

  -- Une révision par année de bail : le message est dit ici, avant la garde
  -- de la base, pour que l'agent lise la date qui bloque.
  select r.date_effet into v_voisine
  from public.revisions_loyer r
  where r.bail_id = p_bail
    and public.annee_de_bail(v.date_debut, r.date_effet) = v_n
  order by r.date_effet desc
  limit 1;
  if v_voisine is not null then
    raise exception 'Révision annuelle : ce bail a déjà été révisé au % pour l''échéance du %. Une seule révision par année de bail (parcours 3.8, RM-3.8.5)',
      to_char(v_voisine, 'DD/MM/YYYY'), to_char(v_echeance, 'DD/MM/YYYY');
  end if;

  select r.date_effet, r.irl_nouveau, r.irl_trimestre into v_derniere
  from public.revisions_loyer r
  where r.bail_id = p_bail
  order by r.date_effet desc
  limit 1;
  if v_derniere.date_effet is not null and v_derniere.date_effet > v_effet then
    raise exception 'Révision au % refusée : une révision plus récente (au %) est déjà appliquée au loyer',
      to_char(v_effet, 'DD/MM/YYYY'), to_char(v_derniere.date_effet, 'DD/MM/YYYY');
  end if;

  -- Constat 21 : l'indice nouveau est celui du MÊME trimestre que l'indice de
  -- référence. Le trimestre se saisit « T2 2026 ».
  v_trimestre := upper(regexp_replace(btrim(coalesce(p_irl_trimestre, '')), '\s+', ' ', 'g'));
  if v_trimestre !~ '^T[1-4] (19|20)[0-9]{2}$' then
    raise exception 'Trimestre de l''indice nouveau obligatoire, au format « T2 2026 » : l''IRL retenu est celui du trimestre de référence du bail (art. 17-1 I)';
  end if;
  v_trim := public.trimestre_irl_numero(v_trimestre);
  v_annee := public.trimestre_irl_annee(v_trimestre);
  v_trim_ref := public.trimestre_irl_numero(v.irl_trimestre);
  if v_trim_ref is null then
    -- Bail ancien sans trimestre lisible : la première révision fixe le
    -- trimestre, les suivantes s'y tiennent.
    select r.irl_trimestre into v_premiere_trimestre
    from public.revisions_loyer r
    where r.bail_id = p_bail and r.irl_trimestre is not null
    order by r.date_effet asc
    limit 1;
    v_trim_ref := public.trimestre_irl_numero(v_premiere_trimestre);
  end if;
  if v_trim_ref is not null and v_trim <> v_trim_ref then
    raise exception 'Indice du % refusé : la révision retient l''IRL du même trimestre que l''indice de référence du bail (T%), publié pour l''année de la révision (art. 17-1 I)',
      v_trimestre, v_trim_ref;
  end if;
  v_annee_ref := coalesce(public.trimestre_irl_annee(v_derniere.irl_trimestre),
                          case when v_derniere.date_effet is null then public.trimestre_irl_annee(v.irl_trimestre) end);
  if v_annee_ref is not null and v_annee <= v_annee_ref then
    raise exception 'Indice du % refusé : l''indice de référence est déjà celui de %, la révision retient l''indice publié pour une année postérieure',
      v_trimestre, v_annee_ref;
  end if;

  -- La référence est l'indice de la dernière révision appliquée (RM-3.8.7),
  -- sinon celui figé au bail (20260927100000).
  v_reference := coalesce(nullif(v_derniere.irl_nouveau, 0), v.irl_valeur);

  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);
  insert into public.revisions_loyer
    (organization_id, bail_id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau,
     date_echeance, date_demande, irl_trimestre)
  values (v.organization_id, p_bail, v_effet, v.loyer_hc, v_nouveau, v_reference, p_irl_nouveau,
          v_echeance, p_date_demande, v_trimestre);
  update public.baux set loyer_hc = v_nouveau, updated_at = now() where id = p_bail;
  return v_nouveau;
end;
$function$;

revoke execute on function public.reviser_loyer(uuid, numeric, text, date) from public, anon;
grant execute on function public.reviser_loyer(uuid, numeric, text, date) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Qualité du bailleur (liste fermée) et durée du bail nu
-- ═════════════════════════════════════════════════════════════════════════

-- La liste fermée — même ordre et mêmes libellés que QUALITES_BAILLEUR
-- (src/lib/qualite-bailleur.ts).
create or replace function public.qualites_bailleur()
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select array['Personne physique', 'Indivision (personnes physiques)', 'SCI familiale', 'SCI', 'Personne morale']::text[];
$function$;

-- Les écritures anciennes ou libres se ramènent à la liste : casse,
-- espaces, tirets bas (« personne_physique » des métadonnées d'inscription),
-- « Indivision » des formulaires d'inscription. Ce qui ne se lit pas est
-- rendu tel quel (le déclencheur le refuse).
create or replace function public.qualite_bailleur_normalisee(p text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  with n as (
    select lower(regexp_replace(replace(btrim(coalesce(p, '')), '_', ' '), '\s+', ' ', 'g')) as v
  )
  select case
    when n.v = '' then null
    when n.v = 'personne physique' then 'Personne physique'
    when n.v in ('indivision', 'indivision (personnes physiques)', 'indivision de personnes physiques') then 'Indivision (personnes physiques)'
    when n.v in ('sci familiale', 'sci (familiale)') then 'SCI familiale'
    when n.v in ('sci', 'sci (non familiale)', 'sci non familiale') then 'SCI'
    when n.v = 'personne morale' then 'Personne morale'
    else btrim(p)
  end
  from n;
$function$;

-- Reprise des qualités existantes hors liste (saisie libre de la fiche
-- personne). Au mieux de l'information : les mots-clés, sinon le prénom
-- (une raison sociale n'en a pas).
do $$
begin
  alter table public.persons disable trigger user;
  update public.persons p
     set qualite = public.qualite_bailleur_normalisee(p.qualite)
   where p.qualite is not null
     and p.qualite is distinct from public.qualite_bailleur_normalisee(p.qualite);
  update public.persons p
     set qualite = case
       when p.qualite ilike '%famil%' then 'SCI familiale'
       when p.qualite ilike '%indivis%' then 'Indivision (personnes physiques)'
       when p.qualite ilike '%physique%' then 'Personne physique'
       when p.qualite ~* '(^|[^a-z])sci([^a-z]|$)' then 'SCI'
       when p.qualite ilike '%morale%' or p.qualite ~* '(^|[^a-z])(sarl|sas|sasu|sa|eurl|snc|scpi|association|soci[eé]t[eé])([^a-z]|$)' then 'Personne morale'
       when p.prenom is not null and btrim(p.prenom) <> '' then 'Personne physique'
       else 'Personne morale'
     end
   where p.qualite is not null
     and not (p.qualite = any (public.qualites_bailleur()));
  alter table public.persons enable trigger user;
end $$;

create or replace function public.persons_qualite_liste_fermee()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.qualite := public.qualite_bailleur_normalisee(new.qualite);
  if new.qualite is not null and not (new.qualite = any (public.qualites_bailleur())) then
    raise exception 'Qualité « % » inconnue : choisissez Personne physique, Indivision (personnes physiques), SCI familiale, SCI ou Personne morale — la durée du bail en dépend (art. 10 et 13 de la loi du 6 juillet 1989)',
      new.qualite;
  end if;
  return new;
end;
$function$;
revoke execute on function public.persons_qualite_liste_fermee() from public, anon, authenticated;

drop trigger if exists persons_qualite_liste_fermee on public.persons;
create trigger persons_qualite_liste_fermee
  before insert or update of qualite on public.persons
  for each row execute function public.persons_qualite_liste_fermee();

alter table public.persons drop constraint if exists persons_qualite_liste_fermee;
alter table public.persons add constraint persons_qualite_liste_fermee
  check (qualite is null or qualite = any (public.qualites_bailleur()));

-- LA règle de durée d'un bail nu, à partir des qualités des bailleurs
-- (art. 10 et 13) : 6 ans dès qu'un bailleur est une personne morale autre
-- qu'une SCI familiale ; 3 ans sinon (personne physique, indivision de
-- personnes physiques, SCI familiale). Qualité absente : personne physique,
-- comme le bail PDF. Miroir TS : dureeBailNuAnnees (test de parité).
create or replace function public.duree_bail_nu_annees(p_qualites text[])
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when exists (
      select 1 from unnest(coalesce(p_qualites, array[]::text[])) q
       where public.qualite_bailleur_normalisee(q) in ('SCI', 'Personne morale'))
    then 6 else 3
  end;
$function$;
grant execute on function public.duree_bail_nu_annees(text[]) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Terme du bail (congé du bailleur, PDF du congé) et congé pour vente
-- ═════════════════════════════════════════════════════════════════════════

-- Terme de la période du bail en cours à p_date : le premier terme qui n'est
-- pas passé à cette date (date de début + durée, puis reconductions). null
-- quand il ne se calcule pas : pas de date de début, bail nu à durée réduite
-- (durée convenue non enregistrée). Bail étudiant (9 mois, jamais reconduit)
-- déjà échu : son terme, antérieur à p_date — l'appelant le dit.
create or replace function public.terme_bail_calcule(p_bail uuid, p_date date)
 returns date
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_lot uuid;
  v_meuble boolean;
  v_debut date;
  v_etudiant boolean;
  v_duree_reduite text;
  v_duree interval;
  v_reconduction interval;
  v_terme date;
  v_k integer;
begin
  select b.lot_id,
         (b.type = 'meuble' or (b.type = 'colocation' and coalesce(l.meuble, false))),
         b.date_debut, coalesce(b.meuble_etudiant, false),
         nullif(btrim(coalesce(b.duree_reduite_evenement, '')), '')
    into v_lot, v_meuble, v_debut, v_etudiant, v_duree_reduite
  from public.baux b
  join public.lots l on l.id = b.lot_id
  where b.id = p_bail;
  if v_lot is null or v_debut is null or p_date is null then return null; end if;
  if not v_meuble and v_duree_reduite is not null then return null; end if;

  if v_meuble then
    v_duree := case when v_etudiant then interval '9 months' else interval '1 year' end;
    v_reconduction := case when v_etudiant then null else interval '1 year' end;
  else
    -- Audit 29/09 : la règle unique des art. 10 et 13 (SCI familiale et
    -- indivision de personnes physiques : 3 ans).
    v_duree := make_interval(years => public.duree_bail_nu_annees(array(
      select p.qualite from public.detentions d join public.persons p on p.id = d.person_id
       where d.lot_id = v_lot and d.date_fin is null)));
    v_reconduction := v_duree;
  end if;

  v_k := 0;
  loop
    v_terme := (v_debut + v_duree + coalesce(v_reconduction * v_k, interval '0'))::date - 1;
    exit when v_terme >= p_date or v_reconduction is null or v_k > 200;
    v_k := v_k + 1;
  end loop;
  return v_terme;
end;
$function$;
revoke execute on function public.terme_bail_calcule(uuid, date) from public, anon, authenticated;

-- Exposé aux gérants de l'organisation (PDF du congé du bailleur).
create or replace function public.terme_bail(p_bail uuid, p_date date default current_date)
 returns date
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_org uuid;
begin
  select b.organization_id into v_org from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  return public.terme_bail_calcule(p_bail, p_date);
end;
$function$;
revoke execute on function public.terme_bail(uuid, date) from public, anon;
grant execute on function public.terme_bail(uuid, date) to authenticated, service_role;

-- enregistrer_conge : définition de 20260927103000, avec (a) le terme lu dans
-- terme_bail_calcule (durée du bail nu selon la règle unique), (b) le prix
-- exigé pour la seule vente d'un logement NU (art. 15 II ; en meublé,
-- art. 25-8, le congé pour vendre ne vaut pas offre).
create or replace function public.enregistrer_conge(p_bail uuid, p_par public.conge_par, p_date_presentation date, p_preavis_mois smallint, p_motif text default null::text, p_justificatif uuid default null::uuid, p_prix_vente numeric default null::numeric, p_beneficiaire text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_meuble boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
  v_debut date;
  v_etudiant boolean;
  v_duree_reduite text;
  v_terme date;
begin
  select b.organization_id, b.lot_id, b.type, b.etat,
         -- Audit 27/09 : la zone figée au bail (RM-1.10.7), pas celle du bien
         coalesce(b.zone_tendue, bi.zone_tendue, false),
         (b.type = 'meuble' or (b.type = 'colocation' and coalesce(l.meuble, false))),
         b.date_debut, coalesce(b.meuble_etudiant, false), nullif(btrim(coalesce(b.duree_reduite_evenement, '')), '')
    into v_org, v_lot, v_type, v_etat, v_zone, v_meuble, v_debut, v_etudiant, v_duree_reduite
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation nue) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_meuble then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
    if btrim(p_motif) ilike 'reprise%' and coalesce(btrim(p_beneficiaire), '') = '' then
      raise exception 'Congé pour reprise : indiquez le bénéficiaire de la reprise (nom et lien avec le bailleur)';
    end if;
    -- Audit 29/09 : le prix n'est exigé qu'en location NUE, où le congé pour
    -- vendre vaut offre de vente au locataire (art. 15 II). En meublé
    -- (art. 25-8), pas de droit de préemption : le prix reste facultatif.
    if btrim(p_motif) ilike 'vente%' and not v_meuble and (p_prix_vente is null or p_prix_vente <= 0) then
      raise exception 'Congé pour vente : le prix de vente proposé est obligatoire (le congé vaut offre de vente au locataire, art. 15 II)';
    end if;
    if p_prix_vente is not null and p_prix_vente <= 0 then
      raise exception 'Congé pour vente : le prix proposé doit être positif';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_meuble then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;

  -- Audit 27/09 : le congé du bailleur se donne pour le TERME du bail
  -- (wiki [[Bail]] § 1.11), avec le préavis complet avant ce terme.
  if p_par = 'bailleur' and v_debut is not null
     and not (not v_meuble and v_duree_reduite is not null) then
    v_terme := public.terme_bail_calcule(p_bail, p_date_presentation);
    if v_terme < p_date_presentation then
      raise exception 'Congé du bailleur impossible : le bail étudiant a pris fin le % (il n''est jamais reconduit)',
        to_char(v_terme, 'DD/MM/YYYY');
    end if;
    if v_effet > v_terme + 1 then
      raise exception 'Congé du bailleur tardif : le bail arrive à son terme le %, le congé devait être reçu au plus tard le % (préavis de % mois). Reçu le %, il serait nul (wiki Bail § 1.11)',
        to_char(v_terme, 'DD/MM/YYYY'),
        to_char(((v_terme + 1) - (v_preavis || ' months')::interval)::date, 'DD/MM/YYYY'),
        v_preavis, to_char(p_date_presentation, 'DD/MM/YYYY');
    end if;
    v_effet := v_terme;
  end if;

  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue, prix_vente, beneficiaire_reprise)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, v_zone,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'vente%' then p_prix_vente end,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'reprise%'
          then nullif(btrim(coalesce(p_beneficiaire, '')), '') end)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  -- Le bail fait foi : le lot suit, sinon le parc annonce « loué » pour un
  -- logement dont le locataire part.
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  -- L'intention transmise depuis l'espace locataire est soldée par ce congé
  update public.intentions_conge
     set traitee_le = now(), conge_id = v_conge
   where bail_id = p_bail and traitee_le is null;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Congé enregistré'
   where organization_id = v_org and statut = 'ouverte'
     and type = 'conge_intention' and (details ->> 'bail_id')::uuid = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end $function$;

revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid, numeric, text) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Départ d'un colocataire, garants liés
-- ═════════════════════════════════════════════════════════════════════════

alter table public.bail_personnes add column if not exists date_depart date;
comment on column public.bail_personnes.date_depart is
  'Colocataire : date d''effet de son congé (départ). La ligne reste au bail : la solidarité court jusqu''à date_solidarite_fin (art. 8-1).';
comment on column public.bail_personnes.date_solidarite_fin is
  'Fin de la solidarité (colocataire parti) ou de l''engagement du garant qui le couvre : départ + 6 mois, ou le départ s''il est remplacé au bail (art. 8-1).';

-- Un bail signé ne perd pas ses colocataires ni ses garants : leur départ
-- s'enregistre (la solidarité leur survit six mois). Seul un brouillon se
-- corrige. Visé : les écritures directes de l'API (même critère que
-- verrouiller_bail_hors_fonctions) ; la suppression d'un bail en cascade par
-- le service n'est pas concernée.
create or replace function public.bail_personnes_suppression_brouillon()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_etat public.bail_etat;
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  select b.etat into v_etat from public.baux b where b.id = old.bail_id;
  if v_etat is not null and v_etat <> 'brouillon'::public.bail_etat then
    raise exception 'Le bail est signé : un % ne se retire plus. Enregistrez son départ — la solidarité court encore six mois (art. 8-1 de la loi du 6 juillet 1989)',
      case when old.role = 'garant' then 'garant' else 'colocataire' end;
  end if;
  return old;
end;
$function$;
revoke execute on function public.bail_personnes_suppression_brouillon() from public, anon, authenticated;

drop trigger if exists bail_personnes_suppression_brouillon on public.bail_personnes;
create trigger bail_personnes_suppression_brouillon
  before delete on public.bail_personnes
  for each row execute function public.bail_personnes_suppression_brouillon();

-- Départ d'un colocataire (art. 8-1) : sa solidarité, et celle de son garant,
-- s'éteignent six mois après la date d'effet de son congé — ou à cette date si
-- un nouveau colocataire, figurant au bail, le remplace.
create or replace function public.enregistrer_depart_colocataire(
  p_ligne uuid,
  p_date_effet_conge date,
  p_remplacant uuid default null
)
 returns date
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v record;
  v_etat public.bail_etat;
  v_debut date;
  v_fin date;
begin
  select bp.* into v from public.bail_personnes bp where bp.id = p_ligne for update;
  if v.id is null then raise exception 'Colocataire introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.role <> 'colocataire' then
    raise exception 'Seul un colocataire donne congé : le garant reste engagé jusqu''à la fin de la solidarité du colocataire qu''il couvre';
  end if;
  if v.date_depart is not null then
    raise exception 'Le départ de ce colocataire est déjà enregistré (le %)', to_char(v.date_depart, 'DD/MM/YYYY');
  end if;
  select b.etat, b.date_debut into v_etat, v_debut from public.baux b where b.id = v.bail_id;
  if v_etat not in ('actif', 'preavis') then
    raise exception 'Le départ d''un colocataire s''enregistre sur un bail en cours (un brouillon se corrige en retirant la personne)';
  end if;
  if p_date_effet_conge is null then
    raise exception 'Date d''effet du congé du colocataire obligatoire';
  end if;
  if v_debut is not null and p_date_effet_conge < v_debut then
    raise exception 'Le départ ne peut pas précéder le début du bail (%)', to_char(v_debut, 'DD/MM/YYYY');
  end if;

  if p_remplacant is not null then
    if p_remplacant = v.person_id or not exists (
      select 1 from public.bail_personnes r
       where r.bail_id = v.bail_id and r.person_id = p_remplacant
         and r.role = 'colocataire' and r.date_depart is null) then
      raise exception 'Le remplaçant doit être un nouveau colocataire figurant au bail';
    end if;
    v_fin := p_date_effet_conge;
  else
    v_fin := (p_date_effet_conge + interval '6 months')::date;
  end if;

  update public.bail_personnes
     set date_depart = p_date_effet_conge, date_solidarite_fin = v_fin
   where id = v.id;
  -- Le garant du colocataire qui part reste au bail ; son engagement suit la
  -- solidarité de ce colocataire (art. 8-1, dernier alinéa).
  update public.bail_personnes
     set date_solidarite_fin = v_fin
   where bail_id = v.bail_id and role = 'garant' and garant_de = v.person_id
     and (date_solidarite_fin is null or date_solidarite_fin > v_fin);
  return v_fin;
end;
$function$;
revoke execute on function public.enregistrer_depart_colocataire(uuid, date, uuid) from public, anon;
grant execute on function public.enregistrer_depart_colocataire(uuid, date, uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
