-- SCI-2 (audit après publication de la PR #347, 19/11/2026) : la fiche d'une société et celle de la personne physique
-- qui la gère peuvent porter la même adresse e-mail.
--
-- LE DÉFAUT. À l'ouverture de l'espace d'une SCI, la fiche de la société naît sans e-mail : l'adresse du compte va à la
-- fiche de la personne qui la gère (candidate au pouvoir de signer, migration 20261119085820), et l'index
-- `persons_email_unique_par_agence` (retour recette 08/08) interdit à deux fiches vivantes d'un même espace de la porter.
-- Le récapitulatif du bail réclame alors « Adresse e-mail des parties », et la personne ne peut pas y mettre sa propre
-- adresse : l'annuaire la refuse (« déjà portée par une autre fiche »). Dans une petite SCI, l'adresse de la société est
-- celle de sa gérante.
--
-- LA RÈGLE. Une adresse reste unique parmi les personnes physiques d'un espace, et unique parmi ses sociétés (SCI, SCI
-- familiale, personne morale) ; une société peut partager celle d'une personne physique. Deux particuliers, ou deux
-- sociétés, ne partagent toujours pas une adresse. L'annuaire applique la même règle (app/actions/personnes.ts).
--
-- Rejouable : le nouvel index est créé s'il manque (il est moins strict que l'ancien : aucune fiche existante ne le
-- viole), sa définition est contrôlée, puis l'ancien est retiré. Aucune donnée n'est modifiée.
create unique index if not exists persons_email_unique_par_agence_et_nature
  on public.persons (organization_id, lower(email), (coalesce(qualite in ('SCI', 'SCI familiale', 'Personne morale'), false)))
  where email is not null and archived_at is null;

-- Si un index du même nom existait déjà avec une autre définition, `if not exists` l'aurait laissé tel quel : on
-- s'arrête plutôt que de retirer l'ancienne garantie sans la remplacer.
do $controle$
declare v_def text;
begin
  select pg_get_indexdef(i.indexrelid) into v_def
    from pg_index i
   where i.indexrelid = to_regclass('public.persons_email_unique_par_agence_et_nature');
  if v_def is null
     or v_def not like 'CREATE UNIQUE INDEX%'
     or v_def not like '%(organization_id, lower(email), COALESCE((qualite = ANY (ARRAY[''SCI''::text, ''SCI familiale''::text, ''Personne morale''::text])), false))%'
     or v_def not like '%WHERE ((email IS NOT NULL) AND (archived_at IS NULL))%' then
    raise exception 'Index persons_email_unique_par_agence_et_nature : définition inattendue (%)', coalesce(v_def, 'absent');
  end if;
end $controle$;

drop index if exists public.persons_email_unique_par_agence;

comment on index public.persons_email_unique_par_agence_et_nature is
  'Une adresse e-mail par personne physique et par société d''un même espace ; une société peut partager celle de la personne qui la gère (SCI-2, 19/11/2026).';

-- Convention de toute migration (aucune fonction n'est touchée ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();
