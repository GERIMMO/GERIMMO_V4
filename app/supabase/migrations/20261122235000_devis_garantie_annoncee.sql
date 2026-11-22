-- DEVIS : LA GARANTIE ANNONCÉE PAR L'ARTISAN (audit palier 1 du 22/11/2026, P2-02, seconde partie : « garantie de
-- l'intervention affichée »).
--
-- L'ÉCART. Rien, ni sur le devis ni dans le dossier de l'incident, ne disait quelle garantie l'artisan annonce sur son
-- intervention. Quand un problème revient après les travaux, le gestionnaire n'avait aucun repère écrit.
--
-- CE QUE FAIT CETTE MIGRATION.
--   1. `incident_devis.garantie_annoncee` : un texte libre de 300 caractères au plus, facultatif. C'est ce que l'artisan
--      a écrit lui-même sur son devis (« un an, pièces et main-d'œuvre »). Gerimmo le recopie et l'affiche ; Gerimmo ne
--      garantit rien et n'en vérifie pas la portée.
--   2. `envoyer_mon_devis_prepare` : à l'envoi d'un devis préparé dans Gerimmo, la garantie saisie par l'artisan (clé
--      `garantie` de sa saisie validée, celle qui a servi à générer le PDF) est recopiée sur le devis déposé. Le bloc
--      est ajouté juste avant le `return v;` final, par remplacement exact : tout le reste de la fonction est inchangé,
--      et un devis sans garantie suit exactement le chemin d'avant (aucune écriture de plus).
--
--      Espaces, tabulations et retours à la ligne autour du texte sont retirés ; un texte qui n'est fait que de cela
--      ne compte pas pour une garantie.
--
-- CE QUI NE CHANGE PAS : les droits (la colonne se lit avec le devis, donc par le gestionnaire de l'espace ; l'artisan
-- ne lit pas cette table, il relit son devis par ses propres écrans), le dépôt d'un devis en PDF seul
-- (`deposer_devis`, sans garantie), les versions, la signature, les notifications.
-- Les devis déjà déposés gardent une garantie vide : rien n'est déduit ni inventé pour eux.
--
-- Retour arrière : supabase/retours-arriere/20261122235000_devis_garantie_annoncee.retour.sql.

alter table public.incident_devis add column if not exists garantie_annoncee text;

do $contrainte$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.incident_devis'::regclass and conname = 'incident_devis_garantie_annoncee_bornee') then
    alter table public.incident_devis
      add constraint incident_devis_garantie_annoncee_bornee
      check (garantie_annoncee is null
             or (char_length(garantie_annoncee) between 1 and 300
                 and garantie_annoncee = btrim(garantie_annoncee, E' \t\n\r')));
  end if;
end $contrainte$;

comment on column public.incident_devis.garantie_annoncee is
  'P2-02 (22/11/2026) : garantie annoncée par l''artisan sur son devis, recopiée telle quelle (300 caractères au plus). Engagement de l''artisan : Gerimmo ne garantit rien.';

do $migration$
declare d text; ancien text;
begin
  select pg_get_functiondef('public.envoyer_mon_devis_prepare(uuid,integer)'::regprocedure) into d;
  if position('P2-02 garantie annoncée' in d) > 0 then return; end if;
  ancien := $code$  return v;$code$;
  if (length(d) - length(replace(d, ancien, ''))) <> length(ancien) then
    raise exception 'P2-02 garantie annoncée : fin de la fonction d''envoi du devis inattendue';
  end if;
  d := replace(d, ancien, $code$  -- P2-02 garantie annoncée par l'artisan (22/11/2026) : recopiée de sa saisie validée, 300 caractères au plus.
  if nullif(btrim(coalesce(s->>'garantie',''),E' \t\n\r'),'') is not null then
    update public.incident_devis set garantie_annoncee=btrim(left(btrim(s->>'garantie',E' \t\n\r'),300),E' \t\n\r') where id=v;
  end if;
  return v;$code$);
  execute d;
end $migration$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
