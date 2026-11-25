-- Décisions du dirigeant du 24/11/2026, lot D2 : révision annuelle du loyer (Q23 et Q43).
--
-- CE QUI CHANGE, pour les révisions enregistrées À PARTIR de cette migration seulement :
--
--  1. Q23, « refus au-delà ». La révision d'une année se demande pendant un an à compter de la date de révision (la date
--     anniversaire du bail). Exemple : date de révision le 15/10/2025, date limite le 14/10/2026. Passé cette date,
--     `reviser_loyer` refuse d'enregistrer la révision de cette année-là, même avec une demande datée d'avant.
--     Source : fiche officielle Service-Public F1311 lue le 24/11/2026 (« Lorsque le délai d'un an est écoulé, la révision
--     non appliquée est perdue pour le propriétaire »). L'article de loi lui-même n'a pas été lu.
--     Avant : une demande antidatée passait toujours, puisque la date de révision se déduit de la date de la demande.
--
--  2. Q43, « jamais pour des jours antérieurs à la demande ». Le loyer révisé s'applique au PREMIER TERME dont la période
--     commence après la date de la demande et qui n'est pas déjà appelé. Les termes sont des mois civils : pour une
--     demande du 15/10 ou du 31/10, c'est le terme de novembre ; pour une demande du 01/11, celui de décembre.
--     Ce premier terme est écrit sur la révision (nouvelle colonne `revisions_loyer.premier_terme`) : la lettre l'imprime.
--     Un terme d'avant qui serait appelé plus tard (rattrapage) reste au loyer d'avant la révision : c'est le rôle du
--     déclencheur `a_revision_du_bail` sur `appels_loyer`. Même règle en cas de baisse de l'indice.
--     Avant : un terme appelé après l'enregistrement portait le loyer révisé pour le mois entier, jours d'avant la demande
--     compris.
--
-- CE QUI NE CHANGE PAS : le calcul du loyer révisé, l'indice, la date de révision, `date_effet` (qui reste la date à
-- laquelle la révision est acquise : la date de révision, ou la date de la demande si elle est plus tardive ; elle sert à
-- compter une révision par année de bail), les droits, les règles de lecture. AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE : les
-- révisions déjà enregistrées gardent `premier_terme` vide et se comportent comme avant ; aucun appel de loyer n'est
-- recalculé.
--
-- COMMENT. `reviser_loyer` est relue dans sa définition EN VIGUEUR (pg_get_functiondef) et complétée à cinq endroits
-- précis, chacun attendu une seule fois ; une définition déjà complétée est laissée telle quelle (rejeu sans effet) ; toute
-- autre forme arrête la migration sans rien modifier.
-- Retour arrière : supabase/retours-arriere/20261124100000_revision_loyer_delai_et_premier_terme.retour.sql

alter table public.revisions_loyer add column if not exists premier_terme date;
comment on column public.revisions_loyer.premier_terme is
  'Premier terme (1er du mois) appelé au loyer révisé : le premier dont la période commence après la date de la demande et qui n''était pas déjà appelé. Vide pour les révisions antérieures au 24/11/2026.';

do $revision_d2$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les cinq endroits complétés : [texte en vigueur, texte de ce lot].
  c_variables_avant constant text := E'  v_trimestre text;\nbegin';
  c_variables_apres constant text := E'  v_trimestre text;\n  v_aujourdhui date;\n  v_limite date;\n  v_premier_terme date;\nbegin';
  -- Le jour de Paris est lu une seule fois et gardé : le contrôle du délai le relit sans nouvel appel (les migrations
  -- du lot « jour de Paris » comptent les appels à `public.aujourdhui_paris()` dans cette fonction : il en reste deux).
  c_jour_avant constant text := E'  if p_date_demande > public.aujourdhui_paris() then\n';
  c_jour_apres constant text := E'  v_aujourdhui := public.aujourdhui_paris();\n  if p_date_demande > v_aujourdhui then\n';
  c_effet_avant constant text := E'  v_effet := greatest(v_echeance, p_date_demande);\n';
  c_effet_apres constant text := c_effet_avant || $bloc$
  -- Décision Q23 du 24/11/2026 : la révision d'une année se demande pendant un an à compter de sa date de révision.
  -- Passé ce délai, elle est refusée, même avec une demande datée d'avant.
  v_limite := ((v.date_debut + make_interval(years => v_n + 1))::date - 1);
  if v_aujourdhui > v_limite then
    raise exception 'Révision refusée : la révision prévue le % pouvait être demandée jusqu''au %. Ce délai d''un an est passé : la révision de cette année-là n''est plus possible (selon la fiche officielle Service-Public consultée le 24/11/2026). Pour la révision de l''année en cours, datez la demande d''aujourd''hui',
      to_char(v_echeance, 'DD/MM/YYYY'), to_char(v_limite, 'DD/MM/YYYY');
  end if;

  -- Décision Q43 du 24/11/2026 : le loyer révisé ne s'applique jamais à des jours antérieurs à la demande. Il s'applique
  -- au premier terme (mois civil) qui commence après la date de la demande et qui n'est pas déjà appelé.
  v_premier_terme := (date_trunc('month', p_date_demande) + interval '1 month')::date;
  select greatest(v_premier_terme, (max(a.periode) + interval '1 month')::date) into v_premier_terme
    from public.appels_loyer a where a.bail_id = p_bail;
