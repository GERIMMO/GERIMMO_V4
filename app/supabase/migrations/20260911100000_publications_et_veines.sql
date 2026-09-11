-- Journal public et moteur de propositions — 2026-09-11
--
-- POURQUOI. La vitrine est muette : rien n'y bouge entre deux versions du
-- produit. Un site qui ne publie jamais ne se référence pas et ne rassure
-- personne. On donne donc au Super Admin une FILE DE PROPOSITIONS qui se
-- remplit toute seule, qu'il publie, amende, reporte ou refuse.
--
-- LE PRINCIPE, ET SA LIMITE ASSUMÉE. Le moteur ne sait pas écrire un article :
-- il sait QUAND un sujet devient utile et SUR QUELLE RÈGLE il s'appuie. Chaque
-- veine éditoriale est ancrée sur une page réelle du wiki métier — la source de
-- vérité du projet (CLAUDE.md : « ne jamais inventer de fait métier »). La
-- proposition apporte donc l'angle, le plan et la source ; elle n'invente
-- AUCUN chiffre, AUCUNE date, AUCUN nom.
--
-- Là où un fait daté est nécessaire (la valeur d'un indice, un seuil légal qui
-- change), le gabarit laisse un TROU explicite, écrit « [[à compléter : … ]] ».
-- Un déclencheur refuse la publication tant qu'un trou subsiste : il vaut mieux
-- une file qui attend qu'un article qui affirme.

-- ---------------------------------------------------------------- 1. Veines
-- Une veine = un sujet récurrent, sa cadence, et le gabarit qu'on propose.
create table if not exists public.publication_veines (
  cle           text primary key,
  libelle       text not null,
  cadence       text not null check (cadence in ('trimestrielle', 'annuelle', 'semestrielle')),
  mois_declencheur smallint[] not null,   -- mois (1-12) où la veine se propose
  titre_gabarit text not null,
  chapo_gabarit text not null,
  plan_gabarit  text not null,            -- le plan de l'article, en markdown
  sources       text[] not null default '{}',
  actif         boolean not null default true
);

comment on table public.publication_veines is
  'Sujets éditoriaux récurrents du journal Gerimmo. Chaque veine est ancrée sur une page du wiki métier et ne propose qu''un angle et un plan — jamais un fait inventé.';

