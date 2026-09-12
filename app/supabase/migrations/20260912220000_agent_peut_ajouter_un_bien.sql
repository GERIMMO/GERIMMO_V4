-- Un agent peut ajouter un bien — et ce qu'il enregistre est à lui.
--
-- LE CONSTAT (humain, 12/09) : « je me suis connecté en tant qu'agent, je ne
-- trouve pas où ajouter un lot ou un bien ». Il n'y avait effectivement nulle
-- part : le bouton était masqué, et la base aurait de toute façon refusé.
--
-- CE QUI SE PASSAIT VRAIMENT, ET POURQUOI C'ÉTAIT DIFFICILE À VOIR.
-- L'INSERT passait. C'est la RELECTURE qui échouait : `creer_bien_avec_lot` se
-- termine par un `insert … returning id`, et le `returning` déclenche la
-- politique de LECTURE sur la ligne qu'on vient d'écrire. Or un bien tout neuf
-- n'est sous aucun mandat, donc hors du portefeuille d'un agent. Il créait dans
-- le vide et recevait « new row violates row-level security policy » — un
-- message dont rien ne dit qu'il parle de relecture.
--
-- LA FAUSSE BONNE IDÉE, ÉCARTÉE. On pouvait décréter que « ce que personne ne
-- gère appartient à l'agence » et rendre visible de tous les gérants tout lot
-- sans mandat. C'est séduisant et c'est faux : sur une agence dont le parc
-- n'est pas encore sous mandat, cela revient à rouvrir l'agence entière à
-- n'importe quel agent — exactement le P0 corrigé le 09/09 (« un agent SANS
-- mandat reçoit un ensemble VIDE, pas l'agence entière »). Un test l'a
-- épinglée avant qu'elle ne soit posée ; elle est restée dehors.
--
-- LA RÈGLE RETENUE, PLUS ÉTROITE : **ce qu'un agent enregistre est à lui**,
-- tant que l'agence ne l'a confié à personne. Son portefeuille est donc
--   · les lots des mandats dont il est titulaire (inchangé, RM-18.1.3) ;
--   · plus les lots qu'il a lui-même créés et que nul mandat ne couvre encore.
-- Un agent sans mandat qui n'a rien saisi voit toujours une liste vide. Le jour
-- où l'administrateur confie le lot à un collègue, il sort de sa vue.

-- ── 1. Qui a enregistré quoi ─────────────────────────────────────────────
-- Colonne additive, `auth.uid()` par défaut : les lignes existantes restent à
-- NULL — « créé par personne » — et la visibilité d'aujourd'hui ne bouge pas.
alter table public.biens add column if not exists created_by uuid references public.accounts(id);
alter table public.lots  add column if not exists created_by uuid references public.accounts(id);
-- Postgres refuse une sous-requête en DEFAULT : `auth.uid()` s'appelle donc
-- nu. C'est la même fonction ; seule la forme `(select …)`, qui aide le
-- planificateur dans les politiques RLS, n'est pas permise ici.
alter table public.biens alter column created_by set default auth.uid();
alter table public.lots  alter column created_by set default auth.uid();
comment on column public.lots.created_by is
  'Qui a enregistré ce lot. Sert au périmètre de l''agent : ce qu''il saisit est à lui tant qu''aucun mandat ne couvre le lot.';

-- ── 2. Le portefeuille : mes mandats, plus ce que j'ai saisi ─────────────
create or replace function public.lots_de_mon_portefeuille(p_org uuid)
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  -- a) Les lots des mandats dont je suis titulaire — la règle d'origine.
  select ml.lot_id
  from public.mandats md
  join public.mandat_lignes ml on ml.mandat_id = md.id and ml.date_fin is null
  where md.organization_id = p_org
    and md.agent_account_id = (select auth.uid())
    and md.etat in ('brouillon','a_signer','actif','preavis')
  union
  -- b) Les lots que j'ai saisis et que nul mandat ne couvre encore. Sans eux,
  --    un agent ne pourrait pas enregistrer un bien : il ne relirait pas ce
  --    qu'il vient d'écrire.
  select l.id
  from public.lots l
  where l.organization_id = p_org
    and l.created_by = (select auth.uid())
    and not exists (
      select 1
      from public.mandats md2
      join public.mandat_lignes ml2 on ml2.mandat_id = md2.id and ml2.date_fin is null
      where md2.organization_id = p_org
        and ml2.lot_id = l.id
        and md2.etat in ('brouillon','a_signer','actif','preavis')
    );
$$;
comment on function public.lots_de_mon_portefeuille(uuid) is
  'Les lots de l''appelant : ceux des mandats dont il est titulaire, plus ceux qu''il a lui-même enregistrés tant qu''aucun mandat ne les couvre. Un agent sans mandat qui n''a rien saisi obtient une liste VIDE (P0 du 09/09).';
revoke execute on function public.lots_de_mon_portefeuille(uuid) from public, anon;

-- ── 3. Le prédicat tolère la ligne qui n'existe pas encore ───────────────
-- Le déclencheur `garde_portefeuille_agent` appelle `lot_hors_portefeuille` en
-- BEFORE INSERT sur `lots` : à cet instant la ligne n'est PAS dans la table, et
-- aucune liste ne peut la contenir. Sans cette tolérance, le lot qu'on est en
-- train de créer serait refusé pour la seule raison qu'il n'existe pas encore.
-- Ce n'est pas un trou : la ligne insérée porte `created_by = auth.uid()`, donc
-- dès qu'elle existe elle est dans le portefeuille de son auteur — et de lui
-- seul.
create or replace function public.lot_hors_portefeuille(p_org uuid, p_lot uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_lot is null
          or (exists (select 1 from public.lots l where l.id = p_lot)
              and p_lot not in (select public.lots_de_mon_portefeuille(p_org))));
$$;
comment on function public.lot_hors_portefeuille(uuid, uuid) is
  'Vrai pour un agent restreint devant un lot QUI EXISTE et n''est pas dans son portefeuille. Un lot en cours d''insertion ne l''est pas : il naît avec son auteur.';
revoke execute on function public.lot_hors_portefeuille(uuid, uuid) from public, anon;

-- Un bien n'est hors portefeuille que s'il PORTE des lots et qu'aucun n'est à
-- moi. Un bien sans lot — l'instant entre les deux insertions de
-- `creer_bien_avec_lot` — ne l'est pas non plus, pour la même raison.
create or replace function public.bien_hors_portefeuille(p_org uuid, p_bien uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_bien is null
          or (exists (select 1 from public.lots l where l.bien_id = p_bien)
              and not exists (select 1 from public.lots l
                              where l.bien_id = p_bien
                                and l.id in (select public.lots_de_mon_portefeuille(p_org)))));
$$;
revoke execute on function public.bien_hors_portefeuille(uuid, uuid) from public, anon;

select public.fermer_fonctions_a_anon();
