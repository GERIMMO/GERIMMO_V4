-- Décisions du 24/11, lot D7 et textes T4, seconde reprise (24/11/2026) — relectures T4R-02, T4R-03 et T4R-04.
--
-- 1. LE TYPE DE VENDEUR SE CHOISIT (T4R-03, T4R-04). Le code devinait « entrepreneur individuel » dans le champ libre
--    « Forme juridique » : « Auto-entreprise » ou « Artisan » échappaient au contrôle de la mention « EI »,
--    « E.I.R.L. » ou « SAS (ex-entreprise individuelle) » y tombaient à tort. L'identité porte désormais une clé
--    `typeVendeur`, choisie dans une liste : « entrepreneur_individuel » ou « personne_morale ». La contrainte
--    identite_champs_connus (liste FERMÉE de clés) s'ouvre à cette vingt-sixième clé, ajoutée en dernier ; une seconde
--    contrainte n'admet que les deux valeurs (ou l'absence de choix). Aucune valeur écrite : tant que le choix n'est
--    pas fait dans /admin/parametres, les ventes restent fermées (src/lib/editeur.ts, defautsVendeur).
--
-- 2. VENDRE AUX PARTICULIERS SANS MÉDIATEUR EST UNE DÉCISION À PART, DATÉE (T4R-02). Le commit précédent faisait porter
--    cette décision par le réglage existant `blocage_souscription_identite` : une levée enregistrée AVANT ce lot (elle
--    ne visait alors que les hausses de capacité) aurait ouvert d'office, au déploiement, la première souscription
--    d'un particulier sans médiateur. Nouvelle colonne `vente_particuliers_sans_mediateur_le`, VIDE par défaut : elle
--    n'existait pas avant, donc aucune décision antérieure ne peut l'avoir remplie. La date est posée par la base
--    (déclencheur ci-dessous), jamais par le navigateur. Le réglage existant n'est pas modifié.
--    Mêmes protections que les deux autres réglages : règle d'accès identite_admin (super-administrateur permanent,
--    second facteur), contrôle de révision et historique de supervision_tracer_modification (la ligne entière est
--    journalisée, cette colonne comprise). Droits par colonne pour les comptes connectés seulement ; rien pour anon.
--
-- À appliquer AVANT le code : sans la clé, l'enregistrement de l'identité est refusé (message « migration à appliquer »
-- de l'écran) ; sans la colonne, la décision est lue « non prise » (fermé par défaut).
-- Rejouable ; une contrainte d'une autre forme arrête la migration sans rien modifier.
-- Retour arrière : supabase/retours-arriere/20261125106000_type_vendeur_et_vente_sans_mediateur.retour.sql
-- À SAVOIR : le retour de 20261019123000 repose la contrainte des treize clés d'origine ; le retour de cette migration
-- se joue avant lui.
do $type_vendeur$
declare
  def text;
begin
  perform set_config('lock_timeout','10s',true);

  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid = 'public.supervision_identite'::regclass and conname = 'identite_champs_connus';
  if def is null then
    raise exception 'Identité : contrainte identite_champs_connus absente, aucune réécriture';
  end if;
  if def like '%''typeVendeur''%' then
    -- Déjà migrée : la liste doit alors être complète.
    if def not like '%''coordonneesMeta''%' or def not like '%''denomination''%' then
      raise exception 'Identité : contrainte identite_champs_connus d''une forme inattendue, aucune réécriture';
    end if;
  elsif def like '%''coordonneesMeta''%' and def like '%''localisationBan''%' and def like '%''mediateurSite''%' then
    alter table public.supervision_identite drop constraint identite_champs_connus;
    alter table public.supervision_identite add constraint identite_champs_connus check (
      valeurs - array['denomination','forme','capital','siege','rcs','siret','tvaIntracommunautaire','directeurPublication','email','telephone','mediateurNom','mediateurAdresse','mediateurSite','coordonneesSupabase','coordonneesVercel','coordonneesResend','coordonneesStripe','coordonneesZohoSign','coordonneesYousign','coordonneesOpenai','coordonneesScaleway','coordonneesGithub','localisationBan','coordonneesBan','coordonneesMeta','typeVendeur']::text[] = '{}'::jsonb
    );
  else
    raise exception 'Identité : contrainte identite_champs_connus d''une forme inattendue, aucune réécriture';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.supervision_identite'::regclass and conname = 'identite_type_vendeur_connu') then
    alter table public.supervision_identite add constraint identite_type_vendeur_connu check (
      coalesce(jsonb_typeof(valeurs -> 'typeVendeur'), 'null') = 'null'
      or (jsonb_typeof(valeurs -> 'typeVendeur') = 'string'
          and valeurs ->> 'typeVendeur' in ('entrepreneur_individuel', 'personne_morale'))
    );
  end if;
end $type_vendeur$;

alter table public.supervision_identite
  add column if not exists vente_particuliers_sans_mediateur_le timestamptz;

comment on column public.supervision_identite.vente_particuliers_sans_mediateur_le is
  'Date à laquelle le superadmin a décidé de vendre aux particuliers alors qu''aucun médiateur de la consommation n''est saisi ; vide : décision non prise ou retirée (première souscription d''un particulier fermée tant que le médiateur manque). Date posée par la base. Distincte de blocage_souscription_identite (hausses de capacité).';

-- La date de la décision est celle de la base : ce que le navigateur envoie ne sert qu'à dire « prise » ou « retirée ».
-- Le déclencheur passe avant supervision_identite_trace (ordre alphabétique des noms) : l'historique enregistre la date
-- de la base.
create or replace function public.supervision_identite_dater_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vente_particuliers_sans_mediateur_le is not null
     and new.vente_particuliers_sans_mediateur_le is distinct from old.vente_particuliers_sans_mediateur_le then
    new.vente_particuliers_sans_mediateur_le := now();
  end if;
  return new;
end $$;
revoke all on function public.supervision_identite_dater_decision() from public, anon, authenticated;

drop trigger if exists supervision_identite_dater_decision on public.supervision_identite;
create trigger supervision_identite_dater_decision
  before update on public.supervision_identite
  for each row execute function public.supervision_identite_dater_decision();

-- La règle d'accès identite_admin exige déjà is_permanent_super_admin() en USING ET WITH CHECK ; aucun droit pour anon.
grant select(vente_particuliers_sans_mediateur_le), update(vente_particuliers_sans_mediateur_le)
  on public.supervision_identite to authenticated;

select public.fermer_fonctions_a_anon();
