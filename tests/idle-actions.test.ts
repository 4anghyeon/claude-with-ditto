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

// The plain idle sprite blinks, an action swaps whole frames, and only sleep has the floating Z.
function kindOf(source: string) {
  if (source.includes('#c8dcff')) return 'sleep'
  if (source.includes('attributeName="visibility"')) return 'action'
  if (source.includes('<animate attributeName="opacity" values="0;1;0"') && !source.includes('<animateTransform')) return 'idle'
  return 'other'
}

async function sourceOf($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source
  await ui.unmount()
  return source
}

async function drawn($: Engine) {
  return kindOf(await sourceOf($))
}

test('while idle Ditto does a short action now and then, then falls asleep after a minute', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const seen: string[] = []
  for (let ms = 0; ms < 59000; ms += 500) {
    seen.push(await drawn($))
    await clock.advance(500)
  }
  expect(seen.slice(0, 6).every(name => name === 'idle')).toBe(true)
  expect(seen).toContain('action')
  expect(seen.every(name => name === 'idle' || name === 'action')).toBe(true)

  // An action that is still playing at the minute finishes first.
  await clock.advance(5000)
  expect(await drawn($)).toBe('sleep')
  const asleep = new Set<string>()
  for (let ms = 0; ms < 60000; ms += 1000) {
    await clock.advance(1000)
    asleep.add(await sourceOf($))
  }
  // Asleep, Ditto neither glances nor turns: the sprite stays the same one.
  expect(asleep.size).toBe(1)
})

test('a new turn wakes Ditto, and the wait starts over when it is idle again', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  const run = (args: string) => $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await clock.advance(64000)
  expect(await drawn($)).toBe('sleep')
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await drawn($)).toBe('other')
  await clock.advance(120000)
  expect(await drawn($)).toBe('other')

  await run('mood idle')
  expect(await drawn($)).toBe('idle')
  await clock.advance(2500)
  expect(await drawn($)).toBe('idle')
})

test('the terminal plays an action\'s own frames', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  const blits: string[] = []
  on('ui.blit', (_, e) => {
    blits.push((e as { cells: string }).cells)
    return { value: {} }
  })
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(125 * 24)
  const blinking = new Set(blits)
  await clock.advance(64000)
  blits.length = 0
  await clock.advance(125 * 16)
  // Sleep has four frames of its own as the Z rises, and none of them is the blinking idle sprite.
  // A sleeping Ditto does not turn around, so no mirrored frames slip in.
  expect(new Set(blits).size).toBe(4)
  expect(blits.some(cells => blinking.has(cells))).toBe(false)
  await ui.unmount()
})
