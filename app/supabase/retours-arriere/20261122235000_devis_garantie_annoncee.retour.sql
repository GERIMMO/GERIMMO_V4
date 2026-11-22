-- RETOUR ARRIÈRE de 20261122235000_devis_garantie_annoncee.sql (audit palier 1, P2-02 : garantie annoncée par
-- l'artisan sur son devis).
--
-- Retire de `envoyer_mon_devis_prepare` le bloc qui recopie la garantie, par remplacement exact : la fonction redevient
-- mot pour mot celle d'avant. La colonne `incident_devis.garantie_annoncee` et sa contrainte RESTENT, avec ce qui a
-- déjà été écrit : aucun devis n'est modifié, aucune garantie annoncée n'est effacée. Après le retour de
-- l'application, plus aucun écran ne lit ni n'écrit cette colonne.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente, et AVANT tout retour d'une migration plus
-- ancienne qui touche la même fonction. Rejouable : si le bloc n'y est plus, rien n'est fait.
do $retour$
declare d text; bloc text;
begin
  select pg_get_functiondef('public.envoyer_mon_devis_prepare(uuid,integer)'::regprocedure) into d;
  bloc := $code$  -- P2-02 garantie annoncée par l'artisan (22/11/2026) : recopiée de sa saisie validée, 300 caractères au plus.
  if nullif(btrim(coalesce(s->>'garantie',''),E' \t\n\r'),'') is not null then
    update public.incident_devis set garantie_annoncee=btrim(left(btrim(s->>'garantie',E' \t\n\r'),300),E' \t\n\r') where id=v;
  end if;
$code$;
  if position('P2-02 garantie annoncée' in d) > 0 then
    if (length(d) - length(replace(d, bloc, ''))) <> length(bloc) then
      raise exception 'Retour P2-02 garantie annoncée : bloc inattendu dans la fonction d''envoi du devis, rien n''est modifié';
    end if;
    execute replace(d, bloc, '');
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261122235000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
