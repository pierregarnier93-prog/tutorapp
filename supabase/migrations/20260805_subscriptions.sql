-- Teacher subscriptions + referral system

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'trialing',
  plan text not null default 'monthly',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists subscriptions_teacher_id_idx on subscriptions(teacher_id);
create index if not exists subscriptions_status_idx on subscriptions(status);

alter table profiles add column if not exists referral_code text unique;
alter table profiles add column if not exists referred_by text;
alter table profiles add column if not exists referral_count integer default 0;
alter table profiles add column if not exists referral_credits integer default 0;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referee_id uuid not null references profiles(id) on delete cascade,
  code_used text not null,
  rewarded boolean default false,
  created_at timestamptz default now(),
  unique(referee_id)
);

create index if not exists referrals_referrer_idx on referrals(referrer_id);

alter table subscriptions enable row level security;
alter table referrals enable row level security;

drop policy if exists "teachers read own subscription" on subscriptions;
create policy "teachers read own subscription" on subscriptions
  for select using (auth.uid() = teacher_id);

drop policy if exists "teachers read own referrals" on referrals;
create policy "teachers read own referrals" on referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referee_id);

-- Generate a short unique referral code for every existing teacher
update profiles
set referral_code = upper(substr(md5(id::text || 'tutorapp'), 1, 8))
where referral_code is null and role = 'teacher';
