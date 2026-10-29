import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

const BAND = {
  plugin: 'ditto',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const ENGLISH = { options: { language: 'en' } } as const
const KOREAN = { options: { language: 'ko' } } as const

async function startSession($: Engine, on: Parameters<TestBody>[1]) {
  on('command.register', () => ({ value: { command: 'ditto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'ditto', args, origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 80 } } as never) as Promise<{ text: string }>

async function label($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const value = (await ui.findAll({ type: 'Text' }))[0]?.text
  await ui.unmount()
  return value
}

test('in English the band, the sprite and the command all speak English', ENGLISH, async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.compose', () => ({ sections: [] }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const submitted: string[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await startSession($, on)

  expect(await label($)).toBe('Idle')
  expect((await run($, 'mood done')).text).toBe("Ditto's mood is now Done.")
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts[0]).toBe('Done')
    expect(texts[1]).not.toMatch(/[가-힣]/)
    if (surface === 'desktop') {
      expect((await ui.find({ type: 'Svg' }))?.props).toMatchObject({ alt: 'Ditto sparkling with joy' })
    }
    await ui.unmount()
  }

  expect((await run($, 'help')).text).toContain('Usage: /ditto <question or problem>')
  expect((await run($, 'how is this function?')).text).toBe('Sent your question to Ditto.')
  await clock.advance(1)
  expect(submitted).toEqual(['Ditto, how is this function?'])

  await $.skill.prompt({ skill: 'humanizer', text: 'skill body' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text' }))[1]?.text).toBe('Ditto used humanizer!')
  await ui.unmount()

  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(sections.find(section => section.id === 'ditto:persona')?.text).toContain('starts with "Ditto,"')
})

test('auto follows Claude Code\'s language setting', async ($, on) => {
  mock.clock(on)
  let language = 'Korean'
  on('settings.read', () => ({ value: { language } }))
  on('env.get', () => ({ value: 'en_US.UTF-8' }))
  await startSession($, on)
  expect(await label($)).toBe('대기 중')

  language = 'japanese'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await label($)).toBe('Idle')
})

test('with no language setting auto follows LANG', async ($, on) => {
  mock.clock(on)
  let lang = 'ko_KR.UTF-8'
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: lang }))
  await startSession($, on)
  expect(await label($)).toBe('대기 중')

  lang = 'en_US.UTF-8'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await label($)).toBe('Idle')
})

test('a language picked in the options wins over the setting', ENGLISH, async ($, on) => {
  mock.clock(on)
  on('settings.read', () => ({ value: { language: 'korean' } }))
  await startSession($, on)
  expect(await label($)).toBe('Idle')
})

test('/ditto lang saves the option through the config menu\'s row', KOREAN, async ($, on) => {
  mock.clock(on)
  const set: unknown[] = []
  on('config.list', () => ({
    value: [
      { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', provider: { plugin: 'engine', tier: 'core' }, isLocked: false },
      { key: 'ditto@claude-with-ditto.language', label: 'Language', kind: 'choice', value: 'ko', options: ['auto', 'ko', 'en'], provider: { plugin: 'ditto@claude-with-ditto', tier: 'user' }, isLocked: false },
    ],
  }) as never)
  on('config.set', (_, e) => {
    set.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  await startSession($, on)

  expect((await run($, 'lang')).text).toContain('지금 언어 설정은 한국어예요')
  expect((await run($, 'lang fr')).text).toContain('/ditto lang <auto|ko|en>')
  expect(set).toEqual([])
  expect((await run($, 'lang en')).text).toBe("Ditto's language setting is now English.")
  expect(set).toEqual([{ key: 'ditto@claude-with-ditto.language', value: 'en' }])
})

test('/ditto lang says why when the setting cannot change', KOREAN, async ($, on) => {
  mock.clock(on)
  on('config.list', () => ({
    value: [{ key: 'ditto.language', label: 'Language', kind: 'choice', value: 'ko', provider: { plugin: 'ditto', tier: 'user' }, isLocked: true }],
  }) as never)
  on('config.set', () => ({ deny: 'locked by policy' }))
  await startSession($, on)
  expect((await run($, 'lang auto')).text).toBe('언어 설정을 바꾸지 못했어요. locked by policy')
})

test('/ditto lang names the language, and auto names the one it picked', KOREAN, async ($, on) => {
  mock.clock(on)
  on('config.list', () => ({
    value: [{ key: 'ditto.language', label: 'Language', kind: 'choice', value: 'ko', provider: { plugin: 'ditto', tier: 'user' }, isLocked: false }],
  }) as never)
  on('config.set', (_, e) => ({ value: e.value }))
  on('settings.read', () => ({ value: { language: 'korean' } }))
  await startSession($, on)
  expect((await run($, 'lang ko')).text).toBe('메타몽 언어 설정을 한국어로 바꿨어요.')
  expect((await run($, 'lang auto')).text).toBe('메타몽 언어 설정을 자동(한국어)으로 바꿨어요.')
})
