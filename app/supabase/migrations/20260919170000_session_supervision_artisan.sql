-- ENTRER DANS LA SESSION D'UN ARTISAN — pour de vrai, pas une vue en lecture.
--
-- POURQUOI (demande du porteur du projet, 19/09, après une première réponse en
-- lecture seule : « je veux pas une simple vue, je souhaite entrer dans sa
-- session comme si j'étais l'artisan »).
--
-- CE QUE LA PLATEFORME SAVAIT DÉJÀ FAIRE, ET CE QU'ELLE NE SAVAIT PAS. Entrer
-- dans l'espace d'une AGENCE n'a jamais été une usurpation : la supervision y
-- entre avec SA PROPRE identité, la RLS la laisse passer (`is_super_admin()`),
-- et la traversée s'inscrit au journal d'audit (RM-A1.11). Le portail artisan,
-- lui, ne se lit pas par organisation mais par `mon_artisan_id()`, déduite de
-- `auth.uid()` : il n'y avait aucune porte.
--
-- CE QUE POSE CETTE MIGRATION. La même porte, au même prix.
--  · Une SESSION DE SUPERVISION : une ligne qui dit « ce compte de supervision
--    travaille dans l'espace de cet artisan, jusqu'à telle heure ». Elle ne
--    s'ouvre que par une fonction réservée à la supervision (AAL2 exigé par
--    `is_super_admin()`), une seule à la fois, et elle EXPIRE.
--  · `mon_artisan_id()` la prend en compte. C'est la pièce maîtresse : les
--    cinquante-quatre points du produit qui s'appuient dessus — RPC de lecture,
--    RPC d'écriture, politiques RLS, accès au stockage — suivent sans être
--    touchés. La supervision voit et FAIT exactement ce que fait l'artisan.
--
-- CE QU'ELLE NE FAIT PAS, ET C'EST DÉLIBÉRÉ. Elle n'émet aucun jeton au nom de
-- l'artisan. `auth.uid()` reste celui du superviseur : tout ce qui enregistre
-- un auteur enregistre le superviseur, et l'ouverture comme la fermeture sont
-- inscrites au journal d'audit. Une session Supabase forgée sous le compte de
-- l'artisan aurait rendu les deux indiscernables — c'est précisément ce qui
-- transforme un outil d'assistance en dénégation possible.
--
-- ⚠ CE QUE CELA AUTORISE. Pendant une session ouverte, la supervision peut
-- écrire ce que l'artisan écrirait : accepter une sollicitation, déposer un
-- devis, refuser une intervention. Ce sont des engagements commerciaux pris
-- dans l'espace d'un tiers. La trace existe (journal d'audit + ligne de
-- session), la durée est bornée, et le portail l'affiche en clair à l'écran ;
-- l'usage, lui, relève de la politique de la plateforme, pas du schéma.

-- ------------------------------------------------------------
-- 1. La session de supervision
-- ------------------------------------------------------------
create table if not exists public.supervision_sessions_artisan (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id),
  artisan_id uuid not null references public.artisans (id),
  ouverte_le timestamptz not null default now(),
  expire_le timestamptz not null,
  fermee_le timestamptz,
  motif text
);
comment on table public.supervision_sessions_artisan is
  'Traversée de supervision dans l''espace d''un artisan : une seule ouverte par compte, bornée dans le temps. Ecrite par ouvrir/fermer_session_artisan uniquement.';

-- Une seule session ouverte par compte : deux identités d'artisan à la fois
-- n'auraient aucun sens, et `mon_artisan_id()` doit rester déterministe.
create unique index if not exists supervision_sessions_artisan_une_seule
  on public.supervision_sessions_artisan (account_id)
  where fermee_le is null;

alter table public.supervision_sessions_artisan enable row level security;

-- Lecture : son propre historique de traversées, et la supervision.
drop policy if exists supervision_sessions_artisan_select on public.supervision_sessions_artisan;
create policy supervision_sessions_artisan_select on public.supervision_sessions_artisan
  for select to authenticated
  using (account_id = (select auth.uid()) or public.is_super_admin());
grant select on public.supervision_sessions_artisan to authenticated;
revoke insert, update, delete on public.supervision_sessions_artisan from authenticated;

-- ------------------------------------------------------------
-- 2. L'identité empruntée, et la seule façon de l'obtenir
-- ------------------------------------------------------------
-- `is_super_admin()` est RE-VÉRIFIÉ ici, à chaque lecture, et pas seulement à
-- l'ouverture : un compte qui perd la supervision — ou dont la session retombe
-- en AAL1 — cesse aussitôt d'emprunter l'identité, même si la ligne est encore
-- ouverte. La ligne dit l'intention ; le droit se revérifie.
create or replace function public.artisan_supervise()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.artisan_id
  from public.supervision_sessions_artisan s
  where s.account_id = (select auth.uid())
    and s.fermee_le is null
    and s.expire_le > now()
    and public.is_super_admin()
  limit 1;
