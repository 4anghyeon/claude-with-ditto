import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const DIVIDER = '─'.repeat(30)

test('the model line sits under the context line with its label lined up, on every surface', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 136000, window: 200000, percent: 68 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts.slice(2)).toEqual([DIVIDER, 'Context', '███████░░░', '68% (136k / 200k)', 'Model  ', 'claude-opus-5-5'])
    await ui.unmount()
  }
})

test('a model alone still gets the divider', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.slice(2)).toEqual([DIVIDER, 'Model  ', 'claude-opus-5-5'])
  await ui.unmount()
})
