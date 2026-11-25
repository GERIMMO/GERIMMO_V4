-- Décisions du 24/11, lot D4 (reprise) — relecture D4R, défauts D4R-01 et D4R-03. RÉÉCRITE le 25/11/2026 (relecture
-- de la fusion, constat R-01) : cette migration n'a jamais été appliquée en production ; elle est modifiée en place.
--
-- 1. D4R-01 / R-01 — la preuve d'accord aux conditions clients. `accepter_cgu` enregistrait un accord pour n'importe
--    quelle version, archivée ou non (« 2099-01-01 » passait), donc parfois sans empreinte du texte ; la ligne pouvait
--    ensuite valoir accord. La PREMIÈRE écriture de cette migration faisait REFUSER par `accepter_cgu` toute version non
--    archivée. Sur une base neuve (CI, banc, préproduction reconstruite), le choix du premier mot de passe d'un
--    propriétaire échouait donc ; en production, chaque future version des conditions aurait fermé les inscriptions
--    jusqu'à son archivage, refusé dès qu'il existe un abonné actif. RÈGLE RETENUE, sûre dans toutes les positions de
--    publication : `accepter_cgu` ENREGISTRE l'accord comme avant (texte exact de 20261024090000 : une version non
--    archivée s'écrit sans empreinte) ; SEULE une ligne qui porte l'empreinte du texte archivé — recopiée par la base,
--    déclencheur `acceptations_cgu_empreinte`, jamais par le client — vaut preuve d'accord à une version :
--      · côté application, `preuveConditionsEnVigueur` (lib/garde-souscription-serveur.ts) le fait déjà ;
--      · côté base, `abonnements_sans_accord_conditions(p_version)`, qui décide la non-reconduction faute d'accord exprès,
--        ne compte plus qu'un accord dont l'empreinte est celle de la version archivée (réécrite ci-dessous). Une ligne
--        forgée — version devinée et « acceptée » avant son archivage, par n'importe quelle voie (compte, ouverture d'un
--        espace propriétaire, inscription) — ne vaut donc plus accord et ne masque pas l'absence d'accord réel.
--    La preuve d'une commande (`lier_preuve_commande`) n'est pas touchée : elle ne se lie que par le traitement (clé de
--    service), à partir du journal que le serveur écrit après `preuveConditionsEnVigueur` (empreinte exigée).
--    Si la première écriture de cette migration avait été jouée (banc), `accepter_cgu` retrouve ici le texte du 24/10.
--    Mêmes droits qu'avant pour les deux fonctions ; SECURITY DEFINER et search_path vide conservés.
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
-- POSITION DANS LA PUBLICATION : aucune contrainte propre (relecture de la fusion, R-01). `accepter_cgu` est la même
-- avant et après cette migration ; la non-reconduction n'est appelée que pour une version archivée qui exige l'accord
-- exprès (lib/non-reconduction-conditions.ts). Elle suit la règle générale : toutes les migrations avant le code.
--
-- Rejouable (CREATE OR REPLACE, DROP … IF EXISTS). Chaque fonction n'est remplacée que si sa définition est celle
-- attendue (sinon arrêt, en nommant la fonction). Ne cite pas la fonction du jour de Paris ; n'est pas un maillon de la
-- chaîne des e-mails (aucune tête réécrite).
-- Retour : supabase/retours-arriere/20261125150000_accord_conditions_version_archivee.retour.sql — à jouer AVANT les
-- retours de 20261024100000 (qui retire `abonnements_sans_accord_conditions`) et de 20261024090000 (qui retire
-- `accepter_cgu(text, text, text)`). Rejouer 20261024100000 après celle-ci rend à la non-reconduction son texte d'avant :
-- rejouer alors celle-ci.

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. accepter_cgu : le texte du 24/10, dans toutes les positions ─────────────────────────────────────────────────
do $accepter$
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
  -- Texte du 24/10 en place (cas ordinaire, production comprise) : rien à faire.
  if strpos(v_def, $a$Version des conditions non archivée$a$) = 0 then
    return;
  end if;
  -- La première écriture de cette migration avait été jouée : le texte exact de 20261024090000 est reposé.
  execute $sql$
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
declare v_uid uuid := (select auth.uid());
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
  insert into public.acceptations_cgu (account_id, version, source, document)
  values (v_uid, btrim(p_version),
          case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end,
          p_document);
