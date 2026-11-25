-- Relecture de la fusion du 25/11/2026, constat A-01 — case « mariés ou pacsés » au bail (décision du dirigeant du
-- 24/11/2026, migration 20261125152000). Texte de référence : recueil fourni par le dirigeant (loi du 6 juillet 1989,
-- article 8-1, I et VI), source et version déclarées, non recontrôlé.
--
-- LE DÉFAUT. 20261125152000 enregistrait une fin de solidarité VIDE pour TOUTE personne qui quitte un bail coché, quelle
-- qu'elle soit. Or l'article 8-1, I ne vise que la location consentie exclusivement à des époux ou à des partenaires de
-- PACS « au moment de la conclusion initiale du contrat », et la décision vise « le départ de l'un d'eux ». Un tiers
-- ajouté au bail après sa signature (par exemple le remplaçant de l'un des époux), ou un troisième locataire ajouté au
-- brouillon avant son activation, gardait lui aussi, avec son garant, une solidarité sans fin : les appels de loyer et
-- les relances continuaient de leur être adressés sans limite.
--
-- CE QUI CHANGE.
--  1. Colonne `bail_personnes.entree_apres_signature` (booléen, faux par défaut, jamais vide) : posée PAR LA BASE à
--     l'ajout d'une ligne, vraie si le bail n'est plus en brouillon (bail signé : la personne n'était pas au bail à sa
--     conclusion). Le client ne la choisit pas : un déclencheur la fixe à l'ajout et la garde à toute modification.
--     Les lignes existantes gardent « faux » : aucune n'est réécrite (aucun bail n'est coché en production, la colonne de
--     la case n'y existe pas encore).
--  2. `enregistrer_depart_colocataire` : sur un bail coché, la fin vide ne vaut plus que pour une personne présente au bail
--     à sa signature (ligne ajoutée au brouillon). Pour une personne entrée après, et pour son garant, la règle de la
--     colocation s'applique, comme sans la case : six mois après la date d'effet du congé, ou cette date en cas de
--     remplacement. Sans la case, rien ne change.
--  3. Cohérence de la case, en base : sur un brouillon coché, l'ajout d'un troisième locataire est refusé (décocher
--     d'abord) ; à la sortie du brouillon (dépôt du bail signé, signature électronique, toute activation), un bail coché
--     doit compter exactement deux locataires (le locataire principal et les colocataires), sinon refus.
--
-- CE QUI NE CHANGE PAS. Aucun départ déjà enregistré n'est réécrit ; aucune autre donnée n'est modifiée. Aucune règle de
-- lecture (RLS) n'est touchée, aucun droit n'est ouvert : la colonne suit les droits de la table ; les deux fonctions de
-- déclencheur ne sont appelables par personne. `enregistrer_depart_colocataire` garde SECURITY DEFINER, son chemin de
-- recherche vide, ses droits et sa signature ; elle est relue dans sa définition EN VIGUEUR : le bloc de 20261125152000
-- est attendu une fois ; déjà complété (rejeu) : rien à faire ; toute autre forme arrête la migration sans rien modifier.
-- QUESTION AU JURISTE (non tranchée ici, option la plus prudente pour le locataire retenue) : quel est le statut d'un
-- tiers entré au bail des époux après sa signature ?
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125153000_bail_epoux_pacses_personnes_a_la_signature.retour.sql
-- (à jouer AVANT celui de 20261125152000, qui refuse une fonction réécrite depuis).

alter table public.bail_personnes add column if not exists entree_apres_signature boolean not null default false;
comment on column public.bail_personnes.entree_apres_signature is
  'Posée par la base à l''ajout de la ligne (relecture de la fusion du 25/11/2026, A-01) : vraie si le bail n''était plus en brouillon, la personne n''était donc pas au bail à sa signature. Sur un bail coché « mariés ou pacsés », seule une personne présente à la signature quitte le bail sans date de fin de solidarité ; pour une personne entrée après, et son garant, la règle de la colocation s''applique.';

-- ── 1. La ligne d'une personne : marque posée par la base, troisième locataire refusé sur un brouillon coché ─────────
create or replace function public.bail_personnes_epoux_pacses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bail record;
  v_nombre integer;
begin
  select b.etat, b.locataire_principal, b.locataires_epoux_pacses into v_bail from public.baux b where b.id = new.bail_id;
  if tg_op = 'INSERT' or new.bail_id is distinct from old.bail_id then
    new.entree_apres_signature := coalesce(v_bail.etat <> 'brouillon', false);
  else
    new.entree_apres_signature := old.entree_apres_signature;
  end if;
  if new.role = 'colocataire' and v_bail.etat = 'brouillon' and coalesce(v_bail.locataires_epoux_pacses, false) then
    select count(distinct p) into v_nombre from (
      select v_bail.locataire_principal as p
      union all select bp.person_id from public.bail_personnes bp
       where bp.bail_id = new.bail_id and bp.role = 'colocataire' and bp.id <> new.id
      union all select new.person_id) x
     where p is not null;
    if v_nombre > 2 then
      raise exception 'La case « mariés ou pacsés » est cochée : ce bail est consenti à deux personnes, mariées ou pacsées l''une à l''autre. Décochez-la avant d''ajouter un troisième locataire';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.bail_personnes_epoux_pacses() from public, anon, authenticated;

drop trigger if exists bail_personnes_epoux_pacses on public.bail_personnes;
create trigger bail_personnes_epoux_pacses
  before insert or update on public.bail_personnes
  for each row execute function public.bail_personnes_epoux_pacses();

-- ── 2. À la sortie du brouillon : un bail coché compte exactement deux locataires ──────────────────────────────────
create or replace function public.controler_epoux_pacses_a_la_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_nombre integer;
begin
  if old.etat = 'brouillon' and new.etat is distinct from 'brouillon' and coalesce(new.locataires_epoux_pacses, false) then
    select count(distinct p) into v_nombre from (
      select new.locataire_principal as p
      union all select bp.person_id from public.bail_personnes bp where bp.bail_id = new.id and bp.role = 'colocataire') x
     where p is not null;
    if v_nombre <> 2 then
      raise exception 'Mise en location refusée : la case « mariés ou pacsés » est cochée et le bail compte % locataire(s) ; elle ne vaut que pour un bail consenti à deux personnes, mariées ou pacsées l''une à l''autre. Décochez-la ou corrigez les locataires dans le brouillon, puis réessayez', v_nombre;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.controler_epoux_pacses_a_la_signature() from public, anon, authenticated;

drop trigger if exists baux_epoux_pacses_a_la_signature on public.baux;
create trigger baux_epoux_pacses_a_la_signature
  before update of etat on public.baux
  for each row execute function public.controler_epoux_pacses_a_la_signature();

-- ── 3. Le départ : fin vide seulement pour une personne présente à la signature ────────────────────────────────────
do $epoux_pacses_signature$
declare
  c_signature constant text := 'public.enregistrer_depart_colocataire(uuid,date,uuid)';
  c_ancrage constant text := $a$  if coalesce((select b.locataires_epoux_pacses from public.baux b where b.id = v.bail_id), false) then
    v_fin := null;
  end if;$a$;
  c_nouveau constant text := $n$  -- Relecture de la fusion du 25/11/2026 (A-01) : seulement pour une personne présente au bail à sa signature
  -- (article 8-1, I : « au moment de la conclusion initiale du contrat ») ; une personne entrée après, et son garant,
  -- gardent la règle de la colocation (six mois, ou la date du remplacement).
  if coalesce((select b.locataires_epoux_pacses from public.baux b where b.id = v.bail_id), false)
     and not v.entree_apres_signature then
    v_fin := null;
  end if;$n$;
  definition text;
  corps text;
  occurrences integer;
begin
  select pg_get_functiondef(p.oid), p.prosrc into definition, corps
    from pg_proc p where p.oid = to_regprocedure(c_signature) and p.prosecdef;
  if corps is null then
    raise exception 'Case « mariés ou pacsés », personnes à la signature : fonction % introuvable ou inattendue ; rien n''est modifié', c_signature;
  end if;
  -- Déjà appliquée (rejeu) : rien à faire.
  if position('entree_apres_signature' in corps) > 0 then
    return;
  end if;
  occurrences := (length(corps) - length(replace(corps, c_ancrage, ''))) / length(c_ancrage);
  if occurrences <> 1 then
    raise exception 'Case « mariés ou pacsés », personnes à la signature : définition inattendue pour % (% occurrence(s) du bloc de 20261125152000) ; rien n''est modifié', c_signature, occurrences;
  end if;
  execute replace(definition, corps, replace(corps, c_ancrage, c_nouveau));
end $epoux_pacses_signature$;

select public.fermer_fonctions_a_anon();
