-- Audit palier 1, P1-14 — L'avenant signé s'enregistre, et modifie le loyer et la provision pour charges du bail.
--
-- CE QUI MANQUAIT. L'avenant n'était qu'un texte libre mis en PDF : rien n'était stocké. Or un bail en cours ne se
-- modifie plus (son contenu est figé dès sa signature, 20260911130000), et la base renvoyait elle-même vers « un
-- avenant » pour toute évolution. Résultat : après un avenant signé, le loyer et la provision appelés chaque mois
-- restaient ceux d'avant, sans aucun moyen de les corriger.
--
-- CE QUE POSE CETTE MIGRATION.
--   1. `avenants_bail` : ce que les parties ont signé — l'objet, la date de signature, la date d'effet, le loyer hors
--      charges et les charges d'avant et d'après, et la pièce signée (obligatoire). Lecture réservée à qui gère le
--      bail ; aucune écriture directe.
--   2. `enregistrer_avenant_bail` : mêmes gardes que la révision du loyer (rôle de gestion, portefeuille de l'agent,
--      bail en cours). La date d'effet est le 1er d'un mois dont le loyer N'EST PAS ENCORE APPELÉ : un avenant ne
--      réécrit jamais un loyer déjà appelé. Un seul avenant en attente à la fois.
--   3. L'application, par UN SEUL chemin : l'avenant s'applique au moment où le premier loyer qu'il concerne est
--      appelé (déclencheur sur `appels_loyer`), et les montants de cet appel sont ceux de l'avenant. Les mois d'avant
--      la date d'effet gardent donc toujours l'ancien montant, même appelés en retard. Si la date d'effet est déjà
--      atteinte à l'enregistrement, les loyers manquants sont appelés aussitôt (par le générateur habituel, qui n'est
--      pas modifié) : l'avenant s'applique tout de suite. Sinon il attend le mois venu.
--   4. `annuler_avenant_bail` : tant que l'avenant n'est pas appliqué, avec un motif. Une fois appliqué, il ne se
--      défait que par un autre avenant.
--
-- PRUDENCES, FAUTE DE TEXTE OFFICIEL OUVERT (voir JURISTE.md) — aucune n'est présentée comme une règle de droit :
--   · une HAUSSE du loyer est refusée quand le dernier diagnostic du logement le classe F ou G : c'est la règle que
--     la révision annuelle applique déjà (`reviser_loyer`) ; l'avenant ne doit pas la contourner ;
--   · le dépôt de garantie ne change pas (`controler_plafond_depot_garantie`, déjà prévu pour « l'avenant à la baisse ») ;
--   · l'encadrement des loyers n'est pas contrôlé ici : l'écran le dit.
--
-- CE QUI NE CHANGE PAS. Les loyers déjà appelés, les encaissements, les quittances, la révision annuelle (elle part
-- du loyer en vigueur, avenant compris). Un bail sans avenant suit exactement le chemin d'avant.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261122190000_avenants_bail.retour.sql

-- ── 1. La table ──────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.avenants_bail (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bail_id uuid not null,
  objet text not null,
  signe_le date not null,
  date_effet date not null,
  ancien_loyer_hc numeric not null,
  nouveau_loyer_hc numeric not null,
  anciennes_charges numeric not null,
  nouvelles_charges numeric not null,
  document_id uuid not null,
  enregistre_par uuid references public.accounts(id),
  enregistre_le timestamptz not null default now(),
  applique_le timestamptz,
  annule_le timestamptz,
  annule_par uuid references public.accounts(id),
  annulation_motif text,
  constraint avenants_bail_bail_meme_org_fk foreign key (bail_id, organization_id) references public.baux(id, organization_id),
  constraint avenants_bail_document_meme_org_fk foreign key (document_id, organization_id) references public.documents(id, organization_id),
  constraint avenants_bail_objet check (length(btrim(objet)) between 5 and 500),
  constraint avenants_bail_effet_premier_du_mois check (date_effet = date_trunc('month', date_effet)::date),
  constraint avenants_bail_montants check (nouveau_loyer_hc > 0 and nouvelles_charges >= 0
    and nouveau_loyer_hc = round(nouveau_loyer_hc, 2) and nouvelles_charges = round(nouvelles_charges, 2)),
  constraint avenants_bail_changement check (nouveau_loyer_hc <> ancien_loyer_hc or nouvelles_charges <> anciennes_charges),
  -- Annulé : jamais appliqué, et toujours motivé. Appliqué : jamais annulé.
  constraint avenants_bail_annulation check (
    (annule_le is null and annule_par is null and annulation_motif is null)
    or (annule_le is not null and applique_le is null and length(btrim(annulation_motif)) between 5 and 500))
);
create index if not exists avenants_bail_org on public.avenants_bail(organization_id);
create index if not exists avenants_bail_bail on public.avenants_bail(bail_id, organization_id);
create index if not exists avenants_bail_document on public.avenants_bail(document_id, organization_id);
create index if not exists avenants_bail_enregistre_par on public.avenants_bail(enregistre_par);
create index if not exists avenants_bail_annule_par on public.avenants_bail(annule_par);
-- Un seul avenant par date d'effet, et un seul en attente d'application, parmi ceux qui n'ont pas été annulés.
create unique index if not exists avenants_bail_un_par_date_effet on public.avenants_bail(bail_id, date_effet) where annule_le is null;
create unique index if not exists avenants_bail_un_en_attente on public.avenants_bail(bail_id) where annule_le is null and applique_le is null;
comment on table public.avenants_bail is
  'Avenants signés d''un bail qui modifient le loyer hors charges ou les charges (P1-14). Écrit par enregistrer_avenant_bail et annuler_avenant_bail seulement.';

-- Qui gère ce bail : mêmes rôles que les loyers, même portefeuille, jamais une traversée.
create or replace function public.verifier_gerant_avenant_bail(p_org uuid, p_bail uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.bail_hors_portefeuille(p_org, p_bail)
    and not public.est_traversee_organisation(p_org)
    and exists (select 1 from public.baux b where b.id = p_bail and b.organization_id = p_org);
$$;
revoke all on function public.verifier_gerant_avenant_bail(uuid, uuid) from public, anon;
grant execute on function public.verifier_gerant_avenant_bail(uuid, uuid) to authenticated;

alter table public.avenants_bail enable row level security;
revoke all on public.avenants_bail from public, anon, authenticated;
grant select on public.avenants_bail to authenticated;
drop trigger if exists diagnostic_artisan_lecture on public.avenants_bail;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.avenants_bail
  for each row execute function public.refuser_mutation_diagnostic_artisan();
drop trigger if exists traversee_lecture_seule on public.avenants_bail;
create trigger traversee_lecture_seule before insert or update or delete on public.avenants_bail
  for each row execute function support_interne.garder_ecriture_traversee();
drop policy if exists avenants_bail_lecture on public.avenants_bail;
create policy avenants_bail_lecture on public.avenants_bail for select to authenticated
  using ((select public.is_super_admin()) or public.verifier_gerant_avenant_bail(organization_id, bail_id));
select public.poser_gardes_abonnement();

-- ── 2. L'application au bail (interne) ───────────────────────────────────────────────────────────────────────────
create or replace function public.appliquer_avenant_bail_interne(p_avenant uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.avenants_bail;
  v_loyer_remplace numeric;
  v_charges_remplacees numeric;
begin
  select * into a from public.avenants_bail where id = p_avenant for update;
  if not found or a.annule_le is not null or a.applique_le is not null then return; end if;
  -- Ce que l'avenant remplace VRAIMENT : entre son enregistrement et sa date d'effet, une révision annuelle a pu
  -- passer. Le montant signé reste celui qui s'applique ; le journal garde ce qu'il a remplacé.
  select b.loyer_hc, coalesce(b.charges, 0) into v_loyer_remplace, v_charges_remplacees
    from public.baux b where b.id = a.bail_id and b.organization_id = a.organization_id for update;
  update public.baux set loyer_hc = a.nouveau_loyer_hc, charges = a.nouvelles_charges, updated_at = now()
   where id = a.bail_id and organization_id = a.organization_id;
  update public.avenants_bail set applique_le = now() where id = a.id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (auth.uid(), a.organization_id, 'avenant_bail_applique', jsonb_build_object(
    'avenant_id', a.id, 'bail_id', a.bail_id, 'date_effet', a.date_effet,
    'nouveau_loyer_hc', a.nouveau_loyer_hc, 'nouvelles_charges', a.nouvelles_charges,
    'loyer_hc_remplace', v_loyer_remplace, 'charges_remplacees', v_charges_remplacees));
end;
$$;
revoke all on function public.appliquer_avenant_bail_interne(uuid) from public, anon, authenticated, service_role;

-- ── 3. L'enregistrement ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.enregistrer_avenant_bail(
  p_org uuid, p_bail uuid, p_objet text, p_signe_le date, p_date_effet date,
  p_loyer_hc numeric, p_charges numeric,
  p_storage_path text, p_mime text, p_taille bigint, p_empreinte text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.baux;
  v_objet text := btrim(coalesce(p_objet, ''));
  v_aujourdhui date := public.aujourdhui_paris();
  v_dernier_appel date;
  v_plus_tot date;
  v_dpe text;
  v_attente date;
  v_document uuid;
  v_id uuid;
begin
  if not public.verifier_gerant_avenant_bail(p_org, p_bail) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  -- Verrou sur le bail : deux enregistrements concurrents se voient.
  select * into b from public.baux where id = p_bail and organization_id = p_org for update;
  if b.etat not in ('actif', 'preavis') then
    raise exception 'Un avenant ne s''enregistre que sur un bail en cours';
  end if;
  if b.loyer_hc is null then raise exception 'Le loyer du bail n''est pas fixé'; end if;
  if length(v_objet) not between 5 and 500 then
    raise exception 'Indiquez l''objet de l''avenant (5 à 500 caractères)';
  end if;
  if p_signe_le is null or p_signe_le > v_aujourdhui then
    raise exception 'La date de signature de l''avenant est obligatoire, et ne peut pas être dans le futur';
  end if;
  if b.date_debut is not null and p_signe_le < b.date_debut - 366 then
    raise exception 'La date de signature de l''avenant est antérieure au bail : vérifiez-la';
  end if;
  if p_loyer_hc is null or p_loyer_hc <= 0 or p_loyer_hc <> round(p_loyer_hc, 2) or p_loyer_hc > 1000000 then
    raise exception 'Le nouveau loyer hors charges est un montant positif, au centime';
  end if;
  if p_charges is null or p_charges < 0 or p_charges <> round(p_charges, 2) or p_charges > 1000000 then
    raise exception 'Les nouvelles charges sont un montant positif ou nul, au centime';
  end if;
  if p_loyer_hc = round(b.loyer_hc, 2) and p_charges = round(coalesce(b.charges, 0), 2) then
    raise exception 'Cet avenant ne change ni le loyer ni les charges : rien à enregistrer ici';
  end if;

  -- Un seul avenant en attente : sinon « l'ancien loyer » du second serait ambigu.
  select av.date_effet into v_attente from public.avenants_bail av
   where av.bail_id = p_bail and av.annule_le is null and av.applique_le is null;
  if v_attente is not null then
    raise exception 'Un avenant attend déjà son application (effet au %) : annulez-le, ou attendez qu''il s''applique',
      to_char(v_attente, 'DD/MM/YYYY');
  end if;

  -- La date d'effet : le 1er d'un mois dont le loyer n'est pas encore appelé.
  if p_date_effet is null or p_date_effet <> date_trunc('month', p_date_effet)::date then
    raise exception 'La date d''effet d''un avenant est le 1er d''un mois';
  end if;
  select max(ap.periode) into v_dernier_appel from public.appels_loyer ap where ap.bail_id = p_bail;
  v_plus_tot := greatest(
    coalesce((v_dernier_appel + interval '1 month')::date, date_trunc('month', coalesce(b.date_debut, v_aujourdhui))::date),
    date_trunc('month', coalesce(b.date_debut, v_aujourdhui))::date);
  if p_date_effet < v_plus_tot then
    raise exception 'Le loyer de % est déjà appelé : un avenant ne modifie pas un loyer déjà appelé. Sa date d''effet est au plus tôt le %',
      to_char(p_date_effet, 'MM/YYYY'), to_char(v_plus_tot, 'DD/MM/YYYY');
  end if;
  if p_date_effet > (date_trunc('month', v_aujourdhui) + interval '24 months')::date then
    raise exception 'Date d''effet trop lointaine (plus de deux ans) : vérifiez-la';
  end if;
  if b.date_fin is not null and p_date_effet > b.date_fin then
    raise exception 'Le bail se termine le % : l''avenant prendrait effet après sa fin', to_char(b.date_fin, 'DD/MM/YYYY');
  end if;
  if exists (select 1 from public.avenants_bail av where av.bail_id = p_bail and av.annule_le is null and av.date_effet = p_date_effet) then
    raise exception 'Un avenant est déjà enregistré avec cette date d''effet';
  end if;

  -- Prudence : la même règle que la révision annuelle (reviser_loyer). L'avenant ne la contourne pas.
  if p_loyer_hc > b.loyer_hc then
    select d.classe_dpe into v_dpe from public.diagnostics d
     where d.lot_id = b.lot_id and d.type = 'dpe' and d.archived_at is null
     order by d.date_realisation desc limit 1;
    if v_dpe in ('F', 'G') then
      raise exception 'Hausse du loyer refusée : le dernier diagnostic classe ce logement % (même règle que pour la révision annuelle). Si votre situation relève d''une exception, faites-la confirmer par un juriste', v_dpe;
    end if;
  end if;

  -- La pièce signée, obligatoire. Sa fiche naît ICI, dans la transaction de l'avenant (même geste que le congé et
  -- les retenues, 20260927183000) : un avenant refusé ne laisse aucune pièce rangée à vide dans les documents.
  if nullif(btrim(coalesce(p_storage_path, '')), '') is null then
    raise exception 'L''avenant signé est obligatoire : déposez la pièce';
  end if;
  v_document := public.creer_fiche_justificatif(
    p_org, 'Avenant signé le ' || to_char(p_signe_le, 'DD/MM/YYYY') || ' — effet au ' || to_char(p_date_effet, 'DD/MM/YYYY'),
    p_storage_path, p_mime, p_taille, p_empreinte);
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_document, p_org, 'bail', p_bail)
  on conflict (document_id, entite, entite_id) do nothing;

  insert into public.avenants_bail (organization_id, bail_id, objet, signe_le, date_effet,
    ancien_loyer_hc, nouveau_loyer_hc, anciennes_charges, nouvelles_charges, document_id, enregistre_par)
  values (p_org, p_bail, v_objet, p_signe_le, p_date_effet,
    round(b.loyer_hc, 2), p_loyer_hc, round(coalesce(b.charges, 0), 2), p_charges, v_document, auth.uid())
  returning id into v_id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'avenant_bail_enregistre', jsonb_build_object(
    'avenant_id', v_id, 'bail_id', p_bail, 'date_effet', p_date_effet, 'signe_le', p_signe_le,
    'ancien_loyer_hc', round(b.loyer_hc, 2), 'nouveau_loyer_hc', p_loyer_hc,
    'anciennes_charges', round(coalesce(b.charges, 0), 2), 'nouvelles_charges', p_charges, 'document_id', v_document));

  -- Effet déjà atteint (le loyer du mois d'effet n'est pas encore appelé, vérifié plus haut) : les loyers manquants
  -- sont appelés maintenant, par le générateur habituel. C'est en créant le premier loyer concerné que l'avenant
  -- s'applique (déclencheur ci-dessous) : un mois d'AVANT la date d'effet, appelé en retard, garde l'ancien montant.
  if p_date_effet <= v_aujourdhui then
    perform public.generer_appels_loyer_interne(p_bail);
    -- Filet : aucun loyer n'était à appeler à partir de la date d'effet (cas limite). Son effet est atteint : il
    -- s'applique quand même. Sans effet si le déclencheur l'a déjà appliqué.
    perform public.appliquer_avenant_bail_interne(v_id);
  end if;
  return v_id;
