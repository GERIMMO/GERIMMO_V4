-- Audit du 2026-09-10 — huit tables portaient RLS SANS aucune politique.
--
-- Ce sont les tables des chantiers additifs du 03-04/09 (invitations,
-- candidatures artisans, circuits de signature, reprise de portefeuille,
-- fonds mandants, contrôles de solvabilité) : créées d'avance, jamais
-- câblées. Sans politique, elles refusent tout par défaut — aucune fuite,
-- aucun flux cassé (vérifié : le formulaire d'invitation passe par une RPC,
-- pas par la table). Mais elles conservaient les privilèges Supabase par
-- défaut : anon et authenticated y ont INSERT/UPDATE/DELETE, et la seule
-- barrière est l'absence de politique. Une politique ajoutée un jour sans
-- réflexion sur ces privilèges ouvrirait tout d'un coup.
--
-- On ferme donc explicitement plutôt que d'ouvrir prématurément : une table
-- non câblée n'accorde aucun privilège. Le jour de son câblage, le chantier
-- posera ses politiques ET ses grants, en connaissance de cause.

do $$
declare t text;
begin
  foreach t in array array[
    'invitations', 'artisan_candidatures', 'signature_circuits',
    'signature_signataires', 'reprises_portefeuille', 'reprise_soldes',
    'mouvements_mandants', 'controles_solvabilite'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format(
      'comment on table public.%I is %L', t,
      'Chantier non câblé (audit 2026-09-10) : RLS actif, aucune politique, aucun privilège anon/authenticated. À ouvrir avec ses politiques le jour du câblage.'
    );
  end loop;
end $$;
