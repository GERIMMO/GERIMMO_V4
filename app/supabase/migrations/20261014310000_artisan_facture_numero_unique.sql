-- Lot « artisan-externe », décision D24-B du dirigeant (14/10/2026), fiche ARC-04 :
-- le numéro d'une facture externe est unique pour un même artisan, sans tenir compte
-- des majuscules ni des espaces autour (« art-2026-0001 » est le doublon de
-- « ART-2026-0001 »). Le module « clients externes » reste désactivé en production.
--
--   1. un index unique sur (artisan_id, lower(btrim(numero))) : le filet de sécurité ;
--   2. un contrôle dans artisan_externe_ecrire, avant l'écriture, qui refuse aussi le
--      numéro d'une facture que Gerimmo a déjà reçue de ce même artisan, avec un message
--      qui dit pourquoi (le texte est repris par l'écran : src/lib/artisan-prive-facture.ts).
--
-- Rien ici ne réécrit une donnée : aucune facture n'est modifiée. Si des numéros en double
-- (casse ou espaces) existaient déjà, la migration s'arrête AVANT de créer l'index et le dit,
-- plutôt que de choisir à la place du dirigeant laquelle des deux factures garder.
-- La fonction est modifiée EN RELISANT sa définition en vigueur (pg_get_functiondef), comme
-- 20261013120000 : une fonction réécrite à la main écraserait les correctifs posés par les
-- migrations voisines. Elle se rejoue sans effet : la marque du correctif est cherchée d'abord.
-- La contrainte unique(artisan_id, numero) d'origine reste en place (l'index la renforce).
-- Retour arrière : supabase/retours-arriere/20261014310000_artisan_facture_numero_unique.retour.sql

-- 1/2. L'index. Les doublons éventuels sont comptés, jamais corrigés.
do $correctif$
declare v_groupes bigint;
begin
  select count(*) into v_groupes from (
    select 1 from public.artisan_factures_externes
    group by artisan_id, lower(btrim(numero)) having count(*) > 1
  ) q;
  if v_groupes > 0 then
    raise exception 'Numéros de facture externes en double (casse ou espaces) : % numéro(s) concerné(s). Aucune donnée n''a été modifiée ; la décision de garder ou de corriger l''une des factures revient au dirigeant (voir la fiche ARC-04).', v_groupes;
  end if;
end $correctif$;

create unique index if not exists artisan_factures_externes_numero_normalise_key
  on public.artisan_factures_externes (artisan_id, lower(btrim(numero)));

-- 2/2. Le contrôle serveur, avant l'écriture de la facture. Même instant, même verrou
-- (l'artisan est sérialisé par pg_advisory_xact_lock dans la fonction) : pas de course possible.
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) into v_def;
  if position('-- >> Audit du 14/10 (ARC-04)' in v_def) > 0 then return; end if;

  v_ancre := $ancre$insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,justification,piece_id) values(a,h.id,d.id,btrim(p_donnees->>'numero')$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif ARC-04 : définition inattendue (l''écriture de la facture est absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$-- >> Audit du 14/10 (ARC-04) : un numéro de facture ne sert qu'une fois pour un même artisan, majuscules et
   -- espaces autour ignorés, que la facture soit externe ou déjà reçue par Gerimmo.
   if exists(select 1 from public.artisan_factures_externes f where f.artisan_id=a and lower(btrim(f.numero))=lower(btrim(p_donnees->>'numero')))
    or exists(select 1 from public.intervention_factures g where g.artisan_id=a and lower(btrim(g.numero))=lower(btrim(p_donnees->>'numero'))) then
    raise exception 'Ce numéro de facture est déjà utilisé dans votre registre (les majuscules et les espaces autour ne comptent pas). Chaque facture doit porter son propre numéro : vérifiez-le sur la pièce jointe.';
   end if;
   -- << Audit du 14/10 (ARC-04)
   $nouveau$ || v_ancre);
  execute v_def;
end $correctif$;

revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public, anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;

select public.fermer_fonctions_a_anon();
