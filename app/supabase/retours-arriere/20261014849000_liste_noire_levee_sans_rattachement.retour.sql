-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014849000_liste_noire_levee_sans_rattachement.sql (troisième relecture du 15/10/2026 du lot
-- « invitation-artisan » : la levée d'une liste noire locale ne fait jamais entrer un artisan dans un carnet).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : les définitions EN VIGUEUR de `artisan_blacklist_locale`, `artisan_lever_blacklist_locale`,
-- `artisan_statut_local` et `repondre_invitation_artisan` sont relues, et le seul morceau posé par la migration dans
-- chacune (avec sa marque) redevient sa ligne d'ancre. Un correctif posé depuis par une autre migration ailleurs dans ces
-- fonctions est conservé. Rejouable : sans le morceau de la migration (ou sans la fonction), rien n'est fait. Droits
-- inchangés.
--
-- CONSERVE la colonne `artisan_agences.creee_par_liste_noire` et ses valeurs (le script dit combien de lignes la portent) :
-- sans les fonctions corrigées, plus rien ne la lit ni ne l'écrit, et une nouvelle application de la migration la
-- retrouve. Aucune ligne n'est touchée.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014849000_liste_noire_levee_sans_rattachement.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : la levée d'une liste noire passe en « actif » la ligne que la liste noire avait créée.
-- Un propriétaire direct qui a sollicité un artisan du réseau peut ainsi le faire entrer dans son carnet sans invitation
-- (puis le solliciter dans une commune fermée) ; une agence contourne l'ajout par SIRET. Ordre indifférent avec le code.
-- À jouer AVANT le retour de 20261014840000 (qui supprime `repondre_invitation_artisan` ; joué après, ce script le dit et
-- passe), et AVANT ceux de 20261014843000 et 20261014601000 si ceux-ci doivent l'être.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Ce que le retour laisse en place, dit en nombre.
do $retour_arriere$
declare v_n integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'artisan_agences' and column_name = 'creee_par_liste_noire') then
    execute 'select count(*) from public.artisan_agences where creee_par_liste_noire' into v_n;
    raise notice 'Lignes de carnet marquées « créée par la liste noire », conservées : %', v_n;
  end if;
end $retour_arriere$;

-- 5. repondre_invitation_artisan
do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$    -- Relecture du 15/10 (liste noire sans rattachement, acceptation) : le geste de l'artisan fait entrer la ligne au carnet, voir 20261014849000.
    update public.artisan_agences set statut = 'actif', creee_par_liste_noire = false where id = aa.id;$nouveau$;
  c_ancre constant text := $ancre$    update public.artisan_agences set statut = 'actif' where id = aa.id;$ancre$;
begin
  if to_regprocedure('public.repondre_invitation_artisan(uuid,boolean)') is null then
    raise notice 'repondre_invitation_artisan : fonction absente (retour de 20261014840000 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.repondre_invitation_artisan(uuid,boolean)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'repondre_invitation_artisan : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'repondre_invitation_artisan : ligne de l''acceptation rétablie';
end $retour_arriere$;

-- 4. artisan_statut_local
do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (liste noire sans rattachement, réactivation) : la porte du carnet est ailleurs, voir 20261014849000.
  if p_actif and exists (select 1 from public.artisan_agences aa
                         where aa.organization_id = p_org and aa.artisan_id = p_artisan and aa.creee_par_liste_noire) then
    if exists (select 1 from public.organizations o where o.id = p_org and o.type = 'proprietaire_direct') then
      raise exception 'Cet artisan n’est entré dans votre carnet que par votre liste noire : il ne peut pas y être réactivé. Levez la liste noire, puis invitez-le : il rejoindra votre carnet s’il accepte.';
    end if;
    raise exception 'Cet artisan n’est entré dans votre carnet que par votre liste noire : il ne peut pas y être réactivé. Levez la liste noire, puis ajoutez-le à votre carnet par son SIRET.';
  end if;
  update public.artisan_agences
  set statut = case when p_actif then 'actif' else 'desactive' end::public.artisan_relation_statut$nouveau$;
  c_ancre constant text := $ancre$  update public.artisan_agences
  set statut = case when p_actif then 'actif' else 'desactive' end::public.artisan_relation_statut$ancre$;
