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

const isTransition = (svg: string) => svg.includes('repeatCount="1" fill="freeze"')

test('a new mood melts in from the old one for 0.875 seconds, then Ditto settles into it', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(isTransition(await source($))).toBe(false)

  await $.turn.start({ text: 'go', turnId: 't1' })
  const melting = await source($)
  expect(isTransition(melting)).toBe(true)
  // Seven frames, shown once each, with neither the hop nor the glyphs of the new mood.
  expect(melting.split('<g visibility="').length - 1).toBe(7)
  expect(melting.split('<g visibility="visible">').length - 1).toBe(1)
  expect(melting).not.toContain('<animateTransform')

  await clock.advance(874)
  expect(isTransition(await source($))).toBe(true)
  await clock.advance(1)
  const settled = await source($)
  expect(isTransition(settled)).toBe(false)
  expect(settled).toContain('<animateTransform')
})

test('a mood that comes while a change plays does not start another one', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const run = (args: string) => $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await run('mood thinking')
  await clock.advance(400)
  await run('mood working')
  expect(isTransition(await source($))).toBe(true)
  await clock.advance(475)
  expect(isTransition(await source($))).toBe(false)
})

test('the terminal plays the change once, then the new mood', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.blit', (_, e) => {
    blits.push((e as { cells: string }).cells)
    return { value: {} }
  })
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.turn.start({ text: 'go', turnId: 't1' })
  blits.length = 0
  await clock.advance(125 * 6)
  // The change's later frames, nearly all different: flattest, the old and the new Ditto can look the same.
  expect(new Set(blits).size).toBeGreaterThanOrEqual(blits.length - 1)
  await ui.unmount()
})
