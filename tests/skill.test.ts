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

async function messageLine($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ ...BAND, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts[1]
}

const runSkill = ($: Engine, skill: string) => $.skill.prompt({ skill, text: 'skill body' })

test('a skill run is announced in the message line for 10 seconds, on terminal and desktop', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const before = await messageLine($)
  await runSkill($, 'humanizer')
  expect(await messageLine($, 'terminal')).toBe('메타몽은 humanizer을(를) 사용했다!')
  expect(await messageLine($, 'desktop')).toBe('메타몽은 humanizer을(를) 사용했다!')

  await clock.advance(9999)
  expect(await messageLine($)).toBe('메타몽은 humanizer을(를) 사용했다!')
  await clock.advance(1)
  const after = await messageLine($)
  expect(after).not.toContain('사용했다!')
  expect(typeof before).toBe('string')
})

test('a second skill within 10 seconds replaces the first and restarts the wait', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))

  await runSkill($, 'humanizer')
  await clock.advance(6000)
  await runSkill($, 'anthropic-skills:docs')
  expect(await messageLine($)).toBe('메타몽은 docs을(를) 사용했다!')
  await clock.advance(6000)
  expect(await messageLine($)).toBe('메타몽은 docs을(를) 사용했다!')
  await clock.advance(4000)
  expect(await messageLine($)).not.toContain('사용했다!')
})

test('the announcement takes the accent colour, the usual message Ditto\'s purple', KOREAN, async ($, on) => {
  const clock = mock.clock(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const colourOfMessage = async () => {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const props = (await ui.findAll({ type: 'Text' }))[1]?.props
    await ui.unmount()
    return props
  }

  await runSkill($, 'humanizer')
  expect(await colourOfMessage()).toMatchObject({ color: 'claude', bold: true })
  await clock.advance(10000)
  expect(await colourOfMessage()).toMatchObject({ color: '#C47BE6' })
})

test('the object particle follows the last syllable or digit', KOREAN, async ($, on) => {
  mock.clock(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const cases: [string, string][] = [
    ['커밋', '메타몽은 커밋을 사용했다!'],
    ['정리', '메타몽은 정리를 사용했다!'],
    ['deploy-v3', '메타몽은 deploy-v3을 사용했다!'],
    ['deploy-v2', '메타몽은 deploy-v2를 사용했다!'],
  ]
  for (const [skill, expected] of cases) {
    await runSkill($, skill)
    expect(await messageLine($)).toBe(expected)
  }
})

test('the skill itself still runs with its own text', KOREAN, async ($, on) => {
  mock.clock(on)
  on('skill.prompt', (_, e) => ({ text: `${e.text} (engine)` }))
  const result = await runSkill($, 'humanizer')
  expect(result.text).toBe('skill body (engine)')
})
