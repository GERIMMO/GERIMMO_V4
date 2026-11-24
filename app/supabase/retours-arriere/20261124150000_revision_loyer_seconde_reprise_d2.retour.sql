-- RETOUR ARRIÈRE de 20261124150000_revision_loyer_seconde_reprise_d2.sql (décisions du dirigeant du 24/11/2026, lot D2,
-- seconde reprise).
--
-- Rend à `reviser_loyer(uuid,numeric,text,date)` sa définition d'avant (mêmes quatre endroits, relus dans la définition EN
-- VIGUEUR et attendus une seule fois chacun), et rend au déclencheur `a_revision_du_bail` et à la fonction de lecture du
-- locataire leur texte de la migration 20261124130000, recopié tel quel.
-- Une base déjà revenue, ou qui n'a jamais reçu la seconde reprise, est laissée telle quelle (rejouable) ; une fonction qui
-- ne porte qu'une partie de la seconde reprise (réécrite depuis) arrête le script sans rien modifier. Un seul bloc : atomique.
--
-- RÉINTRODUIT l'état d'avant : la révision d'une année non faite est rattrapée quand l'année de l'indice de référence ne
-- se lit pas (700 → 742 € dans l'exemple de la migration) ; un indice « NaN », infini ou invraisemblable est accepté ;
-- l'indice de la révision suivante est accepté ; un terme appelé en retard autour d'un avenant peut porter un loyer ou des
-- charges qui ne valaient pas pour lui ; les révisions du locataire ne sont triées que par premier terme.
-- AUCUNE DONNÉE N'EST MODIFIÉE NI SUPPRIMÉE : ni révision, ni appel de loyer, ni avenant, ni bail ; rien n'est recalculé.
-- À jouer AVANT le retour de 20261124130000 (qui attend ses propres lignes intactes : joué en premier, il s'arrête sans
-- rien modifier). Indépendant du retour du code : le code de la seconde reprise fonctionne avec la base d'avant (il
-- affiche seulement le champ de l'indice de l'année précédente dans des cas où la base ne l'exige plus).
do $retour$
declare
  c_signature constant text := 'public.reviser_loyer(uuid,numeric,text,date)';
  -- Les quatre endroits : [texte d'avant, texte de la seconde reprise]. Mêmes textes que la migration.
  c_endroits constant text[][] := array[
    -- 1. Constat 7 : l'indice de la révision suivante est refusé. Posé juste avant la lecture de l'année de la référence.
    [E'  v_annee_ref := coalesce(public.trimestre_irl_annee(v_derniere.irl_trimestre),\n',
     $bloc$  -- Seconde reprise du lot D2 (24/11/2026) : l'année de l'indice nouveau ne peut pas dépasser l'année de la date de
  -- révision à laquelle la demande est rattachée. Un indice d'une année plus récente est celui de la révision suivante.
  if v_annee > extract(year from v_echeance)::integer then
    raise exception 'Indice du % refusé : cet indice est celui de la révision suivante. La révision demandée est celle du % : l''année de son indice ne peut pas dépasser %',
      v_trimestre, to_char(v_echeance, 'DD/MM/YYYY'), extract(year from v_echeance)::integer;
  end if;
  v_annee_ref := coalesce(public.trimestre_irl_annee(v_derniere.irl_trimestre),
$bloc$],
    -- 2. Constat 1 : l'année non faite se reconnaît à l'année de bail (ligne posée par 20261124130000).
    [E'  if v_annee_ref is not null and v_annee > v_annee_ref + 1 then\n',
     $bloc$  -- Seconde reprise du lot D2 : l'année non faite se reconnaît d'abord à l'ANNÉE DE BAIL (aucune révision pour l'année
  -- de bail précédente), et plus seulement à l'année lue dans le libellé du trimestre, qui peut manquer (« T2 », vide).
  if (v_n >= 2 and not exists (select 1 from public.revisions_loyer r
                                where r.bail_id = p_bail and public.annee_de_bail(v.date_debut, r.date_effet) = v_n - 1))
     or (v_annee_ref is not null and v_annee > v_annee_ref + 1) then
$bloc$],
    -- 3. Le message de ce refus ne cite plus l'année lue de la référence, qui peut manquer, et n'affirme plus qu'une
    --    révision « n'a pas été faite » : la base sait seulement qu'aucune n'est enregistrée (bail repris en cours, par
    --    exemple). Message posé par 20261124130000.
    [$bloc$      raise exception 'Indice du T% % obligatoire : l''indice de référence de ce bail est celui de %, la révision d''une année au moins n''a pas été faite. Elle n''est pas rattrapée : le loyer se révise sur un an, avec l''indice du même trimestre de l''année précédente (T% %). Saisissez cet indice',
        v_trim, v_annee - 1, v_annee_ref, v_trim, v_annee - 1;
$bloc$,
     $bloc$      raise exception 'Indice du T% % obligatoire : aucune révision n''est enregistrée pour l''année de bail précédente, ou l''indice de référence de ce bail est plus ancien. Une révision qui n''a pas été faite n''est pas rattrapée : le loyer se révise sur un an, avec l''indice du même trimestre de l''année précédente (T% %). Saisissez cet indice',
        v_trim, v_annee - 1, v_trim, v_annee - 1;
$bloc$],
    -- 4. Constat 2 : les deux indices doivent être des nombres vraisemblables. Posé juste avant le calcul.
    [E'  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);\n',
     $bloc$  -- Seconde reprise du lot D2 : GARDE-FOU DE SAISIE, pas une règle de droit. Le rapport entre l'indice nouveau et
  -- l'indice de référence doit être compris entre 0,8 et 1,25 (plage volontairement large). Ce seul contrôle écarte aussi
  -- ce qui n'est pas un nombre utilisable : « NaN », l'infini, zéro et les valeurs négatives ne donnent jamais un
  -- rapport dans cette plage.
  if not coalesce(p_irl_nouveau / nullif(v_reference, 0) between 0.8 and 1.25, false) then
    raise exception 'Révision refusée : vérifiez les indices saisis. L''indice nouveau (%) et l''indice de référence (%) doivent être deux nombres positifs proches l''un de l''autre',
      p_irl_nouveau, v_reference;
  end if;
  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);
$bloc$]
  ];
  v_oid regprocedure := to_regprocedure(c_signature);
  v_def text;
  v_apres integer := 0;
  paire text[];
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % est absente de cette base ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Combien des quatre textes de la seconde reprise se lisent (une fois chacun) dans la définition en vigueur.
  foreach paire slice 1 in array c_endroits loop
    if (length(v_def) - length(replace(v_def, paire[2], ''))) / length(paire[2]) = 1 then
      v_apres := v_apres + 1;
    end if;
  end loop;
  if v_apres = 4 then
    foreach paire slice 1 in array c_endroits loop
      v_def := replace(v_def, paire[2], paire[1]);
    end loop;
    execute v_def;
    raise notice '% : définition d''avant rétablie', c_signature;
  elsif v_apres = 0 then
    -- Déjà revenue, ou base qui n'a jamais reçu la seconde reprise : aucun de ses textes ne s'y lit.
    raise notice '% : aucun texte de la seconde reprise, rien à faire', c_signature;
  else
    raise exception 'Retour arrière : % ne porte qu''une partie de la seconde reprise (% endroit(s) sur 4) : définition réécrite depuis, rien n''est modifié.',
      c_signature, v_apres;
  end if;

  -- Le déclencheur et la lecture du locataire retrouvent leur texte de la migration 20261124130000, recopié tel quel,
  -- seulement quand la seconde reprise vient d'être retirée de `reviser_loyer` : sur une base déjà revenue (ou revenue
  -- plus loin, avant la reprise), ces fonctions ne sont ni réécrites ni créées.
  if v_apres = 4 then
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
  end if;

  delete from supabase_migrations.schema_migrations where version = '20261124150000';
end $retour$;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
