-- Stage 5 Database Schema Setup for Supabase SQL Editor

-- 1. Create profiles table (references auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  hikma_name text default 'Hikma' not null,
  personality_preset text default 'scholar' not null check (personality_preset in ('scholar', 'tutor', 'debate', 'concise')),
  user_instructions text,
  selected_model text default 'gemma-4-31b-it' not null,
  created_at timestamptz default now() not null
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

-- Create policies for profiles
create policy "Users can view and update their own profile" on public.profiles
  for all using (auth.uid() = id);

-- 2. Create chat_sessions table
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  model_name text not null default 'gemma-4-31b-it',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS for chat_sessions
alter table public.chat_sessions enable row level security;

-- Create policies for chat_sessions
create policy "Users can manage their own chat sessions" on public.chat_sessions
  for all using (auth.uid() = user_id);

-- 3. Create chat_messages table (supports multi-part Gemini messages and metadata thoughts)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'model', 'system')),
  parts jsonb not null, -- Stores the Content.parts array (with text, functionCall, or functionResponse parts)
  metadata jsonb, -- Stores ThoughtStep[] steps or search plans
  created_at timestamptz default now() not null
);

-- Enable RLS for chat_messages
alter table public.chat_messages enable row level security;

-- Create policies for chat_messages
create policy "Users can manage their own chat messages" on public.chat_messages
  for all using (
    session_id in (
      select id from public.chat_sessions where user_id = auth.uid()
    )
  );

-- 4. Create note_requests table
create table if not exists public.note_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  topic text not null,
  context text,
  created_at timestamptz default now() not null
);

-- Enable RLS for note_requests
alter table public.note_requests enable row level security;

-- Create policies for note_requests
create policy "Users can manage their own note requests" on public.note_requests
  for all using (auth.uid() = user_id);

-- 5. Automate profile creation when a user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, hikma_name, personality_preset, selected_model)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Scholar'),
    'Hikma',
    'scholar',
    'gemma-4-31b-it'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call public.handle_new_user on user creation
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