$$;
revoke execute on function public.artisan_supervise() from public, anon;
grant execute on function public.artisan_supervise() to authenticated;
comment on function public.artisan_supervise() is
  'Artisan dont la supervision emprunte l''espace, si une session est ouverte et non expiree. Null sinon.';

-- LA PIÈCE MAÎTRESSE, ÉLARGIE D'UN CRAN. Elle ne prend toujours AUCUN
-- paramètre : on ne peut pas demander l'identité d'un autre, on ne peut
-- qu'ouvrir une session tracée qui, elle, est réservée à la supervision.
-- L'identité empruntée passe devant l'identité propre : un superviseur qui
-- serait aussi artisan travaille dans l'espace qu'il a explicitement ouvert,
-- pas dans le sien.
create or replace function public.mon_artisan_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.artisan_supervise(),
    (select a.id from public.artisans a where a.account_id = (select auth.uid()))
  );
$$;
comment on function public.mon_artisan_id() is
  'Artisan du compte connecte, deduit de auth.uid() — ou celui d''une session de supervision ouverte. Aucun parametre : on ne peut pas demander l''identite d''un autre.';

-- ------------------------------------------------------------
-- 3. Ouvrir, fermer, savoir où l'on est
-- ------------------------------------------------------------
create or replace function public.ouvrir_session_artisan(p_artisan uuid, p_motif text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'ouvrir_session_artisan: reserve a la supervision';
  end if;
  if not exists (select 1 from public.artisans a where a.id = p_artisan) then
    raise exception 'Artisan inconnu.';
  end if;

  -- Une traversée en cours se referme : on n'empile pas les identités.
  update public.supervision_sessions_artisan
     set fermee_le = now()
   where account_id = (select auth.uid()) and fermee_le is null;

  -- Trente minutes. Une traversée oubliée est une identité empruntée qui
  -- traîne : la borne fait le ménage même si personne ne clique « Quitter ».
  insert into public.supervision_sessions_artisan (account_id, artisan_id, expire_le, motif)
  values ((select auth.uid()), p_artisan, now() + interval '30 minutes', nullif(btrim(coalesce(p_motif, '')), ''))
  returning id into v_id;

  -- Journal d'audit (RM-A1.11) : l'organisation est nulle, un artisan n'en a
  -- pas — c'est la plateforme entière qui est concernée.
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), null, 'ouverture_session_artisan',
          jsonb_build_object('artisan_id', p_artisan, 'session_id', v_id, 'motif', p_motif));

  return v_id;
end $$;
comment on function public.ouvrir_session_artisan(uuid, text) is
  'Ouvre une traversee de supervision dans l''espace d''un artisan, pour 30 minutes. Reserve a la supervision, journalisee.';
revoke execute on function public.ouvrir_session_artisan(uuid, text) from public, anon;

create or replace function public.fermer_session_artisan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artisan uuid;
begin
  -- Pas de garde `is_super_admin()` : FERMER doit toujours passer. Un compte
  -- qui vient de perdre la supervision, ou dont la session est retombée en
  -- AAL1, doit pouvoir refermer sa traversée — et de toute façon il n'emprunte
  -- déjà plus rien, puisque le droit se revérifie à la lecture.
  update public.supervision_sessions_artisan
     set fermee_le = now()
   where account_id = (select auth.uid()) and fermee_le is null
  returning artisan_id into v_artisan;

  if v_artisan is not null then
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), null, 'fermeture_session_artisan',
            jsonb_build_object('artisan_id', v_artisan));
  end if;
end $$;
comment on function public.fermer_session_artisan() is
  'Referme la traversee de supervision en cours, s''il y en a une. Journalisee.';
revoke execute on function public.fermer_session_artisan() from public, anon;

-- Ce que le bandeau du portail doit afficher : dans l'espace de qui, et
-- jusqu'à quand. Rend zéro ligne quand on est chez soi.
create or replace function public.ma_session_artisan()
returns table (session_id uuid, artisan_id uuid, raison_sociale text, expire_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.artisan_id, a.raison_sociale, s.expire_le
  from public.supervision_sessions_artisan s
  join public.artisans a on a.id = s.artisan_id
  where s.account_id = (select auth.uid())
    and s.fermee_le is null
    and s.expire_le > now()
    and public.is_super_admin();
$$;
comment on function public.ma_session_artisan() is
  'La traversee de supervision en cours : chez quel artisan, et jusqu''a quand. Vide si aucune.';
revoke execute on function public.ma_session_artisan() from public, anon;

-- La garde d'abonnement se repose sur toutes les tables, comme après chaque
-- migration ; supervision_sessions_artisan n'a pas d'organization_id.
select public.poser_gardes_abonnement();

-- Et aucune fonction de `public` ne reste exécutable par `anon`.
select public.fermer_fonctions_a_anon();
