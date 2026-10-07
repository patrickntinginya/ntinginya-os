import { supabase } from '../lib/supabase'
import { db } from './db'
import { todayISO } from '../utils/date'

const ENDPOINT = '/.netlify/functions/ai-chat'

export class AiNotConfiguredError extends Error {}
export class AiUnavailableError extends Error {}

/** Asks the server whether an AI key is set. The key itself never reaches the browser. */
export async function getAiStatus() {
  try {
    const res = await fetch(`${ENDPOINT}?status=1`)
    if (!res.ok) return { reachable: false, configured: false }
    const body = await res.json()
    return { reachable: true, configured: Boolean(body.configured), provider: body.provider || null, status: body.status || null, model: body.model || null }
  } catch {
    return { reachable: false, configured: false }
  }
}

/** mode: chat | daily_review | weekly_review | idea_validation | finance_advice | goal_coach | learning_plan */
export async function sendToAssistant({ conversationId, message, mode = 'chat', entityId }) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversation_id: conversationId || null, message, mode, entity_id: entityId || null, today: todayISO() }),
    })
  } catch {
    throw new AiUnavailableError('Could not reach the AI service. Check your connection.')
  }

  if (res.status === 404) {
    throw new AiUnavailableError('The AI service is not available here. When running locally, start the app with "npx netlify dev" instead of "npm run dev".')
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error page */
  }
  if (res.status === 403 && body?.error === 'ai_disabled') throw new AiNotConfiguredError('AI is turned off in your settings.')
  if (res.status === 503 && body?.error === 'ai_not_configured') throw new AiNotConfiguredError('AI Assistant is not configured yet.')
  if (!res.ok) throw new Error(body?.message || 'Something went wrong. Please try again.')
  return body
}

export const listConversations = () => db.list('ai_conversations', { order: [{ column: 'updated_at', ascending: false }], limit: 100 })
export const listMessages = (conversationId) =>
  db.list('ai_messages', { filters: [{ op: 'eq', column: 'conversation_id', value: conversationId }], order: [{ column: 'created_at', ascending: true }], limit: 500 })
export const listActionRequests = (conversationId) =>
  db.list('ai_action_requests', { filters: [{ op: 'eq', column: 'conversation_id', value: conversationId }], order: [{ column: 'created_at', ascending: true }], limit: 200 })
export const renameConversation = (id, title) => db.update('ai_conversations', id, { title: title.trim().slice(0, 120) || 'New conversation' })
export const deleteConversation = (id) => db.remove('ai_conversations', id)