begin
  select pg_get_functiondef('public.artisan_statut_local(uuid,uuid,boolean)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'artisan_statut_local : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'artisan_statut_local : garde de la réactivation retirée';
end $retour_arriere$;

-- 3. artisan_lever_blacklist_locale
do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (liste noire sans rattachement, levée) : jamais d'entrée au carnet par la levée, voir 20261014849000.
  delete from public.artisan_agences
   where organization_id = p_org and artisan_id = p_artisan and creee_par_liste_noire;
  if found then return; end if;
  update public.artisan_agences
  set statut = 'actif', blacklist_le = null, blacklist_motif = null,$nouveau$;
  c_ancre constant text := $ancre$  update public.artisan_agences
  set statut = 'actif', blacklist_le = null, blacklist_motif = null,$ancre$;
begin
  select pg_get_functiondef('public.artisan_lever_blacklist_locale(uuid,uuid)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'artisan_lever_blacklist_locale : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'artisan_lever_blacklist_locale : suppression de la ligne créée par la liste noire retirée';
end $retour_arriere$;

-- 2. artisan_blacklist_locale
do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$     -- Relecture du 15/10 (liste noire sans rattachement, création) : la ligne créée ici le dit, voir 20261014849000.
     blacklist_par, purge_motif_le, created_by, creee_par_liste_noire)
  values (p_org, p_artisan, 'desactive', now(), trim(p_motif),
          (select auth.uid()), (current_date + interval '3 years')::date,
          (select auth.uid()), true)$nouveau$;
  c_ancre constant text := $ancre$     blacklist_par, purge_motif_le, created_by)
  values (p_org, p_artisan, 'desactive', now(), trim(p_motif),
          (select auth.uid()), (current_date + interval '3 years')::date,
          (select auth.uid()))$ancre$;
begin
  select pg_get_functiondef('public.artisan_blacklist_locale(uuid,uuid,text)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'artisan_blacklist_locale : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'artisan_blacklist_locale : marque de la ligne créée retirée';
end $retour_arriere$;

do $retour_arriere$
begin
  revoke all on function public.artisan_blacklist_locale(uuid, uuid, text),
    public.artisan_lever_blacklist_locale(uuid, uuid),
    public.artisan_statut_local(uuid, uuid, boolean) from public, anon;
  grant execute on function public.artisan_blacklist_locale(uuid, uuid, text),
    public.artisan_lever_blacklist_locale(uuid, uuid),
    public.artisan_statut_local(uuid, uuid, boolean) to authenticated;
  if to_regprocedure('public.repondre_invitation_artisan(uuid,boolean)') is not null then
    revoke all on function public.repondre_invitation_artisan(uuid, boolean) from public, anon;
    grant execute on function public.repondre_invitation_artisan(uuid, boolean) to authenticated;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014849000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select f.objet,
       case when to_regprocedure(f.signature) is null then 'absente'
            when position(f.marque in pg_get_functiondef(to_regprocedure(f.signature))) > 0 then 'migrée (B)'
            else 'antérieure (A)' end as etat
from (values
  ('artisan_blacklist_locale', 'public.artisan_blacklist_locale(uuid,uuid,text)',
   'Relecture du 15/10 (liste noire sans rattachement, création)'),
  ('artisan_lever_blacklist_locale', 'public.artisan_lever_blacklist_locale(uuid,uuid)',
   'Relecture du 15/10 (liste noire sans rattachement, levée)'),
  ('artisan_statut_local', 'public.artisan_statut_local(uuid,uuid,boolean)',
   'Relecture du 15/10 (liste noire sans rattachement, réactivation)'),
  ('repondre_invitation_artisan', 'public.repondre_invitation_artisan(uuid,boolean)',
   'Relecture du 15/10 (liste noire sans rattachement, acceptation)')) as f(objet, signature, marque);
$instructions_retour$;
end $retour_atomique$;
