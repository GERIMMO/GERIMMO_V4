-- Reprise de la relecture de la fusion du 25/11/2026, constat X-01 — case « mariés ou pacsés » au bail, marque
-- « entrée après la signature » posée par 20261125153000 (A-01). Texte de référence : recueil fourni par le dirigeant (loi
-- du 6 juillet 1989, article 8-1, I et VI), source et version déclarées, non recontrôlé.
--
-- LE DÉFAUT. 20261125153000 pose `bail_personnes.entree_apres_signature` à l'ajout d'une ligne (vraie si le bail n'est
-- plus en brouillon), puis la garde telle quelle. Or un bail actif revient au brouillon par « Corriger » (`devalider_bail`,
-- tant qu'aucun loyer n'est appelé ni encaissé) et repart ensuite signé DE NOUVEAU. La personne ajoutée pendant que le bail
-- était actif (par exemple le vrai conjoint, saisi après une erreur corrigée ensuite au brouillon) gardait la marque alors
-- qu'elle est présente à cette nouvelle signature : à son départ, la fin de solidarité était fixée à six mois, pour elle et
-- pour son garant, sur un bail signé de nouveau qui imprime pourtant la clause des époux ou partenaires.
--
-- CE QUI CHANGE.
--  1. À la sortie du brouillon (dépôt du bail signé, signature électronique, toute activation), la marque est remise à
--     faux pour chaque ligne du bail encore présente (sans date de départ) : ce sont les personnes présentes à cette
--     signature. Déclencheur `baux_epoux_pacses_marques_a_la_signature`, avant la mise à jour de l'état ; il passe après
--     le contrôle des deux locataires (`baux_epoux_pacses_a_la_signature`, ordre des noms) : une activation refusée ne
--     touche à rien.
--  2. Au brouillon, une ligne modifiée par la base porte toujours « faux » (la personne sera présente à la signature à
--     venir) : déclencheur `bail_personnes_epoux_pacses_brouillon`, qui passe après `bail_personnes_epoux_pacses` (celui-ci
--     garde la marque à toute modification). C'est ce qui laisse passer la remise à faux du point 1, et seulement au
--     brouillon : sur un bail signé, la marque reste celle posée à l'ajout. Le client n'a aucun droit de modifier une ligne.
--
-- CE QUI NE CHANGE PAS. La migration n'écrit aucune ligne. Une personne déjà partie garde sa ligne telle quelle (date de
-- départ et date de fin enregistrées). La fonction du départ d'un colocataire n'est pas touchée : elle lit la marque comme
-- avant. Aucune règle de lecture (RLS) n'est touchée, aucun droit n'est ouvert : les deux fonctions de déclencheur ne sont
-- appelables par personne.
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature.retour.sql
-- (à jouer AVANT celui de 20261125153000).

-- ── 1. Au brouillon, une ligne modifiée par la base est celle d'une personne présente à la signature à venir ─────────
create or replace function public.bail_personnes_epoux_pacses_brouillon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entree_apres_signature
     and exists (select 1 from public.baux b where b.id = new.bail_id and b.etat = 'brouillon') then
    new.entree_apres_signature := false;
  end if;
  return new;
end $$;
revoke all on function public.bail_personnes_epoux_pacses_brouillon() from public, anon, authenticated;

drop trigger if exists bail_personnes_epoux_pacses_brouillon on public.bail_personnes;
create trigger bail_personnes_epoux_pacses_brouillon
  before update on public.bail_personnes
  for each row execute function public.bail_personnes_epoux_pacses_brouillon();

-- ── 2. À la sortie du brouillon : les personnes encore au bail sont celles de cette signature ──────────────────────
create or replace function public.marquer_presents_a_la_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.etat = 'brouillon' and new.etat is distinct from 'brouillon' then
    -- Le bail est encore lu « brouillon » ici (avant sa mise à jour) : le déclencheur du point 1 accepte la remise à faux.
    update public.bail_personnes
       set entree_apres_signature = false
     where bail_id = new.id and entree_apres_signature and date_depart is null;
  end if;
  return new;
end $$;
revoke all on function public.marquer_presents_a_la_signature() from public, anon, authenticated;

drop trigger if exists baux_epoux_pacses_marques_a_la_signature on public.baux;
create trigger baux_epoux_pacses_marques_a_la_signature
  before update of etat on public.baux
  for each row
  when (old.etat = 'brouillon' and new.etat is distinct from 'brouillon')
  execute function public.marquer_presents_a_la_signature();

select public.fermer_fonctions_a_anon();
