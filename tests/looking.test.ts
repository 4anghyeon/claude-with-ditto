import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The band's text is checked in Korean; English has a test of its own.
const KOREAN = { options: { language: 'ko' } } as const

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

async function source($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const value = ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source
  await ui.unmount()
  return value
}

test('in every mood Ditto glances around and turns now and then', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  // Past the change from idle to thinking.
  await clock.advance(1000)

  const first = await source($)
  const still = new Set<string>()
  for (let ms = 0; ms < 2500; ms += 500) {
    still.add(await source($))
    await clock.advance(500)
  }
  expect(still).toEqual(new Set([first]))

  const sequence: string[] = []
  for (let ms = 0; ms < 120000; ms += 1000) {
    await clock.advance(1000)
    sequence.push(await source($))
  }
  // Two facings times four gazes: in two minutes Ditto shows several of them, and comes back to the first.
  expect(new Set(sequence).size).toBeGreaterThan(3)
  expect(sequence.slice(10)).toContain(first)
})
