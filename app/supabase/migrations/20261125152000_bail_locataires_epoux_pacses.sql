-- Décision du dirigeant du 24/11/2026 (nuit) — case « mariés ou pacsés » au bail (25/11/2026).
-- Texte de référence : recueil fourni par le dirigeant (loi du 6 juillet 1989, article 8-1, I et VI), source et version
-- déclarées, non recontrôlé.
--
-- CE QUE DIT LE TEXTE. Article 8-1, I : la colocation est la location d'un même logement par plusieurs locataires « à
-- l'exception de la location consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de
-- solidarité au moment de la conclusion initiale du contrat ». Article 8-1, VI : la solidarité d'un des colocataires et
-- celle de sa caution prennent fin à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau colocataire
-- figure au bail ; à défaut, au plus tard six mois après la date d'effet du congé. Une location consentie à des époux ou
-- à des partenaires de PACS n'est donc pas une colocation au sens de cet article, et le VI ne la vise pas. Le recueil ne
-- fixe aucun autre terme à leur solidarité : elle reste celle que prévoit la clause du bail (« tenus solidairement et
-- indivisiblement de l'exécution du présent contrat »). Gerimmo n'enregistre donc AUCUNE date de fin.
--
-- CE QUI CHANGE.
--  1. Colonne `baux.locataires_epoux_pacses` (booléen, faux par défaut, jamais vide) : la case cochée à la préparation
--     d'un bail à deux locataires. Faux pour tous les baux existants : leur comportement ne change pas. Comme toute
--     colonne du bail, elle est figée dès la signature pour un appel direct (`verrouiller_bail_hors_fonctions`).
--  2. `enregistrer_depart_colocataire` : sur un bail dont la case est cochée, le départ s'enregistre sans date de fin de
--     solidarité (vide), avec ou sans remplaçant ; sans la case, rien ne change (six mois après la date d'effet du congé,
--     ou cette date en cas de remplacement). Les appels de loyer et les relances, qui gardent tout colocataire dont la
--     date de fin est vide ou à venir (`appels_a_envoyer`, `relances_loyer_dues`), continuent donc d'écrire au locataire
--     parti et de compter son garant : aucune de ces deux fonctions n'est modifiée.
--
-- CE QUI NE CHANGE PAS. Aucun départ déjà enregistré n'est réécrit ; aucune autre ligne n'est modifiée (l'ajout de la
-- colonne pose « faux » partout, sans réécrire une donnée existante). Aucune règle de lecture (RLS) n'est touchée, aucun
-- droit n'est ouvert : la colonne suit les droits de la table. La fonction garde SECURITY DEFINER, son chemin de
-- recherche vide, ses droits et sa signature. Elle est relue dans sa définition EN VIGUEUR : la ligne d'ancrage est
-- attendue une fois ; déjà complétée (rejeu) : rien à faire ; toute autre forme arrête la migration sans rien modifier.
-- Rejouable. Retour arrière : supabase/retours-arriere/20261125152000_bail_locataires_epoux_pacses.retour.sql

alter table public.baux add column if not exists locataires_epoux_pacses boolean not null default false;
comment on column public.baux.locataires_epoux_pacses is
  'Case « mariés ou pacsés » (décision du 24/11/2026) : le bail est consenti exclusivement à deux époux ou partenaires de PACS au moment de sa conclusion (article 8-1, I, de la loi du 6 juillet 1989). Cochée : pas de fin de solidarité enregistrée au départ de l''un d''eux, clause adaptée au contrat. Faux par défaut : règle de la colocation.';

do $epoux_pacses$
declare
  c_signature constant text := 'public.enregistrer_depart_colocataire(uuid,date,uuid)';
  c_ancrage constant text := $a$    v_fin := (p_date_effet_conge + interval '6 months')::date;
  end if;$a$;
  c_ajout constant text := $n$
  -- Case « mariés ou pacsés » (décision du 24/11/2026) : une location consentie exclusivement à des époux ou à des
  -- partenaires de PACS n'est pas une colocation (article 8-1, I) ; la fin de la solidarité du VI ne la vise pas, et le
  -- texte n'en fixe pas d'autre : aucune date de fin n'est enregistrée, avec ou sans remplaçant.
  if coalesce((select b.locataires_epoux_pacses from public.baux b where b.id = v.bail_id), false) then
    v_fin := null;
  end if;$n$;
  definition text;
  corps text;
  occurrences integer;
begin
  select pg_get_functiondef(p.oid), p.prosrc into definition, corps
    from pg_proc p where p.oid = to_regprocedure(c_signature) and p.prosecdef;
  if corps is null then
    raise exception 'Case « mariés ou pacsés » : fonction % introuvable ou inattendue ; rien n''est modifié', c_signature;
  end if;
  -- Déjà appliquée (rejeu) : rien à faire.
  if position('locataires_epoux_pacses' in corps) > 0 then
    return;
  end if;
  occurrences := (length(corps) - length(replace(corps, c_ancrage, ''))) / length(c_ancrage);
  if occurrences <> 1 then
    raise exception 'Case « mariés ou pacsés » : définition inattendue pour % (% occurrence(s) de la ligne des six mois) ; rien n''est modifié', c_signature, occurrences;
  end if;
  execute replace(definition, corps, replace(corps, c_ancrage, c_ancrage || c_ajout));
end $epoux_pacses$;
