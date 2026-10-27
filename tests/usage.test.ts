import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const DIVIDER = '─'.repeat(30)

test('the rate limits and the cost share one line between context and model, on every surface', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 136000, window: 200000, percent: 68 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-27T14:30:00Z' },
        { kind: 'seven_day', percentUsed: 7 },
      ],
      cost: { usd: 1.236 },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.slice(2)).toEqual([
      DIVIDER,
      'Context', '███████░░░', '68% (136k / 200k)',
      'Usage  ', '5h 23.5%', '│', '7d 7%', '│', '$1.24',
      'Model  ', 'claude-opus-5-5',
    ])
    await ui.unmount()
  }
})

test('a window the mod does not know keeps its own name', async ($, on) => {
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'monthly', percentUsed: 40 }] },
  }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /monthly/ }))?.text).toBe('monthly 40%')
  expect((await ui.find({ type: 'Text', text: '│' }))).toBeUndefined()
  await ui.unmount()
})

test('the separators between usage items are dim', async ($, on) => {
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23 }], cost: { usd: 1 } },
  }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: '│' }))?.props).toMatchObject({ color: 'subtle' })
  await ui.unmount()
})

test('with no rate limits the usage line shows the cost alone', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0.5 } } }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.slice(texts.indexOf('Usage  '))).toEqual(['Usage  ', '$0.50'])
  await ui.unmount()
})

test('with neither rate limits nor a cost the usage line is left out', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).not.toContain('Usage  ')
  await ui.unmount()
})
