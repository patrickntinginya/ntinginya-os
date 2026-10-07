import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../netlify/functions/ai-chat.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222'
const validBody = { message: 'Plan my day', today: '2026-10-07' }

async function withServices(options, run) {
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER', 'AI_MODEL', 'AI_DAILY_LIMIT', 'GOOGLE_GEMINI_BASE_URL']
  const originalEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  const originalFetch = globalThis.fetch
  const originalError = console.error
  for (const name of names) delete process.env[name]
  Object.assign(process.env, { VITE_SUPABASE_URL: 'https://supabase.example', VITE_SUPABASE_ANON_KEY: 'public-fixture', GEMINI_API_KEY: 'server-fixture', AI_PROVIDER: 'gemini' })
  if (options.noKey) delete process.env.GEMINI_API_KEY
  const calls = []
  console.error = () => {}
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const method = init.method || 'GET'
    const headers = new Headers(init.headers)
    calls.push({ url, method, headers, body: init.body && JSON.parse(init.body) })
    if (url.hostname === 'supabase.example') {
      assert.equal(headers.get('authorization'), 'Bearer caller-fixture')
      if (url.pathname === '/auth/v1/user') {
        if (options.authNetwork) throw new Error('private token details')
        return options.unauthorized ? Response.json({ message: 'Invalid JWT' }, { status: 401 }) : Response.json({ id: USER_ID })
      }
      if (url.pathname === '/rest/v1/profiles') {
        assert.equal(url.searchParams.get('user_id'), `eq.${USER_ID}`)
        return options.profileFailure ? Response.json({ message: 'private database details' }, { status: 500 }) : Response.json([{ ai_enabled: !options.disabled }])
      }
      if (url.pathname === '/rest/v1/ai_messages' && method === 'HEAD') {
        assert.equal(url.searchParams.get('user_id'), `eq.${USER_ID}`)
        return options.countFailure ? new Response(null, { status: 500 }) : new Response(null, { headers: { 'content-range': `*/${options.limited ? 100 : 0}` } })
      }
      if (url.pathname === '/rest/v1/ai_conversations') {
        if (method === 'POST') return Response.json({ id: CONVERSATION_ID }, { status: 201 })
        if (method === 'GET') {
          assert.equal(url.searchParams.get('user_id'), `eq.${USER_ID}`)
          return Response.json(options.otherUser ? [] : [{ id: CONVERSATION_ID }])
        }
        return new Response(null, { status: 204 })
      }
      if (url.pathname === '/rest/v1/ai_messages' && method === 'GET') {
        assert.equal(url.searchParams.get('user_id'), `eq.${USER_ID}`)
        return Response.json([{ role: 'assistant', content: 'Earlier reply' }, { role: 'user', content: 'Earlier question' }])
      }
      if (url.pathname === '/rest/v1/ai_action_requests' && method === 'POST') {
        return Response.json(JSON.parse(init.body).map((action) => ({ ...action, status: 'pending' })), { status: 201 })
      }
      if (method === 'POST' && !url.pathname.includes('/rpc/')) return new Response(null, { status: 201 })
      if (options.dataGaps && url.pathname === '/rest/v1/tasks') return Response.json({ message: 'not available' }, { status: 500 })
      return Response.json([])
    }
    assert.equal(url.hostname, 'generativelanguage.googleapis.com')
    if (options.providerStatus) return Response.json({ error: { message: 'private upstream details' } }, { status: options.providerStatus })
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'Not enough data yet. Would you like to add a task?' },
      ...(options.actions ? [
        { functionCall: { name: 'create_task', args: { title: 'Call John', due_date: '2026-10-08' } } },
        { functionCall: { name: 'delete_task', args: { id: 'forbidden' } } },
      ] : []),
    ] } }] })
  }
  try { return await run(calls) } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

const request = (body = validBody, authorization = 'Bearer caller-fixture') => new Request('https://site.example/.netlify/functions/ai-chat', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body),
})

test('status is public and secret-free; unsupported methods are rejected', async () => {
  await withServices({}, async (calls) => {
    const response = await handler(new Request('https://site.example/.netlify/functions/ai-chat?status=1'))
    assert.deepEqual(await response.json(), { provider: 'gemini', status: 'ready', configured: true, model: 'gemini-3.5-flash' })
    assert.equal((await handler(new Request('https://site.example/.netlify/functions/ai-chat', { method: 'PUT' }))).status, 405)
    assert.equal(calls.length, 0)
  })
})

