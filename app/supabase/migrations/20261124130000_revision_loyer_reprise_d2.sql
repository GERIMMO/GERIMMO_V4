-- Décisions du dirigeant du 24/11/2026, lot D2 (reprise après relecture) : révision annuelle du loyer.
--
-- CE QUI CHANGE, pour les révisions enregistrées et les termes appelés À PARTIR de cette migration seulement :
--
--  1. RÉVISION D'UNE ANNÉE NON FAITE : ELLE N'EST PLUS RATTRAPÉE L'ANNÉE SUIVANTE. Avant : bail du 15/10/2023, indice de
--     référence T2 2023 = 100 ; aucune révision en 2024 ; en 2025, l'indice T2 2025 = 106 était accepté et le loyer passait
--     de 700 à 742 € (deux années d'un coup). La fiche officielle lue le 24/11/2026 (Service-Public F1311) donne une formule
--     sur UN an : loyer × indice du trimestre de référence de l'année en cours / indice du même trimestre de l'année
--     précédente. Désormais, quand l'indice nouveau est postérieur de PLUS D'UN AN à l'indice de référence, la révision
--     exige l'indice du même trimestre de l'année précédente et calcule avec lui : 700 × 106 / 103 = 720,39 €. Cet indice
--     est écrit dans `irl_reference`, et son trimestre dans la nouvelle colonne `revisions_loyer.irl_reference_trimestre`
--     (la lettre l'imprime). Sans cet indice : refus, rien n'est écrit.
--     ÉCART D'UN AN (cas normal, une révision par an) : RIEN NE CHANGE.
--
--  2. TERME RATTRAPÉ APRÈS UN AVENANT. Un terme appelé en retard prend le loyer qui valait pour lui : celui d'AVANT le
--     premier changement de loyer postérieur à ce terme, que ce changement soit une révision (son premier terme est après)
--     ou un avenant appliqué (sa date d'effet est après). Avant, seule la révision était regardée : avec une révision, puis
--     un avenant, puis une autre révision, un terme d'avant l'avenant prenait le loyer de l'avenant.
--
--  3. UNE DEMANDE ANTIDATÉE NE FAIT PLUS GAGNER UN TERME. Le premier terme révisé est le plus tardif entre le mois qui suit
--     la date de la demande et le mois qui suit le jour de l'enregistrement (jour de Paris), et toujours après le dernier
--     terme déjà appelé.
--
--  4. UN BAIL TERMINÉ NE SE RÉVISE PLUS (refus clair). Un bail en préavis reste révisable.
--
--  5. LE LOCATAIRE LIT LES RÉVISIONS DE SON PROPRE BAIL (montant d'avant, montant révisé, premier terme révisé) par la
--     fonction `revisions_de_mon_loyer_locataire` : son espace affiche le loyer du terme en cours et annonce le suivant, au
--     lieu d'afficher le loyer révisé avant son premier terme. Elle ne rend que les révisions du bail que
--     `mon_bail_locataire` lui reconnaît déjà (même contrôle de l'appelant, pas de règle nouvelle).
--
-- COMMENT L'INDICE DE L'ANNÉE PRÉCÉDENTE ARRIVE À LA FONCTION. `reviser_loyer(uuid,numeric,text,date)` garde sa signature :
-- plusieurs migrations et leurs retours la relisent par cette signature (20261014821000, 20261124100000), et le code en
-- place l'appelle ainsi. Un paramètre ne s'ajoute pas à une signature existante : la migration crée donc une SECONDE
-- signature, à cinq paramètres, qui ne fait que déposer `p_irl_precedent` dans un réglage de la transaction
-- (« gerimmo.irl_precedent ») puis appeler la première, où tout le calcul reste écrit une seule fois.
-- L'APPEL À QUATRE ARGUMENTS RESTE VALIDE et inchangé dans le cas normal ; dans le cas de l'année non faite, il est refusé
-- (il ne peut pas fournir l'indice).
--
-- CE QUI NE CHANGE PAS : le délai d'un an, la date de révision, une révision par année de bail, le contrôle de l'appelant
-- (`org_ids_avec_roles`, dans la fonction d'origine), SECURITY DEFINER et le chemin de recherche vide de celle-ci, les
-- droits (jamais ouverts aux visiteurs). AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE : ni révision, ni appel de loyer, ni bail.
--
-- La fonction d'origine est relue dans sa définition EN VIGUEUR (pg_get_functiondef) et complétée à six endroits précis,
-- chacun attendu une seule fois, sans toucher aux textes posés par les migrations précédentes (elles restent rejouables).
-- Une définition déjà complétée est laissée telle quelle (rejeu sans effet) ; toute autre forme arrête la migration sans
-- rien modifier.
-- À SAVOIR : la migration 20261124100000 écrit en clair la fonction du déclencheur `appliquer_revision_a_l_appel`. La
-- rejouer APRÈS celle-ci remettrait sa version (point 2 perdu) : rejouer alors celle-ci ensuite.
-- Retour arrière : supabase/retours-arriere/20261124130000_revision_loyer_reprise_d2.retour.sql
-- (à jouer AVANT celui de 20261124100000 : les lignes ajoutées ici se servent de ses variables).

alter table public.revisions_loyer add column if not exists irl_reference_trimestre text;
comment on column public.revisions_loyer.irl_reference_trimestre is
  'Trimestre de l''indice de référence (« T2 2024 ») quand cet indice est celui du même trimestre de l''année précédente, fourni à la révision parce que la révision d''une année n''avait pas été faite. Vide dans le cas normal (la référence est l''indice de la révision précédente ou celui du bail).';

do $reprise_d2$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les six endroits complétés : [texte en vigueur, texte de cette reprise].
  c_endroits constant text[][] := array[
    -- 1. Deux variables : l'indice de l'année précédente reçu, et son trimestre.
    [E'declare\n  v record;\n',
     E'declare\n  v record;\n  v_irl_precedent numeric;\n  v_reference_trimestre text;\n'],
    -- 2. Bail terminé : refus, après le contrôle de l'appelant.
    [E'  if not v.revision_irl then\n',
     $bloc$  -- Reprise du lot D2 (24/11/2026) : un bail terminé ne se révise plus. Un bail en préavis reste révisable.
  if v.etat = 'termine' then
    raise exception 'Révision refusée : ce bail est terminé, son loyer ne se révise plus';
  end if;
  if not v.revision_irl then
$bloc$],
    -- 3. Le premier terme révisé ne se gagne pas en antidatant la demande.
    [E'    from public.appels_loyer a where a.bail_id = p_bail;\n',
     $bloc$    from public.appels_loyer a where a.bail_id = p_bail;
  -- Reprise du lot D2 : antidater la demande ne fait pas gagner un terme. Le premier terme révisé suit aussi le jour de
  -- l'enregistrement (jour de Paris) : c'est le plus tardif des deux.
  v_premier_terme := greatest(v_premier_terme, (date_trunc('month', v_aujourdhui) + interval '1 month')::date);
$bloc$],
    -- 4. Révision d'une année non faite : calcul sur un an, avec l'indice de l'année précédente.
    [E'  v_reference := coalesce(nullif(v_derniere.irl_nouveau, 0), v.irl_valeur);\n',
     $bloc$  v_reference := coalesce(nullif(v_derniere.irl_nouveau, 0), v.irl_valeur);

  -- Reprise du lot D2 (décision du 24/11/2026). La formule de la fiche officielle lue porte sur UN an : indice du
  -- trimestre de référence de l'année en cours / indice du même trimestre de l'année précédente. Quand l'indice nouveau
  -- est postérieur de plus d'un an à l'indice de référence, la révision d'une année au moins n'a pas été faite : elle
  -- n'est pas rattrapée. Le calcul prend l'indice du même trimestre de l'année précédente.
  -- Cet indice est le paramètre p_irl_precedent de reviser_loyer à CINQ paramètres, qui le dépose pour cette fonction
  -- dans le réglage « gerimmo.irl_precedent », le temps de l'appel. Appelée directement (quatre paramètres), cette
  -- fonction ne le reçoit pas et refuse donc ce cas.
  -- Écart d'un an (cas normal) : rien ne change, l'indice de l'année précédente n'est pas lu.
  if v_annee_ref is not null and v_annee > v_annee_ref + 1 then
    v_irl_precedent := nullif(current_setting('gerimmo.irl_precedent', true), '')::numeric;
    if v_irl_precedent is null or v_irl_precedent <= 0 then
      raise exception 'Indice du T% % obligatoire : l''indice de référence de ce bail est celui de %, la révision d''une année au moins n''a pas été faite. Elle n''est pas rattrapée : le loyer se révise sur un an, avec l''indice du même trimestre de l''année précédente (T% %). Saisissez cet indice',
        v_trim, v_annee - 1, v_annee_ref, v_trim, v_annee - 1;
    end if;
    v_reference := v_irl_precedent;
    v_reference_trimestre := 'T' || v_trim || ' ' || (v_annee - 1);
  end if;
$bloc$],
    -- 5 et 6. Le trimestre de cet indice est écrit sur la révision.
    ['nouveau_loyer, irl_reference, irl_nouveau,',
     'nouveau_loyer, irl_reference, irl_reference_trimestre, irl_nouveau,'],
    ['v_nouveau, v_reference, p_irl_nouveau,',
     'v_nouveau, v_reference, v_reference_trimestre, p_irl_nouveau,']
  ];
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_avant integer := 0;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Révision du loyer (reprise) : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Chaque endroit doit se lire une seule fois, sous sa forme d'avant ou sous celle de cette reprise.
  foreach paire slice 1 in array c_endroits loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    elsif (length(v_def) - length(replace(v_def, paire[1], ''))) / length(paire[1]) = 1 then
      v_avant := v_avant + 1;
    end if;
  end loop;
  if v_apres = 6 then
    raise notice 'Révision du loyer (reprise) : % porte déjà la reprise, rien à faire.', c_signature;
  elsif v_avant = 6 then
    foreach paire slice 1 in array c_endroits loop
      v_def := replace(v_def, paire[1], paire[2]);
    end loop;
    execute v_def;
  else
    raise exception 'Révision du loyer (reprise) : % ne porte ni la définition attendue ni celle de cette reprise (% endroit(s) d''avant, % de la reprise, sur 6) : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_apres;
  end if;
end $reprise_d2$;

-- La seconde signature : elle reçoit en plus l'indice du même trimestre de l'année précédente (facultatif : NULL quand
-- il n'y en a pas), le dépose pour la fonction d'origine le temps de l'appel, puis l'efface. Elle ne calcule rien et ne
-- contrôle rien elle-même : elle s'exécute avec les droits de l'APPELANT (pas de SECURITY DEFINER), et c'est la fonction
-- d'origine qui vérifie qui appelle et qui fait tout le reste.
create or replace function public.reviser_loyer(
  p_bail uuid, p_irl_nouveau numeric, p_irl_trimestre text, p_date_demande date, p_irl_precedent numeric)
returns numeric
language plpgsql
set search_path to ''
as $fonction$
declare
  v_nouveau numeric;
begin
  perform set_config('gerimmo.irl_precedent', coalesce(p_irl_precedent::text, ''), true);
  v_nouveau := public.reviser_loyer(p_bail, p_irl_nouveau, p_irl_trimestre, p_date_demande);
  perform set_config('gerimmo.irl_precedent', '', true);
  return v_nouveau;
end;
$fonction$;

revoke all on function public.reviser_loyer(uuid, numeric, text, date, numeric) from public, anon;
grant execute on function public.reviser_loyer(uuid, numeric, text, date, numeric) to authenticated, service_role;

-- Un terme d'AVANT un changement de loyer, appelé après ce changement (rattrapage d'un mois manquant, appels générés en
-- retard), garde le loyer qui valait pour lui. Le générateur lit le loyer du bail, déjà changé : ce déclencheur remet le
-- loyer d'avant, au prorata des jours dus comme le générateur (montants_appel_loyer). Les charges ne sont pas touchées.
-- Remplace la version du 24/11 (migration 20261124100000), qui ne regardait que les révisions.
create or replace function public.appliquer_revision_a_l_appel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fonction$
declare
  c record;
  m record;
begin
  -- Le premier changement de loyer postérieur à ce terme : une révision dont le premier terme révisé est après, ou un
  -- avenant appliqué dont la date d'effet est après. Son « ancien » montant est le loyer qui valait pour ce terme.
  -- Les révisions d'avant le 24/11/2026 (premier_terme vide) ne sont pas regardées : elles se comportent comme avant.
  select x.ancien, x.enregistre into c
    from (
      select rv.premier_terme as effet, rv.ancien_loyer as ancien, rv.created_at as enregistre
        from public.revisions_loyer rv
       where rv.bail_id = new.bail_id and rv.premier_terme > new.periode
      union all
      select av.date_effet, av.ancien_loyer_hc, av.applique_le
        from public.avenants_bail av
       where av.bail_id = new.bail_id and av.annule_le is null and av.applique_le is not null
         and av.date_effet > new.periode
    ) x
   order by x.effet, x.enregistre
   limit 1;
  if not found then return new; end if;
  -- Un avenant qui couvre déjà ce terme (date d'effet atteinte), appliqué APRÈS ce changement : il est plus récent et a
  -- fixé le loyer de ce terme, il fait foi (règle du 24/11, inchangée).
  if exists (select 1 from public.avenants_bail av
              where av.bail_id = new.bail_id and av.annule_le is null and av.date_effet <= new.periode
                and av.applique_le >= c.enregistre) then
    return new;
  end if;
  select * into m from public.montants_appel_loyer(new.bail_id, new.periode, c.ancien, 0);
  new.loyer_hc := m.loyer_hc;
  new.base_loyer_hc := c.ancien;
  new.montant_du := new.loyer_hc + new.charges;
  return new;
end;
$fonction$;

revoke all on function public.appliquer_revision_a_l_appel() from public, anon, authenticated, service_role;

-- Les révisions du bail du locataire connecté, pour que son espace affiche le loyer du terme en cours et annonce le
-- suivant. Le contrôle de l'appelant est celui de `mon_bail_locataire` (locataire actif de l'espace, titulaire du bail en
-- cours) : la fonction ne rend rien pour un autre bail, ni à un compte qui n'est pas locataire.
create or replace function public.revisions_de_mon_loyer_locataire(p_org uuid)
returns table(bail_id uuid, ancien_loyer numeric, nouveau_loyer numeric, premier_terme date)
language sql
stable
security definer
set search_path to ''
as $fonction$
  select rv.bail_id, rv.ancien_loyer, rv.nouveau_loyer, rv.premier_terme
    from public.revisions_loyer rv
   where rv.organization_id = p_org
     and rv.premier_terme is not null
     and rv.bail_id in (select mb.bail_id from public.mon_bail_locataire(p_org) mb)
   order by rv.premier_terme;
$fonction$;

revoke all on function public.revisions_de_mon_loyer_locataire(uuid) from public, anon;
grant execute on function public.revisions_de_mon_loyer_locataire(uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
