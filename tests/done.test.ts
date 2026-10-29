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

async function label($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const value = (await ui.findAll({ type: 'Text' }))[0]?.text
  await ui.unmount()
  return value
}

test('Ditto waits again 10 seconds after a turn is done', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({ turnId: 't1', answer: '다 고쳤어요.' } as never)
  expect(await label($)).toBe('작업 완료')
  await clock.advance(9999)
  expect(await label($)).toBe('작업 완료')
  await clock.advance(1)
  expect(await label($)).toBe('대기 중')
})

test('a turn that starts before then keeps its own mood', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete({ turnId: 't1', answer: '다 고쳤어요.' } as never)
  await clock.advance(5000)
  await $.turn.start({ text: 'go', turnId: 't2' })
  await clock.advance(5000)
  expect(await label($)).toBe('생각 중')
})

test('an answer that reports an error or a failure shows the error face, and it stays', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  for (const answer of ['Tests failed.', 'An exception was thrown', '테스트가 실패했어요.', '빌드 오류가 났어요.']) {
    await $.turn.complete({ turnId: 't1', answer } as never)
    expect(await label($)).toBe('오류 발견')
  }
  await clock.advance(20000)
  expect(await label($)).toBe('오류 발견')

  await $.turn.complete({ turnId: 't2', answer: 'Fixed the terrorist-free errorless code.' } as never)
  expect(await label($)).toBe('작업 완료')
})
