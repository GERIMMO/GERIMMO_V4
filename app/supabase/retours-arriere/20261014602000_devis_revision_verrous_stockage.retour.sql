-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014602000_devis_revision_verrous_stockage.sql (décision D18 du 14/10/2026, reprise du 15/10 :
-- dépôt du PDF pendant une révision, ordre des verrous des décisions sur un devis)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définition antérieure de `orgs_de_mes_sollicitations_ouvertes` : celle de 20260927121000 (« envoyée » seule), recopiée.
-- Les trois décisions (`retenir_devis`, `refuser_devis`, `demander_revision_devis`) : le bloc ajouté est retiré par
-- l'opération inverse de la migration (même texte, compté une fois), et le commentaire d'origine reposé. Vérifié sur une
-- copie : après ce retour, les définitions sont identiques à celles d'une base où 20261014601000 vient d'être appliquée.
-- Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014602000_devis_revision_verrous_stockage.retour.sql
--
-- RÉINTRODUIT les deux défauts de la relecture du 15/10 : pendant une révision, l'écran de l'artisan ne peut plus classer
-- le PDF de sa version suivante (l'envoi échoue sauf autre demande « envoyée » ou mission dans la même agence) ; « retenir
-- un devis » et « réviser / refuser » l'autre devis du même dossier peuvent de nouveau s'interbloquer (40P01).
-- Aucune donnée n'est modifiée. Ordre : ce retour AVANT celui de 20261014601000, qui le vérifie.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.

set local lock_timeout = '10s';

-- 1. Le dépôt de PDF de l'artisan ne compte plus que les demandes « envoyée ».
do $retour_arriere$
begin
  if position('reprise du 15/10' in pg_get_functiondef('public.orgs_de_mes_sollicitations_ouvertes()'::regprocedure)) = 0 then
    raise notice 'public.orgs_de_mes_sollicitations_ouvertes() : marque du correctif absente, rien à faire';
    return;
  end if;
  execute $definition_anterieure$
create or replace function public.orgs_de_mes_sollicitations_ouvertes()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct s.organization_id
  from public.incident_sollicitations s
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    and s.statut = 'envoyee';
$$$definition_anterieure$;
  revoke all on function public.orgs_de_mes_sollicitations_ouvertes() from public, anon;
  grant execute on function public.orgs_de_mes_sollicitations_ouvertes() to authenticated, service_role;
  raise notice 'public.orgs_de_mes_sollicitations_ouvertes() : définition antérieure rétablie';
end $retour_arriere$;

-- 2. Les trois décisions reprennent leur ordre de verrou d'avant (devis, puis demande, puis dossier).
do $retour_arriere$
declare
  v_sig text;
  v_def text;
  v_n integer;
  v_bloc constant text := $bloc$-- Décision D18 du 14/10 (reprise du 15/10) : le dossier est verrouillé EN PREMIER, avant tout devis. Toute
  -- décision sur un devis du même dossier attend ici : « retenir A » (qui écrit aussi sur B) ne croise plus « réviser B »
  -- ni « refuser B » (interblocage 40P01 reproduit le 15/10).
  perform 1 from public.incidents
  where organization_id = p_org
    and id = (select x.incident_id from public.incident_devis x where x.id = p_devis and x.organization_id = p_org)
  for update;
  select * into d from public.incident_devis$bloc$;
  v_remplace constant text := '-- Ordre de verrou : dossier, puis devis, puis demande (voir plus haut).';
  v_origine text;
begin
  foreach v_sig in array array['public.retenir_devis(uuid,uuid)',
                               'public.refuser_devis(uuid,uuid,text,uuid)',
                               'public.demander_revision_devis(uuid,uuid,text,uuid)'] loop
    select pg_get_functiondef(v_sig::regprocedure) into v_def;
    if position('Décision D18 du 14/10 (reprise du 15/10)' in v_def) = 0 then
      raise notice '% : marque du correctif absente, rien à faire', v_sig;
      continue;
    end if;
    if (length(v_def) - length(replace(v_def, v_bloc, ''))) <> length(v_bloc) then
      raise exception 'Retour arrière (%) : bloc du correctif introuvable ou répété (définition modifiée depuis) : rien n''est fait', v_sig;
    end if;
    v_def := replace(v_def, v_bloc, 'select * into d from public.incident_devis');
    v_origine := case v_sig
      when 'public.refuser_devis(uuid,uuid,text,uuid)' then
        '-- Ordre de verrou fixe, le même pour toute décision sur un devis : devis, puis sollicitation, puis incident.'
      when 'public.demander_revision_devis(uuid,uuid,text,uuid)' then
        '-- Ordre de verrou fixe, le même que le refus : devis, puis sollicitation, puis incident.'
      end;
    v_n := (length(v_def) - length(replace(v_def, v_remplace, ''))) / length(v_remplace);
    if v_n <> (case when v_origine is null then 0 else 1 end) then
      raise exception 'Retour arrière (%) : commentaire d''ordre des verrous inattendu (% occurrence(s)) : rien n''est fait', v_sig, v_n;
    end if;
    if v_origine is not null then v_def := replace(v_def, v_remplace, v_origine); end if;
    execute v_def;
    raise notice '% : ordre de verrou antérieur rétabli', v_sig;
  end loop;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014602000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
