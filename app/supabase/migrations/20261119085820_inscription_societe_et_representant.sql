-- Nouvelles inscriptions uniquement : la fiche titulaire reste celle associée
-- au compte de gestion (utilisée par creer_bien_verifie). Pour une société,
-- son nom n'est jamais celui de la personne qui ouvre le compte.
-- Aucun titulaire, contrat, document ou pouvoir historique n'est réaffecté.
do $correction$
declare definition text; avant text; apres text;
begin
 definition := pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure);
 avant := '  v_qualite text;';
 if position(avant in definition)=0 then raise exception 'Initialisation propriétaire inattendue'; end if;
 definition := replace(definition, avant, avant || E'\n  v_societe text;');
 avant := '  if v_nom is null then';
 apres := $sql$
  if v_qualite in ('SCI','SCI familiale','Personne morale') then
    select nullif(btrim(raw_user_meta_data->>'raison_sociale'),'') into v_societe
      from auth.users where id=v_uid;
    if v_societe is null or length(v_societe)>100 then
      raise exception 'Renseignez le nom de votre société (100 caractères au plus), distinct de votre nom.';
    end if;
  end if;
  if v_nom is null then$sql$;
 if position(avant in definition)=0 then raise exception 'Contrôle identité inattendu'; end if;
 definition := replace(definition, avant, apres);
 avant := $sql$'Parc de ' || coalesce(v_prenom || ' ', '') || v_nom$sql$;
 if position(avant in definition)=0 then raise exception 'Nom organisation inattendu'; end if;
 definition := replace(definition, avant, 'coalesce(v_societe, ' || avant || ')');
 avant := $sql$    values (v_org, v_uid, v_nom, v_prenom, v_email, v_telephone,
            v_adresse, v_cp, v_ville, coalesce(v_qualite, 'Personne physique'));$sql$;
 apres := $sql$    values (v_org, v_uid, coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, case when v_societe is null then v_email end, v_telephone,
            v_adresse, v_cp, v_ville, coalesce(v_qualite, 'Personne physique'));
    if v_societe is not null then
      -- Personne candidate au pouvoir : aucun droit de signature automatique.
      -- Le justificatif et la confirmation propres à chaque bail restent exigés.
      insert into public.persons(organization_id,nom,prenom,email,telephone,qualite)
      values(v_org,v_nom,v_prenom,v_email,v_telephone,'Personne physique');
    end if;$sql$;
 if position(avant in definition)=0 then raise exception 'Création titulaire inattendue'; end if;
 definition := replace(definition, avant, apres);
 execute definition;
end $correction$;

notify pgrst, 'reload schema';
