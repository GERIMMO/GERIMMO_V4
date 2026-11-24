-- Décisions du 24/11, lot D4 (reprise) — relecture D4R, défauts D4R-01 et D4R-03.
--
-- 1. D4R-01 — `accepter_cgu` enregistrait un accord aux conditions clients pour n'importe quelle version, archivée ou
--    non (« 2099-01-01 » passait), donc sans empreinte du texte. Appelée directement par un compte connecté, elle
--    contournait le refus « version non archivée » de l'action serveur, et la ligne valait ensuite preuve d'accord.
--    Désormais, pour la source « compte » et le document `conditions_clients`, la version doit être ARCHIVÉE
--    (`versions_conditions`) : sinon refus (22023), rien n'est écrit. Inchangé : les conditions de l'espace artisan, les
--    règles des espaces invités, la source « espace_proprietaire » (ouverture d'un espace propriétaire) et l'inscription
--    (déclencheur de auth.users, qui n'appelle pas cette fonction). Ces accords-là restent enregistrés tels quels ; une
--    ligne sans empreinte ne compte plus comme preuve côté application (lib/garde-souscription-serveur.ts).
--    Mêmes droits qu'avant (authenticated ; ni public, ni anon) ; SECURITY DEFINER et search_path vide conservés.
--    CONSÉQUENCE À CONNAÎTRE : tant que la version en vigueur n'est pas archivée, la case des conditions clients
--    (souscription, inscription d'un propriétaire après invitation, accord à une nouvelle version) est refusée. Geste
--    du jour de publication : déployer le code, archiver la version en vigueur, PUIS appliquer cette migration (notes
--    du lot D4, reprise, R5) ; le code est correct sans elle.
--
-- 2. D4R-03 — une relance de loyer envoyée à la main (contexte `relance_loyer_manuelle`) n'a plus de reprise autonome,
--    comme avant le lot D4 : la consigne au bail (`relances`) n'est écrite que par l'action du propriétaire, après un
--    envoi réussi. Une reprise par la tâche des courriels l'aurait envoyée sans trace au bail. Un déclencheur pose
--    `reprise_autonome = false` et efface la copie chiffrée dès que ce contexte est attaché ; le propriétaire renvoie
--    lui-même s'il le faut (même clé d'envoi : jamais deux e-mails). Les autres types ne changent pas.
--
-- D4R-04 (`demander_periodicite_suivante` appelable sans accord) n'est PAS traité ici : la base ne connaît pas la
-- déclaration des versions (conditions-versions.json : « nouvelles souscriptions uniquement », « au prochain acte »),
-- une garde en base refuserait des changements que l'application admet. Écrit dans les notes du lot.
--
-- Rejouable (CREATE OR REPLACE, DROP … IF EXISTS). `accepter_cgu` n'est remplacée que si sa définition est celle de
-- 20261024090000 ou déjà celle-ci (sinon arrêt, en nommant la fonction). Ne cite pas la fonction du jour de Paris ;
-- n'est pas un maillon de la chaîne des e-mails (aucune tête réécrite).
-- Retour : supabase/retours-arriere/20261125150000_accord_conditions_version_archivee.retour.sql — à jouer AVANT le
-- retour de 20261024090000 (qui retire `accepter_cgu(text, text, text)`). Rejouer 20261024090000 après celle-ci rend
-- à `accepter_cgu` son texte sans le refus : rejouer ensuite celle-ci.

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

do $garde$
declare v_def text;
begin
  if to_regprocedure('public.accepter_cgu(text, text, text)') is null then
    raise exception 'accepter_cgu(text, text, text) absente : appliquer d''abord 20261024090000';
  end if;
  v_def := pg_get_functiondef('public.accepter_cgu(text, text, text)'::regprocedure);
  if strpos(v_def, $a$insert into public.acceptations_cgu (account_id, version, source, document)$a$) = 0
     or strpos(v_def, $a$Document des conditions invalide pour un espace propriétaire$a$) = 0 then
    raise exception 'accepter_cgu(text, text, text) : définition inattendue, remplacement refusé';
  end if;
end $garde$;

create or replace function public.accepter_cgu(
  p_version text,
  p_source text default 'compte',
  p_document text default 'conditions_clients'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_source text := case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  if p_document is null or p_document not in ('conditions_clients', 'conditions_artisans', 'regles_invites') then
    raise exception 'Document des conditions invalide' using errcode = '22023';
  end if;
  -- L'ouverture d'un espace propriétaire fait accepter les conditions clients, rien d'autre.
  if p_source = 'espace_proprietaire' and p_document <> 'conditions_clients' then
    raise exception 'Document des conditions invalide pour un espace propriétaire' using errcode = '22023';
  end if;
  -- Lot D4, reprise (D4R-01) : l'accord d'un compte aux conditions clients porte sur une version ARCHIVÉE, dont la
  -- base recopie l'empreinte sur la ligne. Une version absente de l'archive n'est pas enregistrée.
  if v_source = 'compte' and p_document = 'conditions_clients'
     and not exists (select 1 from public.versions_conditions v
                      where v.document = 'conditions_clients' and v.version = btrim(p_version)) then
    raise exception 'Version des conditions non archivée : accord non enregistré' using errcode = '22023';
  end if;
  insert into public.acceptations_cgu (account_id, version, source, document)
  values (v_uid, btrim(p_version), v_source, p_document);
end $$;
revoke execute on function public.accepter_cgu(text, text, text) from public, anon;
grant execute on function public.accepter_cgu(text, text, text) to authenticated;

-- D4R-03 : la relance de loyer envoyée à la main ne se reprend jamais d'elle-même.
create or replace function public.courriels_relance_manuelle_sans_reprise()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reprise_autonome := false;
  new.charge_chiffree := null;
  return new;
end $$;
revoke execute on function public.courriels_relance_manuelle_sans_reprise() from public, anon, authenticated;

drop trigger if exists relance_loyer_manuelle_sans_reprise on public.courriels_durables;
create trigger relance_loyer_manuelle_sans_reprise
  before insert or update on public.courriels_durables
  for each row
  when (new.contexte_metier ->> 'type' = 'relance_loyer_manuelle')
  execute function public.courriels_relance_manuelle_sans_reprise();

-- Une relance à la main déjà en file (interrupteur ouvert entre 20261125110000 et celle-ci) suit la même règle.
update public.courriels_durables set reprise_autonome = false, charge_chiffree = null
 where contexte_metier ->> 'type' = 'relance_loyer_manuelle' and (reprise_autonome or charge_chiffree is not null);

select public.fermer_fonctions_a_anon();
