export class ProviderError extends Error {}

export function publicProviderError(error) {
  if (error.message === 'provider_status_429') return { status: 429, error: 'provider_rate_limited', message: 'The AI service is busy or has reached its usage limit. Please try again later.' }
  if (['provider_status_400', 'provider_status_401', 'provider_status_403', 'provider_status_404'].includes(error.message)) return { status: 503, error: 'provider_configuration', message: 'The AI provider configuration needs attention. Please contact the site owner.' }
  if (error.message === 'timeout') return { status: 504, error: 'provider_timeout', message: 'The AI took too long to respond. Please try again with a shorter question.' }
  if (error.message === 'blocked_response') return { status: 422, error: 'provider_blocked', message: 'The AI could not answer that request. Please try rephrasing it.' }
  return { status: 502, error: 'provider_unavailable', message: 'The AI service is temporarily unavailable. Please try again shortly.' }
}