test('missing or malformed bearer credentials never reach Supabase or Gemini', async () => {
  await withServices({}, async (calls) => {
    for (const authorization of ['', 'caller-fixture', 'Basic caller-fixture', 'Bearer']) assert.equal((await handler(request(validBody, authorization))).status, 401)
    assert.equal(calls.length, 0)
  })
})

for (const [options, status] of [[{ unauthorized: true }, 401], [{ authNetwork: true }, 401], [{ noKey: true }, 503], [{ disabled: true }, 403], [{ profileFailure: true }, 500], [{ limited: true }, 429], [{ countFailure: true }, 500], [{ otherUser: true }, 404]]) {
  test(`protected AI request fails safely: ${JSON.stringify(options)}`, async () => {
    await withServices(options, async (calls) => {
      const response = await handler(request({ ...validBody, ...(options.otherUser ? { conversation_id: CONVERSATION_ID } : {}) }))
      assert.equal(response.status, status)
      assert.ok(!JSON.stringify(await response.json()).includes('private'))
      assert.ok(!calls.some((call) => call.url.hostname === 'generativelanguage.googleapis.com'))
    })
  })
}

for (const body of [null, [], {}, { ...validBody, message: '' }, { ...validBody, message: 'a'.repeat(4001) }, { ...validBody, today: '2026-02-30' }, { ...validBody, mode: 'invalid' }, { ...validBody, conversation_id: 'invalid' }, { ...validBody, entity_id: [] }]) {
  test(`malformed request is rejected: ${JSON.stringify(body).slice(0, 100)}`, async () => {
    await withServices({}, async (calls) => {
      assert.equal((await handler(request(body))).status, 400)
      assert.ok(!calls.some((call) => call.url.hostname === 'generativelanguage.googleapis.com'))
    })
  })
}

test('invalid JSON and oversized request bodies are rejected', async () => {
  await withServices({}, async () => {
    for (const [body, status] of [['{bad', 400], ['x'.repeat(20001), 413]]) {
      const response = await handler(new Request('https://site.example/.netlify/functions/ai-chat', { method: 'POST', headers: { authorization: 'Bearer caller-fixture' }, body }))
      assert.equal(response.status, status)
    }
  })
})

test('authenticated Gemini flow preserves history, marks data gaps, and only stores pending safe proposals', async () => {
  await withServices({ actions: true, dataGaps: true }, async (calls) => {
    const response = await handler(request({ ...validBody, conversation_id: CONVERSATION_ID, user_id: 'attacker-supplied' }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const body = await response.json()
    assert.equal(body.conversation_id, CONVERSATION_ID)
    assert.equal(body.actions.length, 1)
    assert.equal(body.actions[0].action_type, 'create_task')
    assert.equal(body.actions[0].status, 'pending')
    const model = calls.find((call) => call.url.hostname === 'generativelanguage.googleapis.com')
    assert.deepEqual(model.body.contents.map((message) => message.role), ['user', 'model', 'user'])
    assert.match(model.body.contents[2].parts[0].text, /<data_gaps>tasks<\/data_gaps>/)
    assert.match(model.body.systemInstruction.parts[0].text, /Never invent/)
    const writes = calls.filter((call) => ['POST', 'PATCH', 'DELETE'].includes(call.method) && call.url.hostname === 'supabase.example' && !call.url.pathname.includes('/rpc/'))
    assert.ok(writes.length >= 2)
    assert.ok(writes.every((call) => ['/rest/v1/ai_messages', '/rest/v1/ai_action_requests', '/rest/v1/ai_conversations'].includes(call.url.pathname)))
    assert.ok(writes.every((call) => call.method !== 'DELETE'))
  })
})

test('a new conversation receives a Gemini reply and persists the two turns', async () => {
  await withServices({}, async (calls) => {
    const response = await handler(request())
    assert.equal(response.status, 200)
    assert.equal((await response.json()).reply, 'Not enough data yet. Would you like to add a task?')
    const turns = calls.find((call) => call.url.pathname === '/rest/v1/ai_messages' && call.method === 'POST').body
    assert.deepEqual(turns.map((turn) => turn.role), ['user', 'assistant'])
  })
})

for (const [providerStatus, status] of [[400, 503], [401, 503], [429, 429], [500, 502]]) {
  test(`the function sanitizes Gemini HTTP ${providerStatus}`, async () => {
    await withServices({ providerStatus }, async (calls) => {
      const response = await handler(request())
      assert.equal(response.status, status)
      assert.ok(!JSON.stringify(await response.json()).includes('private'))
      assert.ok(!calls.some((call) => call.url.pathname === '/rest/v1/ai_action_requests'))
    })
  })
}
