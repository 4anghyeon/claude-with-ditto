import { expect, mock, test } from 'claude-code/testing'

// The band's text is checked in Korean; English has a test of its own.
const KOREAN = { options: { language: 'ko' } } as const

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('terminal sprite is repainted by blit: idle only blinks, other moods hop too', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  const blits: { requestId: string; key: string; cells?: string }[] = []
  on('ui.blit', (_, e) => {
    blits.push(e as never)
    return { value: {} }
  })
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(125 * 24)
  expect(blits.length).toBeGreaterThan(20)
  expect(blits[0]).toMatchObject({ requestId: 'above-prompt', key: 'ditto-sprite' })
  expect(new Set(blits.map(b => b.cells)).size).toBe(2)
  await ui.unmount()

  blits.length = 0
  await $.turn.start({ text: 'go', turnId: 't1' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(125 * 24)
  expect(new Set(blits.map(b => b.cells)).size).toBeGreaterThan(2)
  await ui.unmount()
})

test('desktop svg: idle only blinks, other moods hop and twinkle', KOREAN, async ($, on) => {
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const svg = (await ui.find({ type: 'Svg' }))?.props as { source: string; isInteractive: boolean }
    expect(svg.isInteractive).toBe(true)
    expect(svg.source).not.toContain('<animateTransform')
    expect(svg.source).toContain('<animate attributeName="opacity" values="0;1;0"')
    await ui.unmount()
  }
  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = (await ui.find({ type: 'Svg' }))?.props as { source: string; alt: string }
  expect(svg.alt).toBe('고민하는 메타몽')
  expect(svg.source).toContain('<animateTransform')
  await ui.unmount()
})
