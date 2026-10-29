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

// A colour only each prop (or the mood's own laptop and question mark) uses.
const PAGE = '#f4eede'
const PROMPT = '#60de80'
const LAND = '#60c870'
const LENS_FRAME_ONLY = '#545c78'
const LAPTOP = '#96a0ba'
const QUESTION = '#7884ff'

async function source($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const value = ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source
  await ui.unmount()
  return value
}

test('Ditto holds a prop for the tool it is using, in place of the mood\'s own', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(1000)
  expect(await source($)).toContain(QUESTION)

  const use = async (input: Record<string, unknown>) => {
    await $.tool.call(input as never)
    await clock.advance(1000)
    return source($)
  }

  const reading = await use({ tool: 'Read', file_path: '/a.ts' })
  expect(reading).toContain(PAGE)
  expect(reading).toContain(QUESTION)

  const searching = await use({ tool: 'Grep', pattern: 'x' })
  expect(searching).toContain(LENS_FRAME_ONLY)
  expect(searching).not.toContain(QUESTION)
  expect(searching).not.toContain(PAGE)

  const browsing = await use({ tool: 'WebSearch', query: 'x' })
  expect(browsing).toContain(LAND)

  const running = await use({ tool: 'Bash', command: 'ls' })
  expect(running).toContain(PROMPT)
  expect(running).not.toContain(LAPTOP)

  const editing = await use({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' })
  expect(editing).toContain(LAPTOP)
  expect(editing).not.toContain(PROMPT)
})

test('a new turn starts without the last turn\'s prop, and other moods hold none', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' } as never)
  await $.turn.complete({ turnId: 't1', answer: '다 읽었어요.' } as never)
  await clock.advance(1000)
  expect(await source($)).not.toContain(PAGE)

  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(1000)
  expect(await source($)).not.toContain(PAGE)
})
