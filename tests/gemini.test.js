import assert from 'node:assert/strict'
import test from 'node:test'
import { callModel, publicStatus, resolveProvider, ProviderError } from '../netlify/lib/ai/provider.js'
import { publicProviderError } from '../netlify/lib/ai/errors.js'
import { toGeminiTools } from '../netlify/lib/ai/providers/gemini.js'
import { toolDefinitions, validateAction } from '../src/lib/ai/actions.js'

const config = () => resolveProvider({ GEMINI_API_KEY: 'fixture-only' })

async function withFetch(mock, run) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try { return await run() } finally { globalThis.fetch = original }
}

test('Gemini is selected automatically and explicit provider selections are respected', () => {
  assert.equal(config().name, 'gemini')
  assert.equal(config().model, 'gemini-3.5-flash')
  assert.equal(config().configured, true)
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'fixture-only', AI_API_KEY: 'other-fixture' }).name, 'gemini')
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'fixture-only', AI_PROVIDER: 'none' }).status, 'disabled')
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'fixture-only', AI_PROVIDER: 'openai' }).missing, 'AI_API_KEY')
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'fixture-only', AI_MODEL: 'custom-model' }).model, 'custom-model')
})

test('Gemini public status excludes secrets and private endpoint configuration', () => {
  const status = publicStatus(resolveProvider({ GEMINI_API_KEY: 'fixture-only', GOOGLE_GEMINI_BASE_URL: 'https://private.example' }))
  assert.deepEqual(status, { provider: 'gemini', status: 'ready', configured: true, model: 'gemini-3.5-flash' })
})

test('Gemini tool declarations preserve the existing action allowlist and schemas', () => {
  const tools = toolDefinitions()
  const declarations = toGeminiTools(tools)
  assert.equal(declarations.length, tools.length)
  for (const [index, declaration] of declarations.entries()) {
    assert.equal(declaration.name, tools[index].name)
    assert.deepEqual(declaration.parameters, tools[index].input_schema)
    assert.ok(!/delete|remove/.test(declaration.name))
  }
})

test('Gemini REST request includes context, history, tools and a header-only key', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent')
    assert.ok(!url.includes('fixture-only'))
    assert.equal(options.headers['x-goog-api-key'], 'fixture-only')
    const body = JSON.parse(options.body)
    assert.deepEqual(body.systemInstruction.parts, [{ text: 'Use real data only.' }])
    assert.deepEqual(body.contents.map((message) => message.role), ['user', 'model', 'user'])
    assert.equal(body.contents[2].parts[0].text, '<user_data>context</user_data>')
    assert.equal(body.toolConfig.functionCallingConfig.mode, 'AUTO')
    assert.equal(body.generationConfig.maxOutputTokens, 1400)
    assert.equal(body.generationConfig.thinkingConfig, undefined)
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'private reasoning', thought: true }, { text: 'Please confirm this task.' },
      { functionCall: { name: 'create_task', args: { title: 'Call John', due_date: '2026-10-08' } } },
      { functionCall: { name: 'create_task', args: 'invalid' } },
    ] } }] })
  }, async () => {
    const result = await callModel(config(), {
      system: 'Use real data only.',
      messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }, { role: 'user', content: '<user_data>context</user_data>' }],
      tools: toolDefinitions(),
    })
    assert.equal(result.text, 'Please confirm this task.')
    assert.equal(result.toolCalls.length, 1)
    assert.equal(validateAction(result.toolCalls[0].name, result.toolCalls[0].input).ok, true)
  })
})

test('Gemini supports tool-only replies and ignores destructive proposals during validation', async () => {
  await withFetch(async () => Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: 'delete_task', args: { id: 'not-allowed' } } }] } }] }), async () => {
    const result = await callModel(config(), { system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [] })
    assert.equal(result.text, '')
    assert.equal(validateAction(result.toolCalls[0].name, result.toolCalls[0].input).ok, false)
  })
})

test('Gemini respects a server-side gateway endpoint', async () => {
  await withFetch(async (url) => {
    assert.equal(url, 'https://gateway.example/google/v1beta/models/gemini-3.5-flash:generateContent')
    return Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
  }, () => callModel(resolveProvider({ GEMINI_API_KEY: 'fixture-only', GOOGLE_GEMINI_BASE_URL: 'https://gateway.example/google/' }), { system: 's', messages: [], tools: [] }))
})

for (const [status, expected] of [[400, 503], [401, 503], [403, 503], [404, 503], [429, 429], [500, 502], [503, 502]]) {
  test(`Gemini HTTP ${status} produces a sanitized, human-readable error`, async () => {
    await withFetch(async () => new Response('sensitive upstream detail', { status }), async () => {
      await assert.rejects(() => callModel(config(), { system: 's', messages: [], tools: [] }), (error) => {
        assert.ok(error instanceof ProviderError)
        assert.equal(publicProviderError(error).status, expected)
        assert.ok(!JSON.stringify(publicProviderError(error)).includes('sensitive'))
        return true
      })
    })
  })
}

test('Gemini network errors never expose upstream details', async () => {
  await withFetch(async () => { throw new Error('private network details') }, async () => {
    await assert.rejects(() => callModel(config(), { system: 's', messages: [] }), /network/)
  })
})

test('Gemini timeout aborts the provider request', async () => {
  await withFetch((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }), async () => {
    await assert.rejects(() => callModel(config(), { system: 's', messages: [], timeoutMs: 5 }), (error) => {
      assert.equal(error.message, 'timeout')
      assert.equal(publicProviderError(error).status, 504)
      return true
    })
  })
})

for (const body of [null, {}, { candidates: [] }, { candidates: [{ content: { parts: [] } }] }, { candidates: [{ content: { parts: [null] } }] }]) {
  test(`Gemini rejects empty or malformed responses: ${JSON.stringify(body)}`, async () => {
    await withFetch(async () => Response.json(body), async () => {
      await assert.rejects(() => callModel(config(), { system: 's', messages: [] }), /invalid_response/)
    })
  })
}

test('Gemini rejects malformed JSON and safety-blocked responses', async () => {
  await withFetch(async () => new Response('{invalid'), async () => {
    await assert.rejects(() => callModel(config(), { system: 's', messages: [] }), /invalid_response/)
  })
  await withFetch(async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }), async () => {
    await assert.rejects(() => callModel(config(), { system: 's', messages: [] }), /blocked_response/)
  })
})

test('Gemini 2.5 overrides retain their model-specific thinking budget', async () => {
  await withFetch(async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).generationConfig.thinkingConfig, { thinkingBudget: 0 })
    return Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
  }, () => callModel(resolveProvider({ GEMINI_API_KEY: 'fixture-only', AI_MODEL: 'gemini-2.5-flash' }), { system: 's', messages: [], tools: [] }))
})
