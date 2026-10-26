import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const ALT: Record<string, string> = {
  idle: '기다리는 메타몽', thinking: '고민하는 메타몽', working: '노트북으로 코드를 고치는 메타몽',
  error: '당황한 메타몽', done: '반짝이며 기뻐하는 메타몽',
}

async function alt($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const value = ((await ui.find({ type: 'Svg' }))?.props as { alt: string }).alt
  await ui.unmount()
  return value
}

test('/ditto mood and /ditto demo', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const run = (args: string) => $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never)

  for (const mood of Object.keys(ALT)) {
    const r = await run(`mood ${mood}`)
    expect((r as { text: string }).text).toContain('바꿨어요')
    expect(await alt($)).toBe(ALT[mood])
  }
  expect(((await run('mood sad')) as { text: string }).text).toContain('idle, thinking')

  await run('demo')
  const seen = [await alt($)]
  for (let i = 0; i < 5; i++) {
    await clock.advance(3000)
    seen.push(await alt($))
  }
  expect(seen).toEqual([ALT.idle, ALT.thinking, ALT.working, ALT.error, ALT.done, ALT.idle])
})
