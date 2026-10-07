import { ProviderError } from '../errors.js'

export const toGeminiTools = (tools = []) => tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema,
}))

export const gemini = {
  name: 'gemini',
  needsKey: true,
  defaultModel: 'gemini-3.5-flash',
  async call({ apiKey, baseUrl, model, maxTokens, system, messages, tools, signal }) {
    const endpoint = baseUrl || 'https://generativelanguage.googleapis.com'
    let response
    try {
      response = await fetch(`${endpoint.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: maxTokens, ...(/^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
          ...(tools?.length ? { tools: [{ functionDeclarations: toGeminiTools(tools) }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
        }),
      })
    } catch (error) {
      throw new ProviderError(signal?.aborted || error.name === 'AbortError' ? 'timeout' : 'network')
    }
    if (!response.ok) throw new ProviderError(`provider_status_${response.status}`)

    let body
    try {
      body = await response.json()
    } catch {
      throw new ProviderError(signal?.aborted ? 'timeout' : 'invalid_response')
    }
    const candidate = body?.candidates?.[0]
    if (body?.promptFeedback?.blockReason || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(candidate?.finishReason)) {
      throw new ProviderError('blocked_response')
    }
    const parts = candidate?.content?.parts
    if (!Array.isArray(parts)) throw new ProviderError('invalid_response')
    const text = parts.filter((part) => part && typeof part.text === 'string' && !part.thought).map((part) => part.text).join('\n').trim()
    const toolCalls = parts.filter((part) => part && typeof part.functionCall?.name === 'string'
      && part.functionCall.args && typeof part.functionCall.args === 'object' && !Array.isArray(part.functionCall.args))
      .map((part) => ({ name: part.functionCall.name, input: part.functionCall.args }))
    if (!text && !toolCalls.length) throw new ProviderError('invalid_response')
    return { text, toolCalls, stopReason: candidate.finishReason }
  },
}