$bloc$;
  c_colonnes_avant constant text := 'date_echeance, date_demande, irl_trimestre)';
  c_colonnes_apres constant text := 'date_echeance, date_demande, irl_trimestre, premier_terme)';
  c_valeurs_avant constant text := 'v_echeance, p_date_demande, v_trimestre);';
  c_valeurs_apres constant text := 'v_echeance, p_date_demande, v_trimestre, v_premier_terme);';
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_avant integer := 0;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Révision du loyer : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Chaque endroit doit se lire une seule fois, sous sa forme d'avant ou sous celle de ce lot.
  foreach paire slice 1 in array array[
    [c_variables_avant, c_variables_apres], [c_jour_avant, c_jour_apres], [c_effet_avant, c_effet_apres],
    [c_colonnes_avant, c_colonnes_apres], [c_valeurs_avant, c_valeurs_apres]]
  loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    elsif (length(v_def) - length(replace(v_def, paire[1], ''))) / length(paire[1]) = 1 then
      v_avant := v_avant + 1;
    end if;
  end loop;
  if v_apres = 5 then
    raise notice 'Révision du loyer : % porte déjà le délai d''un an et le premier terme, rien à faire.', c_signature;
  elsif v_avant = 5 then
    v_def := replace(v_def, c_variables_avant, c_variables_apres);
    v_def := replace(v_def, c_jour_avant, c_jour_apres);
    v_def := replace(v_def, c_effet_avant, c_effet_apres);
    v_def := replace(v_def, c_colonnes_avant, c_colonnes_apres);
    v_def := replace(v_def, c_valeurs_avant, c_valeurs_apres);
    execute v_def;
  else
    raise exception 'Révision du loyer : % ne porte ni la définition attendue ni celle de ce lot (% endroit(s) d''avant, % de ce lot, sur 5) : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_apres;
  end if;
end $revision_d2$;

-- Un terme d'AVANT le premier terme révisé, appelé après l'enregistrement de la révision (rattrapage d'un mois manquant,
-- appels générés en retard), garde le loyer d'avant la révision. Le générateur lit le loyer du bail, déjà révisé : ce
-- déclencheur remet le loyer d'avant, au prorata des jours dus comme le générateur (montants_appel_loyer). Les charges ne
-- sont pas touchées. Il ne fait rien pour les révisions d'avant ce lot (premier_terme vide), ni quand un avenant appliqué
-- depuis la révision a fixé le loyer de ce terme (l'avenant, plus récent, fait foi).
-- Son nom le place après `a_avenant_du_bail` et avant `appel_loyer_base_mensuelle` (ordre alphabétique des déclencheurs).
create or replace function public.appliquer_revision_a_l_appel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fonction$
declare
  r record;
  m record;
begin
  -- La révision dont le premier terme révisé suit ce terme ; s'il y en a plusieurs, la plus ancienne : son « ancien
  -- loyer » est celui qui valait pour ce terme.
  select rv.ancien_loyer, rv.created_at into r
    from public.revisions_loyer rv
   where rv.bail_id = new.bail_id and rv.premier_terme is not null and rv.premier_terme > new.periode
   order by rv.premier_terme, rv.created_at
   limit 1;
  if not found then return new; end if;
  if exists (select 1 from public.avenants_bail av
              where av.bail_id = new.bail_id and av.annule_le is null and av.date_effet <= new.periode
                and av.applique_le >= r.created_at) then
    return new;
  end if;
  select * into m from public.montants_appel_loyer(new.bail_id, new.periode, r.ancien_loyer, 0);
  new.loyer_hc := m.loyer_hc;
  new.base_loyer_hc := r.ancien_loyer;
  new.montant_du := new.loyer_hc + new.charges;
  return new;
end;
$fonction$;

revoke all on function public.appliquer_revision_a_l_appel() from public, anon, authenticated, service_role;

drop trigger if exists a_revision_du_bail on public.appels_loyer;
create trigger a_revision_du_bail before insert on public.appels_loyer
  for each row execute function public.appliquer_revision_a_l_appel();

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
