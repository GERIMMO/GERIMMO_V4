-- Les quittances partent sans qu'on clique — mais seulement si l'agence l'a dit.
--
-- LE CHAÎNON MANQUANT. Depuis le cycle mensuel automatique, les appels de loyer
-- se créent seuls et les quittances s'émettent à l'encaissement. Elles
-- s'ENVOIENT encore à la main : `envoyerQuittancesMois` attend qu'un gérant
-- ouvre la comptabilité et clique. Un client qui oublie a des quittances émises
-- que personne n'a reçues — et la quittance est due au locataire.
--
-- POURQUOI CE N'EST PAS AUTOMATIQUE PAR DÉFAUT. Le référentiel produit dit la
-- quittance « validée par l'agence ou le propriétaire » (wiki « Quittancement
-- des loyers », intention v0). L'envoyer d'office contredirait cette règle.
-- L'option existe donc par organisation et vaut FAUX à l'installation : c'est
-- l'agence qui, en la cochant, donne sa validation une fois pour toutes. Tant
-- qu'elle ne l'a pas fait, rien ne change pour elle.
--
-- CE QUI N'EST PAS RATTRAPÉ. Le jour où une agence coche l'option, on n'envoie
-- pas l'arriéré : seules les quittances émises dans les 45 derniers jours
-- partent. Sans cette borne, cocher une case enverrait d'un coup deux ans de
-- courrier à des locataires qui, pour certains, sont partis depuis.

alter table public.organizations
  add column if not exists quittances_envoi_auto boolean not null default false;
comment on column public.organizations.quittances_envoi_auto is
  'L''agence a donné son accord permanent pour que les quittances et reçus partent au locataire sans validation au coup par coup. Faux par défaut.';

-- ── Ce que la tâche d'envoi a le droit de voir ─────────────────────────────
create or replace function public.quittances_a_envoyer(p_limite integer default 200)
returns table (
  quittance_id uuid,
  organization_id uuid,
  bail_id uuid,
  destinataire text,
  prenom text,
  emetteur text,
  periode date,
  loyer_hc numeric,
  charges numeric,
  montant numeric,
  est_quittance boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Réservée à la tâche planifiée (service_role, sans identité) et au super
  -- admin. Un compte d'agence n'a rien à faire ici : la fonction traverse
  -- TOUTES les organisations.
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'quittances_a_envoyer: reserve a la tache d''envoi';
  end if;

  return query
  select q.id, q.organization_id, q.bail_id,
         loc.email, loc.prenom, o.name,
         a.periode, a.loyer_hc, a.charges, q.montant, q.est_quittance
  from public.quittances q
  join public.appels_loyer a on a.id = q.appel_id
  join public.baux b on b.id = q.bail_id
  join public.organizations o on o.id = q.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  where q.email_envoye_at is null
    and o.quittances_envoi_auto
    -- Une organisation suspendue n'émet plus rien en son nom.
    and public.org_ecriture_ouverte(o.id)
    and loc.email is not null and length(btrim(loc.email)) > 0
    -- Pas d'arriéré : cocher la case n'envoie pas deux ans de courrier.
    and q.date_emission >= current_date - 45
  order by q.date_emission, q.id
  limit greatest(1, least(p_limite, 500));
end;
$$;
revoke execute on function public.quittances_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.quittances_a_envoyer(integer) to service_role;

-- ── Et ce qu'elle a le droit d'écrire : une date, sur une quittance ────────
create or replace function public.marquer_quittance_envoyee(p_quittance uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'marquer_quittance_envoyee: reserve a la tache d''envoi';
  end if;
  -- Le marquage ne se pose que sur une quittance ENCORE non envoyée : si deux
  -- passages se chevauchent, le second ne réécrit pas la date du premier.
  update public.quittances
     set email_envoye_at = now()
   where id = p_quittance and email_envoye_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
revoke execute on function public.marquer_quittance_envoyee(uuid) from public, anon, authenticated;
grant execute on function public.marquer_quittance_envoyee(uuid) to service_role;
