// Provider abstraction. The rest of the app only calls resolveProvider() and callModel(); it never knows which
// vendor answers. The key is read here from the server environment and never sent to the browser.
//
// AI_PROVIDER = anthropic | openai | gemini | ollama | none
// If AI_PROVIDER is empty and AI_API_KEY is set, anthropic is used (backwards compatible with V2).
import { anthropic } from './providers/anthropic.js'
import { openai } from './providers/openai.js'
import { ollama } from './providers/ollama.js'
import { gemini } from './providers/gemini.js'
import { ProviderError } from './errors.js'

export { ProviderError }
export const PROVIDERS = { anthropic, openai, gemini, ollama }
export const KNOWN_NAMES = ['anthropic', 'openai', 'gemini', 'ollama', 'none']

/**
 * Describes the AI setup WITHOUT exposing secrets.
 * status: ready | disabled | not_configured | unsupported
 */
export function resolveProvider(env = process.env) {
  const requested = String(env.AI_PROVIDER || '').trim().toLowerCase()
  const name = requested || (env.GEMINI_API_KEY ? 'gemini' : env.AI_API_KEY ? 'anthropic' : 'none')
  const maxTokens = Math.min(Number(env.AI_MAX_TOKENS) || 1400, 4000)

  if (name === 'none') return { name, status: 'disabled', configured: false, maxTokens }
  if (!KNOWN_NAMES.includes(name)) return { name, status: 'unsupported', configured: false, maxTokens }

  const impl = PROVIDERS[name]
  const apiKey = (name === 'gemini' ? env.GEMINI_API_KEY : env.AI_API_KEY) || ''
  const baseUrl = (name === 'gemini' ? env.GOOGLE_GEMINI_BASE_URL : env.AI_BASE_URL) || ''
  const missingKey = impl.needsKey && !apiKey
  const missingUrl = impl.needsBaseUrl && !baseUrl
  if (missingKey || missingUrl) return { name, status: 'not_configured', configured: false, maxTokens, missing: missingKey ? (name === 'gemini' ? 'GEMINI_API_KEY' : 'AI_API_KEY') : 'AI_BASE_URL' }
  return { name, status: 'ready', configured: true, model: env.AI_MODEL || impl.defaultModel, apiKey, baseUrl, maxTokens }
}

/** Only these fields are safe to send to the browser. */
export const publicStatus = (cfg) => ({ provider: cfg.name, status: cfg.status, configured: cfg.configured, model: cfg.model || null })

/** Calls the selected provider. Returns { text, toolCalls: [{name, input}], stopReason }. */
export async function callModel(cfg, { system, messages, tools, timeoutMs = 24000 }) {
  if (cfg.status !== 'ready') throw new ProviderError('not_ready')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await PROVIDERS[cfg.name].call({
      apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model, maxTokens: cfg.maxTokens, system, messages, tools, signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

// Kept for older imports.
export const isConfigured = (env = process.env) => resolveProvider(env).configured