end $$;
  $sql$;
  revoke execute on function public.accepter_cgu(text, text, text) from public, anon;
  grant execute on function public.accepter_cgu(text, text, text) to authenticated;
end $accepter$;

-- ── 2. La non-reconduction ne compte qu'un accord prouvé par l'empreinte du texte archivé ──────────────────────────
do $garde_non_reconduction$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('public.abonnements_sans_accord_conditions(text)') and p.prosecdef;
  if v_src is null then
    raise exception 'abonnements_sans_accord_conditions(text) absente ou inattendue : appliquer d''abord 20261024100000';
  end if;
  -- Le texte de 20261024100000 (dernière condition « c.version = btrim(p_version)) ») ou déjà celui-ci.
  if strpos(v_src, $a$and c.version = btrim(p_version))$a$) = 0 and strpos(v_src, $a$c.empreinte_sha256 = v.empreinte_sha256$a$) = 0 then
    raise exception 'abonnements_sans_accord_conditions(text) : définition inattendue, remplacement refusé';
  end if;
end $garde_non_reconduction$;

create or replace function public.abonnements_sans_accord_conditions(p_version text)
returns table (organization_id uuid, organisation text, stripe_subscription_id text, periode_fin timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  return query
    select a.organization_id, o.name::text, a.stripe_subscription_id, a.periode_fin
      from public.abonnements a
      join public.organizations o on o.id = a.organization_id
     where a.stripe_subscription_id is not null
       and not coalesce(a.annulation_demandee, false)
       and coalesce(a.stripe_statut, '') in ('active', 'trialing', 'past_due', 'unpaid')
       and o.status <> 'archivee'
       -- Au moins un responsable a accepté une version des conditions clients : l'écran a pu lui être montré.
       and exists (
         select 1
           from public.memberships m
           join public.acceptations_cgu c on c.account_id = m.account_id
          where m.organization_id = a.organization_id
            and m.status = 'active'
            and m.role in ('admin_agence', 'proprietaire_direct')
            and c.document = 'conditions_clients')
       -- Aucun responsable n'a accepté cette version, ACCORD PROUVÉ : la ligne porte l'empreinte du texte archivé de
       -- cette version (relecture de la fusion, R-01). Une ligne sans empreinte — version non archivée au moment de
       -- l'accord, ligne forgée par un appel direct — ne vaut pas accord.
       and not exists (
         select 1
           from public.memberships m
           join public.acceptations_cgu c on c.account_id = m.account_id
           join public.versions_conditions v on v.document = 'conditions_clients' and v.version = c.version
          where m.organization_id = a.organization_id
            and m.status = 'active'
            and m.role in ('admin_agence', 'proprietaire_direct')
            and c.document = 'conditions_clients'
            and c.version = btrim(p_version)
            and c.empreinte_sha256 = v.empreinte_sha256)
     order by a.periode_fin nulls last, a.organization_id;
end $$;
revoke all on function public.abonnements_sans_accord_conditions(text) from public, anon, authenticated;
grant execute on function public.abonnements_sans_accord_conditions(text) to service_role;
comment on function public.abonnements_sans_accord_conditions(text) is
  'Abonnements vivants dont aucun responsable n''a accepté cette version des conditions clients (mais une autre, oui) : la tâche quotidienne les programme pour ne pas être reconduits (24/10/2026, plan de conformité R19). Seul compte un accord qui porte l''empreinte du texte archivé (relecture de la fusion du 25/11/2026, R-01). Clé de service seulement.';

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