-- ---------------------------------------------------- 2. Les publications
create table if not exists public.publications (
  id            uuid primary key default gen_random_uuid(),
  veine         text references public.publication_veines(cle),
  periode       text not null,            -- '2026-T3', '2026' : clé d'idempotence
  statut        text not null default 'proposition'
                check (statut in ('proposition','brouillon','planifiee','publiee','refusee','archivee')),
  titre         text not null,
  slug          text unique,
  chapo         text,
  corps         text,
  sources       text[] not null default '{}',
  seo_description text,
  propose_le    timestamptz not null default now(),
  publie_le     timestamptz,
  auteur_account_id uuid references auth.users(id) on delete set null,
  refus_motif   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Une seule proposition par veine et par période : le moteur peut tourner
-- toutes les nuits sans jamais empiler de doublons.
create unique index if not exists publications_veine_periode
  on public.publications (veine, periode) where veine is not null;

create index if not exists publications_publiees
  on public.publications (publie_le desc) where statut = 'publiee';

comment on table public.publications is
  'Journal public de Gerimmo. Une ligne naît « proposition » (moteur), puis le Super Admin la publie, l''amende, la reporte ou la refuse.';

-- ------------------------------------------- 3. Ce qu'une publication exige
-- Un article publié porte un titre, un chapô, un corps, une adresse — et
-- surtout AUCUN trou. Le gabarit en laisse volontairement : c'est ce qui
-- oblige un humain à fournir le fait daté avant que le site l'affirme.
create or replace function public.publication_prete_a_paraitre()
returns trigger language plpgsql set search_path to '' as $$
declare v_trou text;
begin
  if new.statut <> 'publiee' then
    return new;
  end if;

  if coalesce(btrim(new.slug), '') = '' then
    raise exception 'Adresse (slug) obligatoire pour publier';
  end if;
  if coalesce(btrim(new.chapo), '') = '' then
    raise exception 'Chapô obligatoire pour publier : c''est ce que lit un visiteur avant de cliquer';
  end if;
  if length(coalesce(btrim(new.corps), '')) < 200 then
    raise exception 'Corps trop court pour publier (moins de 200 caractères)';
  end if;

  -- Le trou du gabarit : « [[à compléter : la valeur de l'indice ]] »
  v_trou := substring(coalesce(new.corps, '') || ' ' || coalesce(new.chapo, '')
                      from '\[\[à compléter[^\]]*\]\]');
  if v_trou is not null then
    raise exception 'Publication refusée : un passage attend encore un fait daté — « % ». Complétez-le ou retirez-le : le journal n''affirme rien qu''on n''ait vérifié.', v_trou;
  end if;

  if new.publie_le is null then
    new.publie_le := now();
  end if;
  return new;
end $$;

drop trigger if exists publications_pretes on public.publications;
create trigger publications_pretes
  before insert or update on public.publications
  for each row execute function public.publication_prete_a_paraitre();

revoke execute on function public.publication_prete_a_paraitre()
  from public, anon, authenticated, service_role;

-- Horodatage de modification
create or replace function public.publications_touche()
returns trigger language plpgsql set search_path to '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists publications_touchees on public.publications;
create trigger publications_touchees
  before update on public.publications
  for each row execute function public.publications_touche();
revoke execute on function public.publications_touche()
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------ 4. Qui voit quoi
alter table public.publications        enable row level security;
alter table public.publication_veines  enable row level security;

-- Le journal est public : un visiteur non connecté lit les articles PARUS.
drop policy if exists publications_lecture_publique on public.publications;
create policy publications_lecture_publique on public.publications
  for select to anon, authenticated
  using (statut = 'publiee' and publie_le is not null and publie_le <= now());

-- Le Super Admin voit tout, y compris la file de propositions, et seul lui écrit.
drop policy if exists publications_super_admin on public.publications;
create policy publications_super_admin on public.publications
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists veines_super_admin on public.publication_veines;
create policy veines_super_admin on public.publication_veines
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Privilèges. Rappel de l'audit du 10/09 : les privilèges par défaut de
-- Supabase accordent l'écriture à `anon` sur toute table NEUVE, et rien en
-- base ne peut l'empêcher (ils appartiennent à supabase_admin). Toute
-- migration qui crée une table doit donc révoquer explicitement — c'est ce que
-- surveille le test de socle « anon n'écrit nulle part ».
revoke all on public.publications       from anon, authenticated;
revoke all on public.publication_veines from anon, authenticated;
grant select on public.publications to anon;                       -- le journal public
grant select, insert, update, delete on public.publications to authenticated;
grant select, insert, update, delete on public.publication_veines to authenticated;

-- ------------------------------------------- 5. Le moteur de propositions
-- Il ne rédige pas : il repère qu'un sujet arrive à son moment, et pose une
-- proposition avec son plan et sa source. Idempotent par (veine, période).
create or replace function public.proposer_publications(p_a_la_date date default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au Super Admin';
  end if;
  return public.proposer_publications_interne(coalesce(p_a_la_date, current_date));
end $$;

-- Le travail nocturne n'a AUCUN JWT : is_super_admin() y est faux. On ne perce
-- donc pas la garde ci-dessus (une première version comparait current_user au
-- propriétaire de la table — piège : sous SECURITY DEFINER, current_user VAUT
-- déjà le propriétaire, pour n'importe quel appelant, et la garde ne gardait
-- plus rien ; le test « un compte ordinaire ne voit pas la file » l'a montré).
-- On passe par une fonction INTERNE, dont l'exécution est révoquée à tous :
-- seul le propriétaire — donc le travail pg_cron — peut l'appeler.
create or replace function public.proposer_publications_interne(p_a_la_date date default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_jour    date := coalesce(p_a_la_date, current_date);
  v_mois    smallint := extract(month from v_jour)::smallint;
  v_annee   text := to_char(v_jour, 'YYYY');
  v         record;
  v_periode text;
  v_cree    integer := 0;
begin

  for v in
    select * from public.publication_veines
     where actif and v_mois = any(mois_declencheur)
     order by cle
  loop
    v_periode := case v.cadence
      when 'annuelle'      then v_annee
      when 'semestrielle'  then v_annee || '-S' || (case when v_mois <= 6 then '1' else '2' end)
      else v_annee || '-T' || ceil(v_mois / 3.0)::int::text
    end;

    insert into public.publications
      (veine, periode, statut, titre, chapo, corps, sources)
    values
      (v.cle, v_periode, 'proposition',
       replace(v.titre_gabarit, '{annee}', v_annee),
       v.chapo_gabarit,
       v.plan_gabarit,
       v.sources)
    on conflict (veine, periode) where veine is not null do nothing;

    if found then v_cree := v_cree + 1; end if;
  end loop;

  return v_cree;
end $$;

revoke execute on function public.proposer_publications_interne(date)
  from public, anon, authenticated, service_role;

comment on function public.proposer_publications_interne(date) is
  'Moteur de propositions. Sans contrôle d''accès : son EXECUTE est révoqué à tous, seul le propriétaire (travail pg_cron) l''appelle. Le point d''entrée humain est proposer_publications(date), qui exige le Super Admin.';

comment on function public.proposer_publications(date) is
  'Remplit la file de propositions du journal : une par veine dont le mois est venu, jamais deux fois la même période. N''invente aucun fait — le gabarit laisse des trous que le Super Admin doit combler.';

revoke execute on function public.proposer_publications(date) from public, anon;
grant execute on function public.proposer_publications(date) to authenticated;

-- Tous les lundis à 6 h : la file est prête quand la semaine commence.
select cron.schedule('propositions-publication-hebdo', '0 6 * * 1',
  $$select public.proposer_publications_interne()$$);

-- ------------------------------------------------- 6. Les veines de départ
-- Huit sujets, chacun ancré sur une page EXISTANTE du wiki métier. Le plan
-- proposé reprend la structure de la règle ; les faits datés (valeur d'un
-- indice, seuil qui change) sont laissés en trou explicite.
insert into public.publication_veines
  (cle, libelle, cadence, mois_declencheur, titre_gabarit, chapo_gabarit, plan_gabarit, sources)
values
(
  'revision-irl', 'Révision annuelle du loyer (IRL)', 'trimestrielle', '{1,4,7,10}',
  $t$Réviser un loyer en {annee} : ce que la règle autorise, et ce qu'elle interdit$t$,
  $t$La révision annuelle n'est ni automatique ni rétroactive. Elle suppose une clause au bail, un indice de référence figé à la signature, et une demande faite dans l'année qui suit la date anniversaire.$t$,
  $t$## Ce que dit la règle

- La révision suppose une **clause de révision** au bail. Sans clause, pas de révision.
- L'**indice de référence est figé à la signature** du bail (RM-3.8.2) : il ne se
  choisit pas au moment de réviser. C'est ce qui empêche de composer une hausse
  en changeant de base d'une année sur l'autre.
- **Une révision par année de bail** (RM-3.8.5). Passé un an après la date d'effet,
  la révision est prescrite : elle ne se rattrape pas.
- Un logement classé **F ou G** au DPE ne se révise pas.

## Le calcul

Nouveau loyer = loyer courant × (indice du trimestre de révision ÷ indice de référence du bail).

[[à compléter : la valeur de l'indice publié pour ce trimestre, et sa date de parution — à reprendre de la source officielle, sans l'inventer]]

## Les trois erreurs qu'on voit le plus souvent

1. Réviser sur un indice choisi après coup plutôt que sur celui du bail.
2. Laisser passer l'échéance, puis tenter de rattraper deux années d'un coup.
3. Réviser un logement dont le DPE l'interdit.

## Dans Gerimmo

L'indice de référence est lu sur le bail, jamais saisi au moment de réviser ;
la révision anticipée et la seconde révision dans l'année sont refusées par la
base elle-même, avec le motif affiché.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/processus/Révision annuelle IRL.md"}'
),
(
  'regularisation-charges', 'Régularisation annuelle des charges', 'annuelle', '{1}',
  $t$Régulariser les charges de {annee} : la méthode, pièce par pièce$t$,
  $t$Une fois par an, les provisions versées se comparent aux charges réellement payées. Le solde se réclame ou se rembourse — justificatifs à l'appui.$t$,
  $t$## Le principe

Comparer, sur l'exercice, **ce que le locataire a provisionné** et **ce que le
bailleur a réellement dépensé** en charges récupérables. La différence se solde
dans un sens ou dans l'autre.

## Ce qui est récupérable, ce qui ne l'est pas

Toute charge n'est pas récupérable : la liste est limitative. Le décompte doit
distinguer les postes et rester justifiable ligne par ligne.

[[à compléter : rappeler les postes récupérables, en citant le texte en vigueur — ne pas les énumérer de mémoire]]

## Le départ en cours d'année

Si le locataire est parti en cours d'exercice, la régularisation se fait **au
prorata de sa période d'occupation**, et non sur l'année pleine.

## La pièce qui évite le litige

Le décompte n'a de valeur que joint à ses justificatifs. Un solde réclamé sans
pièce est un solde contesté.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/processus/Régularisation des charges.md"}'
),
(
  'restitution-depot', 'Restituer le dépôt de garantie', 'annuelle', '{6}',
  $t$Rendre le dépôt de garantie sans y laisser un litige$t$,
  $t$C'est le moment où naissent la plupart des conflits de fin de bail. Une retenue ne se décide pas : elle se démontre, à partir de la comparaison des deux états des lieux.$t$,
  $t$## Sans état des lieux d'entrée, aucune retenue

C'est la règle la plus mal connue et la plus coûteuse : faute d'état des lieux
d'entrée signé, le logement est réputé reçu en bon état. Aucune dégradation
n'est alors opposable.

## La retenue se démontre, ligne par ligne

Chaque retenue s'appuie sur un écart entre l'entrée et la sortie, sur le même
élément. Un écart constaté ne suffit pas : il faut encore distinguer la
**dégradation** (imputable) de la **vétusté** (non imputable).

## La décote de vétusté

Un élément s'use. Une retenue au coût plein sur un revêtement en fin de vie ne
tient pas : la décote se calcule sur la durée de vie de l'élément et son âge.

## Les délais

[[à compléter : rappeler le délai légal de restitution et sa majoration en cas de retard, d'après le texte en vigueur]]

## Dans Gerimmo

Le comparatif d'états des lieux met les écarts en évidence, la décote de
vétusté se calcule sur l'élément, et le décompte se fige à l'envoi — toute
correction ultérieure produit un rectificatif, jamais une réécriture.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/processus/Restitution du dépôt de garantie.md","wiki/regles-metier/Vétusté et décote.md"}'
),
(
  'impayes-relances', 'Impayés : la séquence qui protège', 'semestrielle', '{2,9}',
  $t$Un loyer impayé : la séquence à tenir, dans l'ordre$t$,
  $t$Le réflexe coûteux est d'attendre. La relance graduée n'est pas une politesse : c'est ce qui rend la suite opposable.$t$,
  $t$## Pourquoi l'ordre compte

Chaque étape prépare la suivante. Une mise en demeure qui ne suit aucune
relance, ou une procédure engagée sans mise en demeure, se retourne contre
celui qui l'engage.

## La gradation

1. **Rappel** — le retard est peut-être un oubli.
2. **Relance** — écrite, datée, conservée.
3. **Mise en demeure** — la forme compte autant que le fond.

[[à compléter : préciser les formes et délais exigés à chaque étape d'après le texte en vigueur, et le rôle de la clause résolutoire si le bail en porte une]]

## Ce qui se perd si l'on saute une étape

La preuve. Un dossier se juge sur ce qu'on peut montrer, pas sur ce qu'on a
fait.

## Dans Gerimmo

La séquence est tracée : chaque relance est datée et conservée, et l'alerte ne
se ferme que par l'action.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/processus/Relances et mise en demeure.md","wiki/regles-metier/Clauses abusives et clauses résolutoires.md"}'
),
(
  'quittance-conforme', 'La quittance : ce qu''elle doit porter', 'annuelle', '{3}',
  $t$Quittance ou reçu : deux documents qu'on confond, pour un seul risque$t$,
  $t$Une quittance atteste que le loyer est intégralement payé. Un reçu constate un versement partiel. Délivrer l'un pour l'autre, c'est attester d'un paiement qu'on n'a pas reçu.$t$,
  $t$## La différence, et pourquoi elle est sérieuse

La **quittance** est libératoire : elle vaut preuve de paiement intégral pour la
période. Le **reçu** ne constate qu'un versement partiel et laisse le solde dû.

Émettre une quittance pour un mois partiellement réglé, c'est renoncer par
écrit à réclamer le reste.

## Ce que la quittance doit mentionner

Le détail du loyer et des charges doit apparaître **séparément** — un total
global ne suffit pas.

[[à compléter : reprendre la liste des mentions obligatoires d'après le texte en vigueur]]

## Elle est due, et gratuite

La quittance se délivre sans frais dès que le locataire la demande.

## Dans Gerimmo

Le document suit l'argent : l'encaissement émet la quittance, un paiement
partiel produit un reçu promu en quittance au solde — et si un encaissement est
supprimé, la quittance correspondante est retirée automatiquement.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/regles-metier/Quittance conforme.md","wiki/processus/Quittancement des loyers.md"}'
),
(
  'mentions-bail', 'Rédiger un bail qui tient', 'annuelle', '{9}',
  $t$Le bail : les mentions qui manquent le plus souvent$t$,
  $t$Un bail incomplet n'est pas nul, mais il est fragile. Les manques se paient au moment du litige, jamais à la signature.$t$,
  $t$## Les annexes qu'on oublie

Le bail ne vaut pas seul : diagnostics, notice d'information, état des lieux,
et — pour un meublé — l'**inventaire détaillé du mobilier**, qui doit être
annexé et non simplement évoqué.

[[à compléter : lister les annexes obligatoires par type de bail d'après le texte en vigueur]]

## Les clauses réputées non écrites

Certaines clauses sont sans effet même signées. Les faire figurer n'apporte
rien et fragilise l'ensemble.

## La clause résolutoire

Elle mérite une attention particulière : mal rédigée, elle ne joue pas ; bien
rédigée, elle change la nature de la procédure.

## Dans Gerimmo

Les mentions et annexes sont contrôlées à la mise en location : un bail ne
s'active pas si une pièce obligatoire manque.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/regles-metier/Mentions obligatoires du bail.md","wiki/regles-metier/Clauses abusives et clauses résolutoires.md"}'
),
(
  'incident-imputation', 'Qui paie la réparation ?', 'annuelle', '{11}',
  $t$Réparation locative ou charge du propriétaire : trancher avant d'intervenir$t$,
  $t$La cause ne se déduit pas de la nature de la panne. Une même canalisation bouchée est locative par négligence, et à la charge du propriétaire par vétusté.$t$,
  $t$## Trois imputations, pas deux

- **Locataire** — les réparations locatives d'entretien courant.
- **Propriétaire** — vétusté, malfaçon, force majeure, gros œuvre, remplacement.
- **Dégradation fautive** — un régime à part, qui suppose la preuve.

## L'erreur de méthode

Déduire l'imputation de la catégorie de l'incident. C'est la cause qui décide,
pas l'objet.

[[à compléter : citer le texte de référence sur les réparations locatives et donner deux ou trois exemples tirés de sa liste]]

## Trancher AVANT d'intervenir

Qualifier après coup, une fois la facture connue, transforme une question
technique en négociation. La justification doit être écrite, et le locataire
informé immédiatement — sa contestation se trace sans bloquer l'intervention.

## Dans Gerimmo

Aucun artisan ne s'affecte sans imputation qualifiée, la justification est
obligatoire, et l'incident se requalifie si la contestation le mérite — sans
qu'il faille clôturer le dossier pour y répondre.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/processus/Cycle de vie d''un incident.md"}'
),
(
  'donnees-locataires', 'Les données de vos locataires', 'annuelle', '{5}',
  $t$Ce qu'un bailleur a le droit de garder, et pendant combien de temps$t$,
  $t$Un dossier de candidature contient des pièces sensibles. Les conserver sans limite, ou les réclamer sans droit, expose autant que de mal gérer un impayé.$t$,
  $t$## Ce qu'on peut demander

La liste des pièces exigibles d'un candidat est **limitative**. Réclamer au-delà
n'est pas seulement inutile : c'est interdit.

[[à compléter : reprendre la liste des pièces exigibles d'après le texte en vigueur]]

## Combien de temps les garder

Une pièce se conserve le temps de sa finalité, puis s'efface. Les dossiers des
candidats non retenus n'ont pas à survivre à la décision.

## Le droit d'accès

Le locataire peut demander ce que vous détenez sur lui.

## Dans Gerimmo

Les pièces portent une durée de conservation, l'accès est journalisé, et
l'espace locataire donne à chacun la vue de son propre dossier — ce qui répond
à la demande d'accès sans démarche.

[[à compléter : relire et signer cet article avant parution]]$t$,
  '{"wiki/regles-metier/RGPD.md"}'
)
on conflict (cle) do nothing;
