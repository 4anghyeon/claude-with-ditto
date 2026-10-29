import { expect, mock, test } from 'claude-code/testing'

// The band's text is checked in Korean; English has a test of its own.
const KOREAN = { options: { language: 'ko' } } as const

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('terminal sprite is repainted by blit: idle breathes and blinks, other moods hop on top of that', KOREAN, async ($, on) => {
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
  const idle = new Set(blits.map(b => b.cells)).size
  expect(idle).toBeGreaterThan(2)
  await ui.unmount()

  blits.length = 0
  await $.turn.start({ text: 'go', turnId: 't1' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(125 * 24)
  expect(new Set(blits.map(b => b.cells)).size).toBeGreaterThan(idle)
  await ui.unmount()
})

test('desktop svg: idle only blinks, other moods hop and twinkle', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const svg = (await ui.find({ type: 'Svg' }))?.props as { source: string; isInteractive: boolean }
    // An image, so a new SVG never blanks a frame while it loads.
    expect(svg.isInteractive).toBe(false)
    expect(svg.source).not.toContain('<animateTransform')
    expect(svg.source).toContain('<animate attributeName="opacity" values="0;1;0"')
    await ui.unmount()
  }
  await $.turn.start({ text: 'go', turnId: 't1' })
  // Past the change from idle to thinking.
  await clock.advance(1000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = (await ui.find({ type: 'Svg' }))?.props as { source: string; alt: string }
  expect(svg.alt).toBe('고민하는 메타몽')
  expect(svg.source).toContain('<animateTransform')
  await ui.unmount()
})

test('desktop svg: every mood breathes between a resting and a risen frame, each with lids that blink', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const run = (args: string) => $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const mood of ['idle', 'thinking', 'working', 'error', 'done']) {
    await run(`mood ${mood}`)
    await clock.advance(1000)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const source = ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source
    const breaths = source.split('<g visibility="').length - 1
    expect(breaths).toBe(2)
    // The resting frame shows before the animations start, so a new SVG never draws an empty Ditto.
    expect(source.split('<g visibility="visible">').length - 1).toBe(1)
    expect(source.split('values="0;1;0"').length - 1).toBe(breaths)
    expect(source).toContain('dur="10.0s"')
    await ui.unmount()
  }
})
