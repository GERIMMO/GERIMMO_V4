-- RETOUR ARRIÈRE de 20261125106000_type_vendeur_et_vente_sans_mediateur.sql (décisions du 24/11, lot D7 et textes T4,
-- seconde reprise ; relectures T4R-02, T4R-03 et T4R-04).
--
-- REVENIR D'ABORD AU CODE PRÉCÉDENT : le code de ce lot écrit la clé `typeVendeur` (son premier enregistrement de
-- l'identité serait refusé) et lit la colonne de la décision (absente, elle vaut « non prise » : fermé).
--  · Retire la décision « vendre aux particuliers sans médiateur » : droits, déclencheur de datation, fonction, colonne.
--    LA DATE DE LA DÉCISION EST SUPPRIMÉE avec la colonne ; l'historique (supervision_registre) garde chaque prise et
--    chaque retrait. Sous le code précédent, la première souscription d'un particulier sans médiateur dépend de
--    nouveau du seul réglage `blocage_souscription_identite`.
--  · Retire la clé `typeVendeur` de l'identité enregistrée (LE CHOIX DU TYPE DE VENDEUR EST SUPPRIMÉ ; l'historique le
--    garde) et repose la contrainte identite_champs_connus des vingt-cinq clés de 20261019123000. Le retrait ne passe
--    pas par le déclencheur de traçage (une session de maintenance n'a pas d'auteur) : la révision avance d'un cran
--    pour que l'écran recharge. Les treize faits et les coordonnées des prestataires ne sont pas touchés.
-- À jouer AVANT le retour de 20261019123000 (qui repose la contrainte des treize clés d'origine). Rejouable.
do $retour$
begin
  perform set_config('lock_timeout','10s',true);

  revoke select(vente_particuliers_sans_mediateur_le), update(vente_particuliers_sans_mediateur_le)
    on public.supervision_identite from authenticated;
exception when undefined_column then null;
end $retour$;

drop trigger if exists supervision_identite_dater_decision on public.supervision_identite;
drop function if exists public.supervision_identite_dater_decision();
alter table public.supervision_identite drop column if exists vente_particuliers_sans_mediateur_le;

do $retour_type$
declare
  def text;
begin
  perform set_config('lock_timeout','10s',true);

  alter table public.supervision_identite drop constraint if exists identite_type_vendeur_connu;

  if exists (select 1 from public.supervision_identite where singleton and valeurs ? 'typeVendeur') then
    alter table public.supervision_identite disable trigger supervision_identite_trace;
    update public.supervision_identite
      set valeurs = valeurs - 'typeVendeur', revision = revision + 1, modifie_le = now()
      where singleton and valeurs ? 'typeVendeur';
    alter table public.supervision_identite enable trigger supervision_identite_trace;
  end if;

  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid = 'public.supervision_identite'::regclass and conname = 'identite_champs_connus';
  if def like '%''typeVendeur''%' then
    alter table public.supervision_identite drop constraint identite_champs_connus;
    alter table public.supervision_identite add constraint identite_champs_connus check (
      valeurs - array['denomination','forme','capital','siege','rcs','siret','tvaIntracommunautaire','directeurPublication','email','telephone','mediateurNom','mediateurAdresse','mediateurSite','coordonneesSupabase','coordonneesVercel','coordonneesResend','coordonneesStripe','coordonneesZohoSign','coordonneesYousign','coordonneesOpenai','coordonneesScaleway','coordonneesGithub','localisationBan','coordonneesBan','coordonneesMeta']::text[] = '{}'::jsonb
    );
  end if;
end $retour_type$;

select public.fermer_fonctions_a_anon();

-- Registre des migrations (essai de publication « retours » du 25/11/2026, constat RET-01) : la version est retirée
-- en DERNIER, une fois tout le reste joué. Avec `psql -v ON_ERROR_STOP=1 -f`, une erreur plus haut arrête le fichier
-- avant ce bloc : la version reste, et le chantier « Migrations Supabase » ne rejoue pas une migration à moitié
-- défaite. Sans ce bloc, ce chantier refuserait de rejouer la migration (« version déjà enregistrée »).
do $registre$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261125106000';
  end if;
end $registre$;
