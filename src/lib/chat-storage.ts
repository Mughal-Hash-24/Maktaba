// src/lib/chat-storage.ts
import { SupabaseClient, User } from '@supabase/supabase-js';
import { Part } from '@google/generative-ai';
import { ThoughtStep } from './agent-harness';

export interface ChatSession {
  id: string;
  title: string;
  model_name: string;
  created_at: string;
  updated_at: string;
}

export interface DbChatMessage {
  id?: string;
  role: 'user' | 'model' | 'system';
  parts: Part[]; // Content.parts array
  metadata?: {
    thought_steps?: ThoughtStep[];
    [key: string]: unknown;
  } | null;
  created_at?: string;
}

// Guest local storage helpers
const GUEST_SESSIONS_KEY = 'maktaba_guest_sessions';
const GUEST_MESSAGES_PREFIX = 'maktaba_guest_messages_';

function getLocalSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(GUEST_SESSIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveLocalSessions(sessions: ChatSession[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(sessions));
}

export async function pruneOldSessions(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: sessions, error: fetchErr } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (fetchErr) {
    console.error('[chat-storage] Error fetching sessions for pruning:', fetchErr);
    return;
  }

  if (sessions && sessions.length > 10) {
    const toDelete = sessions.slice(10).map((s) => s.id);
    const { error: deleteErr } = await supabase
      .from('chat_sessions')
      .delete()
      .in('id', toDelete);

    if (deleteErr) {
      console.error('[chat-storage] Error pruning old sessions:', deleteErr);
    }
  }
}

export async function createSession(
  supabase: SupabaseClient | null,
  user: User | null,
  title: string,
  modelName: string
): Promise<ChatSession> {
  const newSession: ChatSession = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    title,
    model_name: modelName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase && user) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        title,
        model_name: modelName,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[chat-storage] Error creating Supabase session:', error);
      throw error;
    }

    // Keep only the last 10 chats in Supabase
    await pruneOldSessions(supabase, user.id);

    return data as ChatSession;
  } else {
    const sessions = getLocalSessions();
    sessions.unshift(newSession);
    
    // Prune guest sessions to only keep the last 10
    while (sessions.length > 10) {
      const removed = sessions.pop();
      if (removed && typeof window !== 'undefined') {
        localStorage.removeItem(`${GUEST_MESSAGES_PREFIX}${removed.id}`);
      }
    }
    
    saveLocalSessions(sessions);
    return newSession;
  }
}

export async function loadSessions(
  supabase: SupabaseClient | null,
  user: User | null
): Promise<ChatSession[]> {
  if (supabase && user) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[chat-storage] Error fetching sessions from Supabase:', error);
      // Fallback to local sessions
      return getLocalSessions();
    }
    return data as ChatSession[];
  } else {
    return getLocalSessions();
  }
}

export async function loadMessages(
  supabase: SupabaseClient | null,
  user: User | null,
  sessionId: string
): Promise<DbChatMessage[]> {
  if (supabase && user) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[chat-storage] Error loading messages from Supabase:', error);
      return [];
    }
    return data as DbChatMessage[];
  } else {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(`${GUEST_MESSAGES_PREFIX}${sessionId}`);
    return raw ? JSON.parse(raw) : [];
  }
}

export async function saveMessage(
  supabase: SupabaseClient | null,
  user: User | null,
  sessionId: string,
  role: 'user' | 'model' | 'system',
  parts: Part[],
  thoughtSteps?: ThoughtStep[]
): Promise<DbChatMessage> {
  const dbMsg: DbChatMessage = {
    role,
    parts,
    metadata: thoughtSteps ? { thought_steps: thoughtSteps } : null,
    created_at: new Date().toISOString(),
  };

  if (supabase && user) {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role,
        parts,
        metadata: dbMsg.metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('[chat-storage] Error saving message to Supabase:', error);
      throw error;
    }

    // Touch the session's updated_at timestamp
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return data as DbChatMessage;
  } else {
    if (typeof window !== 'undefined') {
      const key = `${GUEST_MESSAGES_PREFIX}${sessionId}`;
      const existing = localStorage.getItem(key);
      const messages: DbChatMessage[] = existing ? JSON.parse(existing) : [];
      messages.push(dbMsg);
      localStorage.setItem(key, JSON.stringify(messages));

      // Touch the updated_at timestamp in local sessions list
      const sessions = getLocalSessions();
      const sIdx = sessions.findIndex((s) => s.id === sessionId);
      if (sIdx !== -1) {
        sessions[sIdx].updated_at = new Date().toISOString();
        saveLocalSessions(sessions);
      }
    }
    return dbMsg;
  }
}

export async function deleteSession(
  supabase: SupabaseClient | null,
  user: User | null,
  sessionId: string
): Promise<void> {
  if (supabase && user) {
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('[chat-storage] Error deleting Supabase session:', error);
      throw error;
    }
  } else {
    const sessions = getLocalSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    saveLocalSessions(filtered);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${GUEST_MESSAGES_PREFIX}${sessionId}`);
    }
  }
}

export async function clearAllLocalGuestData() {
  if (typeof window === 'undefined') return;
  const sessions = getLocalSessions();
  sessions.forEach((s) => {
    localStorage.removeItem(`${GUEST_MESSAGES_PREFIX}${s.id}`);
  });
  localStorage.removeItem(GUEST_SESSIONS_KEY);
}

export async function migrateGuestData(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  // 1. Sync settings first
  const customName = localStorage.getItem('hikma_custom_name') || 'Hikma';
  const preset = localStorage.getItem('hikma_preset') || 'scholar';
  const userInstructions = localStorage.getItem('hikma_user_instructions') || '';
  const selectedModel = localStorage.getItem('hikma_selected_model') || 'gemma-4-31b-it';

  await supabase
    .from('profiles')
    .update({
      hikma_name: customName,
      personality_preset: preset,
      user_instructions: userInstructions,
      selected_model: selectedModel,
    })
    .eq('id', userId);

  // 2. Sync sessions and messages
  const guestSessions = getLocalSessions();
  for (const session of guestSessions) {
    const { data: dbSession, error: sessionErr } = await supabase
      .from('chat_sessions')
      .insert({
        title: session.title,
        model_name: session.model_name,
        user_id: userId,
        created_at: session.created_at,
        updated_at: session.updated_at
      })
      .select()
      .single();

    if (sessionErr || !dbSession) {
      console.error('[chat-storage] Failed to migrate session:', session.title, sessionErr);
      continue;
    }

    const guestMsgs = await loadMessages(null, null, session.id);
    if (guestMsgs.length > 0) {
      const msgsToInsert = guestMsgs.map((m) => ({
        session_id: dbSession.id,
        role: m.role,
        parts: m.parts,
        metadata: m.metadata,
        created_at: m.created_at
      }));

      const { error: msgErr } = await supabase
        .from('chat_messages')
        .insert(msgsToInsert);

      if (msgErr) {
        console.error('[chat-storage] Failed to migrate messages for session:', session.title, msgErr);
      }
    }
  }

  // 3. Keep only the last 10 chats in Supabase
  await pruneOldSessions(supabase, userId);

  // 4. Clear local storage guest data
  clearAllLocalGuestData();
}

