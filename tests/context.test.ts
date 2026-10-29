import { expect, test } from 'claude-code/testing'

// The band's text is checked in Korean; English has a test of its own.
const KOREAN = { options: { language: 'ko' } } as const

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const DIVIDER = '─'.repeat(30)

const usage = (context: { tokens?: number; window: number; percent?: number }) => ({
  value: { startedAt: 0, context, rateLimits: [] },
})

test('the context line sits under a divider below the message, on every surface', KOREAN, async ($, on) => {
  on('session.usage', () => usage({ tokens: 136000, window: 200000, percent: 68 }))
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts[0]).toBe('대기 중')
    expect(texts.slice(2)).toEqual([DIVIDER, 'Context', '███████░░░', '68% (136k / 200k)'])
    await ui.unmount()
  }
})

test('the state, message, divider and bar take their colours', KOREAN, async ($, on) => {
  on('session.usage', () => usage({ tokens: 136000, window: 200000, percent: 68 }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts[0]?.props).toMatchObject({ color: 'subtle', bold: true })
  expect(texts[1]?.props).toMatchObject({ color: '#C47BE6' })
  expect(texts[2]?.props).toMatchObject({ color: 'subtle' })
  expect(texts[3]?.props).toMatchObject({ dimColor: true })
  expect(texts[4]?.props).toMatchObject({ color: 'success' })
  await ui.unmount()
})

test('the bar turns warning, then error, and is left out before the first reading', KOREAN, async ($, on) => {
  let reading: { tokens?: number; window: number; percent?: number } = { tokens: 150000, window: 200000, percent: 75 }
  on('session.usage', () => usage(reading))

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: '████████░░' }))?.props).toMatchObject({ color: 'warning' })
  await ui.unmount()

  reading = { tokens: 180000, window: 200000, percent: 90 }
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: '█████████░' }))?.props).toMatchObject({ color: 'error' })
  expect((await ui.find({ type: 'Text', text: /180k/ }))?.text).toBe('90% (180k / 200k)')
  await ui.unmount()

  reading = { window: 200000 }
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.slice(2)).toEqual([DIVIDER, 'Context', '아직 없음'])
  await ui.unmount()
})

test('without any reading there is no divider and the band keeps its two lines', KOREAN, async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toHaveLength(2)
  expect(texts).not.toContain(DIVIDER)
  await ui.unmount()
})
