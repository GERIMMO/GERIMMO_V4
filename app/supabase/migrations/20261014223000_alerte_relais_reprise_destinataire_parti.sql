-- D09 (audit du 13 octobre 2026, fiche SUP-03), relecture : la reprise d'une alerte de relais dont le
-- destinataire ne peut plus agir ne dépend plus du STATUT de l'alerte.
--
-- Constat (reproduit en base jetable). 20261014221000 réserve l'accusé de réception au destinataire et
-- n'autorise la reprise par un autre superviseur permanent que pour le statut « non_acheminee ». Or
-- `traiter_vacances` ne requalifie une alerte en « non_acheminee » que dans la branche où le RESPONSABLE
-- du plan n'est plus habilité. Un plan est créé par C et confié à R ; son alerte est escaladée (statut
-- « escalade », destinataire = C) ; C perd ensuite son habilitation alors que R reste habilité : l'alerte
-- reste « escalade » et nul ne peut plus l'accuser — ni R, ni un tiers. Avant le lot, un tiers le pouvait.
--
-- Règle posée ici : on accuse une alerte quand on en est le destinataire, OU quand son destinataire n'est
-- plus habilité (il ne peut plus la voir ni agir : la console lui est fermée). Peu importe son statut
-- (ouverte, escaladée, non acheminée). Un destinataire encore habilité reste seul à pouvoir l'accuser.
--
-- ÉCART À D09-A, À FAIRE RATIFIER PAR LE DIRIGEANT. L'option A recommande « seul le destinataire (ou, après
-- escalade, la personne vers qui elle est escaladée) ». Prise à la lettre, elle laisse sans issue toute alerte
-- dont ce destinataire a perdu son habilitation : elle resterait visible à jamais, sans personne pour la fermer.
-- Cette reprise est donc la seule exception, et elle ne concerne que des alertes dont le destinataire ne peut
-- plus rien faire ; elle n'ouvre pas l'accusé d'une urgence à quelqu'un d'autre tant que son destinataire
-- peut la lire. Si le dirigeant la refuse, retirer cette migration par son script de retour arrière : les
-- alertes concernées resteront ouvertes, à régler à la main en base.
--
-- Rien ici ne touche une ligne existante, aucune table, aucun droit. La fonction est modifiée EN RELISANT sa
-- définition en vigueur (pg_get_functiondef), comme le fait 20261013120000 : une réécriture à la main
-- écraserait une garde qu'une autre migration y aurait injectée. Si la définition n'est pas celle attendue,
-- la migration s'arrête. Elle se rejoue sans effet : le bloc cherche la marque de son correctif dans la
-- définition en vigueur et ne fait alors rien. La marque de 20261014221000 reste dans la définition : son
-- propre retour arrière fonctionne encore (à jouer APRÈS celui-ci).
--
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration. Retour arrière :
-- app/supabase/retours-arriere/20261014223000_alerte_relais_reprise_destinataire_parti.retour.sql.

do $correctif$
declare v_def text;
begin
  select pg_get_functiondef('public.accuser_alerte_vacances(uuid)'::regprocedure) into v_def;
  if position('Audit du 14/10 (SUP-03, reprise)' in v_def) > 0 then return; end if;
  if position('Audit du 14/10 (SUP-03)' in v_def) = 0 then
    raise exception 'Correctif SUP-03 (reprise) : 20261014221000 doit être appliquée avant (définition inattendue)';
  end if;

  if (length(v_def) - length(replace(v_def, $ancre$and (destinataire=auth.uid() or (statut='non_acheminee' and not public.responsable_supervision_habilite(destinataire)));$ancre$, '')))
     <> length($ancre$and (destinataire=auth.uid() or (statut='non_acheminee' and not public.responsable_supervision_habilite(destinataire)));$ancre$) then
    raise exception 'Correctif SUP-03 (reprise) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, $ancre$and (destinataire=auth.uid() or (statut='non_acheminee' and not public.responsable_supervision_habilite(destinataire)));$ancre$, $nouveau$-- Audit du 14/10 (SUP-03, reprise) : relecture de D09. Le destinataire accuse ; si le destinataire n'est
  -- plus habilité (il ne peut plus agir), un autre superviseur permanent reprend l'alerte, quel que soit son
  -- statut (ouverte, escaladée, non acheminée) : sans cela une alerte escaladée vers un créateur parti ne se
  -- fermerait jamais. Écart à D09-A, présenté au dirigeant.
  and (destinataire=auth.uid() or not public.responsable_supervision_habilite(destinataire));$nouveau$);

  execute v_def;
end $correctif$;

select public.fermer_fonctions_a_anon();
