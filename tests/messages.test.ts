import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const LABELS: Record<string, string> = { idle: '대기 중', thinking: '생각 중', working: '함께 작업 중', error: '오류 발견', done: '작업 완료' }

test('band shows only the state and a random message for it', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const run = (args: string) => $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const mood of Object.keys(LABELS)) {
      const seen = new Set<string>()
      for (let i = 0; i < 12; i++) {
        await run(`mood ${mood}`)
        const ui = await $.ui.mount({ ...BAND, surface })
        const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
        expect(texts[0]).toBe(LABELS[mood])
        expect(texts.length).toBe(2)
        seen.add(texts[1] ?? '')
        await ui.unmount()
      }
      expect(seen.size).toBeGreaterThan(3)
    }
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /DITTO PAIR|메타몽$|대화하려면/ })).toBeUndefined()
    await ui.unmount()
  }
})
