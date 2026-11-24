-- RETOUR ARRIÈRE de 20261123230000_quittance_adresse_bailleurs.sql (phase 3 de la mission palier 1, lot 48, U07 : la
-- quittance délivrée d'un propriétaire qui gère lui-même imprime l'adresse des bailleurs, comme le PDF).
--
-- Rend à `quittance_document` sa liste des bailleurs d'avant : nom, prénom et représentant d'une société, sans adresse. Même
-- méthode que la migration : la définition EN VIGUEUR est relue, le fragment n'est retiré qu'après vérification de son
-- nombre exact d'occurrences ; une fonction déjà revenue est laissée telle quelle (rejouable) ; une fonction réécrite depuis
-- arrête tout le script, sans rien modifier. Un seul bloc : atomique. Les droits ne changent pas.
--
-- RÉINTRODUIT le défaut : la quittance délivrée associe de nouveau le nom des bailleurs à l'adresse du profil de l'espace (le
-- code de ce lot, sans la clé, revient de lui-même à cette adresse). Aucune donnée n'est modifiée. Les courriels de quittance
-- d'un propriétaire direct préparés avant ce retour et pas encore finalisés sont revalidés (empreinte changée). Peut être joué
-- avant ou après le retour du code. À jouer AVANT le retour de 20261119200200 (représentant d'une société), qui relit la
-- liste des bailleurs telle qu'il l'a laissée.
do $retour$
declare
  c_signature constant text := 'public.quittance_document(uuid)';
  c_avant constant text := $sql$'{}'::jsonb)
        order by p.nom, p.prenom)$sql$;
  c_pose constant text := $sql$'{}'::jsonb)
        -- Phase 3, lot 48 (U07) : chez un propriétaire qui gère lui-même, l'adresse postale du bailleur (sa fiche), que le PDF
        -- de la quittance imprime en en-tête ; rien d'autre, et rien dans un espace d'agence (l'agence émet, à son adresse).
        || case when o.type = 'proprietaire_direct'
                then jsonb_build_object('adresse', p.address_line1, 'code_postal', p.postal_code, 'ville', p.city)
                else '{}'::jsonb end
        order by p.nom, p.prenom)$sql$;
  c_marque constant text := $sql$jsonb_build_object('adresse', p.address_line1$sql$;
  v_oid regprocedure;
  v_def text;
  v_avant integer;
  v_pose integer;
  v_marque integer;
begin
  v_oid := to_regprocedure(c_signature);
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue) ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_avant := (length(v_def) - length(replace(v_def, c_avant, ''))) / length(c_avant);
  v_pose := (length(v_def) - length(replace(v_def, c_pose, ''))) / length(c_pose);
  v_marque := (length(v_def) - length(replace(v_def, c_marque, ''))) / length(c_marque);
  if v_pose = 1 and v_marque = 1 then
    execute replace(v_def, c_pose, c_avant);
    raise notice '% : liste des bailleurs d''avant rétablie (sans adresse)', c_signature;
  elsif v_marque = 0 and v_avant = 1 then
    raise notice '% : déjà revenue à la liste des bailleurs d''avant, rien à faire', c_signature;
  else
    raise exception 'Retour arrière : % contient % fois le fragment de la migration, % fois une adresse de bailleur et % fois la fin de liste d''avant : définition réécrite depuis, rien n''est modifié.',
      c_signature, v_pose, v_marque, v_avant;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261123230000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
