-- Engine 4 (live match): the setup values beyond the original columns, so match-finish
-- replays with exactly what match-start issued. {"pace": 1..100, "role": "bitirici" | ...}
alter table public.matches add column setup_extra jsonb;
