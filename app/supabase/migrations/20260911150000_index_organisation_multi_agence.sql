-- Chaque lecture de l'application filtre sur l'agence — et rien ne l'aidait.
--
-- Constat du 11/09 (advisor Supabase « unindexed_foreign_keys », recoupé par
-- pg_index) : vingt-deux tables portent une colonne organization_id que
-- TOUTES leurs politiques RLS interrogent — vérifié une à une, 52 politiques
-- sur 19 tables, aucune exception — sans qu'aucun index ne commence par
-- cette colonne. La clé étrangère elle-même n'était pas couverte.
--
-- Aujourd'hui l'effet est nul : ces tables comptent de 0 à 44 lignes, et le
-- planificateur balaie sans y penser. C'est précisément pour cela qu'on le
-- pose maintenant : sur une instance réelle, où chaque agence apporte ses
-- milliers d'appels de loyer et d'encaissements, un balayage complet par
-- requête et par locataire est la falaise classique du multi-agence — et on
-- la découvre quand il est trop tard, sous la charge.
--
-- Un index simple sur organization_id, pas un composite : le filtre d'agence
-- est le seul que TOUTES les requêtes de ces tables partagent. Les autres
-- prédicats varient d'un écran à l'autre et se combinent très bien avec lui.
--
-- Coût en écriture : une entrée d'index par insertion. Négligeable devant le
-- balayage qu'il remplace en lecture.

create index if not exists appel_charges_postes_org_idx on public.appel_charges_postes (organization_id);
create index if not exists appels_charges_org_idx on public.appels_charges (organization_id);
create index if not exists appels_loyer_org_idx on public.appels_loyer (organization_id);
create index if not exists bail_personnes_org_idx on public.bail_personnes (organization_id);
create index if not exists bien_infos_pratiques_org_idx on public.bien_infos_pratiques (organization_id);
create index if not exists depot_encaissements_org_idx on public.depot_encaissements (organization_id);
create index if not exists edl_cles_org_idx on public.edl_cles (organization_id);
create index if not exists edl_compteurs_org_idx on public.edl_compteurs (organization_id);
create index if not exists encaissements_org_idx on public.encaissements (organization_id);
create index if not exists incident_evenements_org_idx on public.incident_evenements (organization_id);
create index if not exists inventaire_lignes_org_idx on public.inventaire_lignes (organization_id);
create index if not exists invitations_org_idx on public.invitations (organization_id);
create index if not exists lot_pieces_org_idx on public.lot_pieces (organization_id);
create index if not exists mouvements_mandants_org_idx on public.mouvements_mandants (organization_id);
create index if not exists quittances_org_idx on public.quittances (organization_id);
create index if not exists rapports_gestion_org_idx on public.rapports_gestion (organization_id);
create index if not exists regularisations_charges_org_idx on public.regularisations_charges (organization_id);
create index if not exists relances_org_idx on public.relances (organization_id);
create index if not exists reprises_portefeuille_org_idx on public.reprises_portefeuille (organization_id);
create index if not exists restitutions_org_idx on public.restitutions (organization_id);
create index if not exists retenues_org_idx on public.retenues (organization_id);
create index if not exists revisions_loyer_org_idx on public.revisions_loyer (organization_id);