end;
$$;
revoke all on function public.enregistrer_avenant_bail(uuid, uuid, text, date, date, numeric, numeric, text, text, bigint, text) from public, anon;
grant execute on function public.enregistrer_avenant_bail(uuid, uuid, text, date, date, numeric, numeric, text, text, bigint, text) to authenticated;
comment on function public.enregistrer_avenant_bail(uuid, uuid, text, date, date, numeric, numeric, text, text, bigint, text) is
  'Enregistre un avenant signé qui modifie le loyer hors charges ou les charges d''un bail en cours (P1-14). Effet au 1er d''un mois dont le loyer n''est pas encore appelé.';

-- ── 4. L'annulation, tant que l'avenant n'est pas appliqué ───────────────────────────────────────────────────────
create or replace function public.annuler_avenant_bail(p_org uuid, p_avenant uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.avenants_bail;
  v_motif text := btrim(coalesce(p_motif, ''));
begin
  select * into a from public.avenants_bail where id = p_avenant and organization_id = p_org for update;
  if not found or not public.verifier_gerant_avenant_bail(p_org, a.bail_id) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if a.annule_le is not null then return; end if;
  if a.applique_le is not null then
    raise exception 'Cet avenant est déjà appliqué au bail : il ne s''annule plus. Une nouvelle modification passe par un nouvel avenant';
  end if;
  if length(v_motif) not between 5 and 500 then
    raise exception 'Indiquez le motif de l''annulation (5 à 500 caractères)';
  end if;
  update public.avenants_bail set annule_le = now(), annule_par = auth.uid(), annulation_motif = v_motif where id = a.id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (auth.uid(), p_org, 'avenant_bail_annule', jsonb_build_object(
    'avenant_id', a.id, 'bail_id', a.bail_id, 'date_effet', a.date_effet, 'motif', v_motif));
end;
$$;
revoke all on function public.annuler_avenant_bail(uuid, uuid, text) from public, anon;
grant execute on function public.annuler_avenant_bail(uuid, uuid, text) to authenticated;

-- ── 5. L'avenant en attente s'applique au premier loyer appelé qu'il concerne ────────────────────────────────────
-- Le générateur des appels (generer_appels_loyer_interne) lit le bail UNE fois, puis crée les mois manquants. Ce
-- déclencheur passe avant chaque création : si un avenant en attente a atteint sa date d'effet pour la période
-- appelée, il l'applique au bail, puis recalcule les montants de CET appel d'après le bail à jour — avec la règle du
-- générateur (mois entier, ou prorata des jours dus à l'entrée et à la sortie). Il n'agit QUE dans la transaction où
-- un avenant vient de s'appliquer : partout ailleurs, il rend la ligne telle que le générateur l'a écrite.
create or replace function public.appliquer_avenant_a_l_appel()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a record;
  b public.baux;
  v_jours_mois integer;
  v_premier integer;
  v_dernier integer;
  v_jours_dus integer;
begin
  if not exists (select 1 from public.avenants_bail av
                  where av.bail_id = new.bail_id and av.annule_le is null and av.date_effet <= new.periode) then
    return new;
  end if;
  for a in select av.id from public.avenants_bail av
            where av.bail_id = new.bail_id and av.annule_le is null and av.applique_le is null
              and av.date_effet <= new.periode
            order by av.date_effet
  loop
    perform public.appliquer_avenant_bail_interne(a.id);
  end loop;
  -- Rien ne s'est appliqué dans cette transaction : le générateur a lu un bail à jour, sa ligne fait foi.
  if not exists (select 1 from public.avenants_bail av
                  where av.bail_id = new.bail_id and av.applique_le = now() and av.date_effet <= new.periode) then
    return new;
  end if;

  select * into b from public.baux where id = new.bail_id;
  v_jours_mois := extract(day from (new.periode + interval '1 month' - interval '1 day'))::integer;
  v_premier := case when b.date_debut is not null and new.periode = date_trunc('month', b.date_debut)::date
                    then extract(day from b.date_debut)::integer else 1 end;
  v_dernier := case when b.date_fin is not null and new.periode = date_trunc('month', b.date_fin)::date
                    then extract(day from b.date_fin)::integer else v_jours_mois end;
  v_jours_dus := greatest(0, v_dernier - v_premier + 1);
  if v_jours_dus = v_jours_mois then
    new.loyer_hc := round(coalesce(b.loyer_hc, 0), 2);
    new.charges := round(coalesce(b.charges, 0), 2);
  else
    new.loyer_hc := round(coalesce(b.loyer_hc, 0) * v_jours_dus / v_jours_mois, 2);
    new.charges := round(coalesce(b.charges, 0) * v_jours_dus / v_jours_mois, 2);
  end if;
  new.montant_du := new.loyer_hc + new.charges;
  new.prorata := v_jours_dus < v_jours_mois;
  return new;
end;
$$;
revoke all on function public.appliquer_avenant_a_l_appel() from public, anon, authenticated, service_role;

-- « a_avenant_du_bail » passe avant « a_verrou_echeancier » et « appel_loyer_base_mensuelle » (ordre alphabétique) :
-- la base mensuelle de l'appel est donc lue sur le bail déjà à jour.
drop trigger if exists a_avenant_du_bail on public.appels_loyer;
create trigger a_avenant_du_bail before insert on public.appels_loyer
  for each row execute function public.appliquer_avenant_a_l_appel();

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
