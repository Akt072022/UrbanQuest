-- UrbanQuest schema — run this once in the Supabase SQL editor
-- (https://app.supabase.com/project/_/sql) right after the project is
-- created. Re-runnable: every block is idempotent.
--
-- The model is intentionally minimal:
--   • evaluations  — every tool the user has self-rated (regular /
--                    occasional / theory). Optional team_id tags the
--                    rating for an asynchronous workshop.
--   • skipped_tools — the user pressed "skip" on these tools so the
--                    deck doesn't surface them again on resume.
--   • teams        — workshop sessions (a city, a project) created by
--                    a facilitator and joined by participants.
--   • team_members — link table user ↔ team with a role.
--
-- Auth is delegated entirely to auth.users (supabase.auth.signInWithOtp).
-- All tables enforce row-level security so the anon key is safe to ship
-- to the client.

-- ── Tables ──────────────────────────────────────────────────────

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  proj        text,
  invite_code text unique,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.team_members (
  team_id   uuid references public.teams(id) on delete cascade,
  user_id   uuid references auth.users(id)  on delete cascade,
  role      text not null default 'participant'
              check (role in ('participant','facilitator')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.evaluations (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tool_name  text not null,
  level      text not null
               check (level in ('regular','occasional','theory')),
  team_id    uuid references public.teams(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, tool_name)
);

create table if not exists public.skipped_tools (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tool_name  text not null,
  team_id    uuid references public.teams(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, tool_name)
);

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  city       text,
  proj       text,
  updated_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────
create index if not exists evaluations_team_idx
  on public.evaluations (team_id) where team_id is not null;
create index if not exists skipped_team_idx
  on public.skipped_tools (team_id) where team_id is not null;

-- ── Row-Level Security ─────────────────────────────────────────
alter table public.teams         enable row level security;
alter table public.team_members  enable row level security;
alter table public.evaluations   enable row level security;
alter table public.skipped_tools enable row level security;
alter table public.profiles      enable row level security;

-- evaluations: each user manages their own row; teammates can read
-- evaluations tagged with a shared team_id (workshop view).
drop policy if exists evaluations_self_rw on public.evaluations;
create policy evaluations_self_rw on public.evaluations
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists evaluations_team_read on public.evaluations;
create policy evaluations_team_read on public.evaluations
  for select using (
    team_id is not null and exists (
      select 1 from public.team_members tm
       where tm.team_id = evaluations.team_id and tm.user_id = auth.uid()
    )
  );

-- skipped_tools: same rules.
drop policy if exists skipped_self_rw on public.skipped_tools;
create policy skipped_self_rw on public.skipped_tools
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists skipped_team_read on public.skipped_tools;
create policy skipped_team_read on public.skipped_tools
  for select using (
    team_id is not null and exists (
      select 1 from public.team_members tm
       where tm.team_id = skipped_tools.team_id and tm.user_id = auth.uid()
    )
  );

-- teams: members can read; any authenticated user can create.
drop policy if exists teams_member_read on public.teams;
create policy teams_member_read on public.teams
  for select using (
    exists (
      select 1 from public.team_members tm
       where tm.team_id = teams.id and tm.user_id = auth.uid()
    )
  );

drop policy if exists teams_create on public.teams;
create policy teams_create on public.teams
  for insert with check (auth.uid() is not null);

drop policy if exists teams_facilitator_update on public.teams;
create policy teams_facilitator_update on public.teams
  for update using (
    exists (
      select 1 from public.team_members tm
       where tm.team_id = teams.id and tm.user_id = auth.uid()
         and tm.role = 'facilitator'
    )
  );

-- team_members: a user reads their own memberships; can add themselves
-- (= join), facilitators can manage their team's roster.
drop policy if exists team_members_self_read on public.team_members;
create policy team_members_self_read on public.team_members
  for select using (auth.uid() = user_id);

drop policy if exists team_members_self_join on public.team_members;
create policy team_members_self_join on public.team_members
  for insert with check (auth.uid() = user_id);

drop policy if exists team_members_facilitator_manage on public.team_members;
create policy team_members_facilitator_manage on public.team_members
  for all using (
    exists (
      select 1 from public.team_members tm
       where tm.team_id = team_members.team_id and tm.user_id = auth.uid()
         and tm.role = 'facilitator'
    )
  );

-- profiles: each user owns their profile.
drop policy if exists profiles_self_rw on public.profiles;
create policy profiles_self_rw on public.profiles
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Team membership UI policies ────────────────────────────────
-- A teammate must be able to see the *other* members of a team they
-- belong to (roster display). The default `team_members_self_read`
-- only exposes the user's own row.
drop policy if exists team_members_team_read on public.team_members;
create policy team_members_team_read on public.team_members
  for select using (
    exists (
      select 1 from public.team_members me
       where me.team_id = team_members.team_id and me.user_id = auth.uid()
    )
  );

-- Looking up a team by invite code before joining is tricky: the
-- caller is not yet a member, so `teams_member_read` denies them. We
-- can't broaden that policy without leaking the full directory of
-- teams. A SECURITY DEFINER RPC is the safe middle ground — it only
-- returns the row that matches the exact invite_code provided, and
-- the function bypasses RLS only inside its own body.
create or replace function public.lookup_team_by_invite(p_code text)
returns table (id uuid, name text, city text, proj text)
language sql
security definer
set search_path = public
as $$
  select t.id, t.name, t.city, t.proj
    from public.teams t
   where t.invite_code = p_code
   limit 1;
$$;

revoke all on function public.lookup_team_by_invite(text) from public;
grant execute on function public.lookup_team_by_invite(text) to authenticated;

-- ── Workshop sessions (Phase 2) ────────────────────────────────
-- Persists the live triage / live-Q / project-method-fit results
-- so the team dashboard can show history + evolution over time.
-- Each launched workshop is a `workshop_sessions` row; every card
-- the participants rate becomes a `session_responses` row.

create table if not exists public.workshop_sessions (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid references public.teams(id) on delete cascade,
  facilitator_id  uuid references auth.users(id)  on delete set null,
  room_id         text not null,
  mode            text not null
                    check (mode in ('triage','methodfit','question')),
  gate            int,
  dim             text,
  project_name    text,
  project_desc    text,
  method_names    text[],
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create table if not exists public.session_responses (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null
                          references public.workshop_sessions(id) on delete cascade,
  participant_anon_id   text not null,
  participant_user_id   uuid references auth.users(id) on delete set null,
  kind                  text not null
                          check (kind in ('triage','methodfit','question')),
  tool_name             text,
  payload               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists session_responses_session_idx
  on public.session_responses (session_id);
create index if not exists workshop_sessions_team_idx
  on public.workshop_sessions (team_id, started_at desc);

alter table public.workshop_sessions enable row level security;
alter table public.session_responses enable row level security;

-- workshop_sessions: facilitator and team members can read; only
-- the facilitator can create/update their own sessions.
drop policy if exists workshop_sessions_read on public.workshop_sessions;
create policy workshop_sessions_read on public.workshop_sessions
  for select using (
    (team_id is null and facilitator_id = auth.uid())
    or exists (
      select 1 from public.team_members tm
       where tm.team_id = workshop_sessions.team_id
         and tm.user_id = auth.uid()
    )
  );

drop policy if exists workshop_sessions_facilitator_insert on public.workshop_sessions;
create policy workshop_sessions_facilitator_insert on public.workshop_sessions
  for insert with check (auth.uid() = facilitator_id);

drop policy if exists workshop_sessions_facilitator_update on public.workshop_sessions;
create policy workshop_sessions_facilitator_update on public.workshop_sessions
  for update using (auth.uid() = facilitator_id);

-- session_responses: anyone can insert (workshop participants are
-- typically anonymous via the room link). Reads are gated to the
-- session's facilitator + team members.
drop policy if exists session_responses_anyone_insert on public.session_responses;
create policy session_responses_anyone_insert on public.session_responses
  for insert with check (true);

drop policy if exists session_responses_team_read on public.session_responses;
create policy session_responses_team_read on public.session_responses
  for select using (
    exists (
      select 1 from public.workshop_sessions s
       where s.id = session_responses.session_id
         and (
           (s.team_id is null and s.facilitator_id = auth.uid())
           or exists (
             select 1 from public.team_members tm
              where tm.team_id = s.team_id
                and tm.user_id = auth.uid()
           )
         )
    )
  );
