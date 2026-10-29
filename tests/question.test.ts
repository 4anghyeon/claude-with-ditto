import { expect, mock, test } from 'claude-code/testing'

// The band's text is checked in Korean; English has a test of its own.
const KOREAN = { options: { language: 'ko' } } as const

test('/ditto <question> sends just the question, as the person\'s own words', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  const submitted: { text: string; context?: readonly string[]; origin: unknown }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push({ text: e.text, context: e.context, origin: e.origin })
    return { text: e.text }
  })
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const run = (args: string) => $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never)

  const answer = (await run('이 함수 개선점 있을까?')) as { text: string }
  expect(answer.text).toBe('메타몽에게 질문을 보냈어요.')
  expect(submitted).toHaveLength(0)
  await clock.advance(1)
  expect(submitted).toHaveLength(1)
  expect(submitted[0]?.text).toBe('메타몽, 이 함수 개선점 있을까?')
  expect(submitted[0]?.origin).toMatchObject({ kind: 'plugin', name: 'ditto', asUser: true })

  await run('mood done')
  await run('help')
  await clock.advance(1000)
  expect(submitted).toHaveLength(1)
})

test('the system prompt tells the model how to answer a Ditto question', KOREAN, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'engine', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  const persona = sections.find(section => section.id === 'ditto:persona')
  expect(persona?.scope).toBe('session')
  expect(persona?.text).toContain('"메타몽,"으로 시작하면')
  expect(sections[0]?.id).toBe('intro')
})
