import { expect, mock, test } from 'claude-code/testing'

// The band's text is checked in Korean; English has a test of its own.
const KOREAN = { options: { language: 'ko' } } as const

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the message changes every 5 seconds while the mood stays', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })

  const read = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    await ui.unmount()
    return texts
  }
  const lines = [await read()]
  await clock.advance(4000)
  lines.push(await read())
  await clock.advance(1000)
  lines.push(await read())
  await clock.advance(5000)
  lines.push(await read())

  expect(lines.every(l => l[0] === '생각 중')).toBe(true)
  expect(lines[1]?.[1]).toBe(lines[0]?.[1])
  expect(lines[2]?.[1]).not.toBe(lines[1]?.[1])
  expect(lines[3]?.[1]).not.toBe(lines[2]?.[1])
})
