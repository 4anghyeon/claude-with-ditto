# Claude with Ditto

<p align="center"><b>English</b> | <a href="README.ko.md">한국어</a></p>

A Claude Code mod in which Ditto sits above the prompt and shows how the work is going with its face. It runs in the terminal (CLI) and in the Code tab of Claude Desktop.

![Ditto's band in the terminal](docs/images/screenshot.png)

## Install

Start Claude Code in a terminal and type at the prompt:

```text
/plugin install ditto --marketplace 4anghyeon/claude-with-ditto
```

Or install it straight from the shell:

```sh
claude plugin install ditto --marketplace 4anghyeon/claude-with-ditto
```

`/plugin` does not work in the Desktop app. Press the + button next to the prompt box, add `4anghyeon/claude-with-ditto` under Plugins with Add marketplace, then press Add plugin.

## Update

Fetch the latest marketplace list, then update the mod:

```sh
claude plugin marketplace update claude-with-ditto
claude plugin update ditto@claude-with-ditto
```

A session that is already running picks up the new version after `/reload-plugins` or a restart.

## Uninstall

Remove the mod from the shell:

```sh
claude plugin uninstall ditto@claude-with-ditto
```

To remove the marketplace as well:

```sh
claude plugin marketplace remove claude-with-ditto
```

## Features

- A pixel Ditto moves above the prompt. The terminal draws it with half-block characters, Desktop with an animated SVG.
- Its face follows the state of the work.

  | State | Looks | When | Motion |
  |---|---|---|---|
  | Idle | ![Idle](docs/images/idle.gif) | The session starts, 10 seconds after Done | Blinks, now and then looks around or yawns, and falls asleep after a minute |
  | Thinking | ![Thinking](docs/images/thinking.gif) | A prompt is sent, files are read, tests run | Hops, with a question mark |
  | Working | ![Working](docs/images/working.gif) | Files are edited, other commands run | Types on a laptop |
  | Error | ![Error](docs/images/error.gif) | The answer mentions an error or a failure | Breaks into a sweat |
  | Done | ![Done](docs/images/done.gif) | Claude finishes its answer | Sparkles |

- Next to Ditto are the state and a line from Ditto, picked at random from ten per state and changed every 5 seconds.
- Context usage is shown as a bar and a percentage.
- Rate limits and the session's cost are shown too.
- So is the model in use.
- `/ditto <question>` asks Ditto. The question goes straight to this session, and Claude answers in Ditto's voice with the conversation's context.
- `/ditto mood <idle|thinking|working|error|done>` sets a face by hand, and `/ditto demo` shows all five in turn, then the four tool props.
- Ditto speaks English and Korean. In English it talks like the Pokémon games: "Ditto used Transform!"

## Language

Change it with `/ditto lang <auto|ko|en>`. The value is saved in Ditto's `language` row in `/config` and kept for later sessions.

The default, `auto`, follows Claude Code's own `language` setting: Korean when it names Korean (`korean` and the like), English for any other language. With no such setting it looks at the `LANG` environment variable, and without that at the system language.

## Good to know

Ditto's pixels live in `hooks/sprites.mjs`, and `hooks/draw.mjs` puts each frame together from them as it draws. The mod loads no outside images and makes no network requests.

In the terminal, Ditto looks cleanest with a line height of 1.0 and a monospace font that has block characters (JetBrains Mono and the like).

## Requirements

- Claude Code 2.1.287 or later, with mod support
- The interactive CLI or the Code tab of Claude Desktop (each draws Ditto a little differently)

## Check and run

Run these from the folder that holds `claude-with-ditto/`:

```sh
claude plugin validate ./claude-with-ditto
claude plugin test ./claude-with-ditto
claude --plugin-dir ./claude-with-ditto
```

Then try these in the session:

```text
/ditto demo
/ditto review this component's state management with me
```

## Layout

```text
claude-with-ditto/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── docs/
│   └── images/            The README's screenshot and the GIF for each state
├── hooks/
│   ├── hooks.json
│   ├── ditto.mjs
│   ├── draw.mjs           Puts each frame together from the pixels
│   ├── locales.mjs        Ditto's lines in Korean and English
│   └── sprites.mjs
├── tests/
│   └── *.test.ts
├── types/
│   └── index.d.ts
├── README.md
└── README.ko.md
```

## Security

Besides watching session events and drawing Ditto, the mod does only these three things:

- `/ditto <question>` sends the question to the current session.
- It adds a short section to the system prompt so that questions for Ditto are answered in Ditto's voice.
- `/ditto lang` saves the mod's own `language` setting.

To pick a language it reads Claude Code's `language` setting and the `LANG` environment variable. It leaves the prompts you type alone and never blocks or approves tool runs. It reads and writes no other files and makes no network requests.
