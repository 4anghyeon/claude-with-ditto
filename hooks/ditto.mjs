// Claude with Ditto — terminal/Desktop companion.
// Uses only documented mod hooks and UI primitives. The command /ditto <message>
// sends a pair-programming question to the current session, answered in Ditto's voice.

import { LOCALES } from "./locales.mjs";
import { drawSprite, FRAME_MS, terminalFrame, TRANSITION_MS } from "./draw.mjs";
import { IDLE_ACTIONS } from "./sprites.mjs";

const SPRITE_KEY = "ditto-sprite";

// The terminal band the animation repaints; cleared when the band is gone.
const animation = { requestId: undefined, sprite: undefined, action: undefined, transition: undefined, tick: 0 };

const STATE = { plugin: "ditto", key: "state" };

// The language's table, picked when the session starts; Korean until then.
let text = LOCALES.ko;
const LANGUAGE_OPTIONS = ["auto", "ko", "en"];

// Answers /ditto questions in Ditto's voice, in the table's language.
function personaSection() {
  return { id: "ditto:persona", scope: "session", text: text.persona(text.questionPrefix.trim()).join("\n") };
}

// Theme colours, so each one reads well in both the light and the dark theme.
const MOODS = {
  idle:     { color: "subtle" },
  thinking: { color: "suggestion" },
  working:  { color: "warning" },
  error:    { color: "error" },
  done:     { color: "success" },
};

// Ditto's own body colour from the sprite, so the message reads as Ditto speaking.
const MESSAGE_COLOR = "#C47BE6";

const DITTO_ART = [
  "      .--.",
  "   .-'          '-.",
  "  /   •        •   \\",
  " |       ───       |",
  "  \\               /",
  "   '-.__________.-'",
];

export function register(on, options) {
  const languageOption = options?.language ?? "auto";

  on("session.start", async ($, e, next) => {
    const result = await next(e);
    text = LOCALES[await resolveLanguage($, options?.language)];
    // A reload may follow a language change, so the line on screen is picked again from the new table.
    await saveState($, { mood: "idle" }, { refresh: true });
    await $.command.register({ name: "ditto", description: text.commandDescription });
    startAnimation($);
    startLooking($);
    return result;
  });

  on("turn.start", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId) {
      await saveState($, { mood: "thinking", lastTool: undefined });
    }
    return result;
  });

  on("tool.call", async ($, e, next) => {
    const tool = String(e.tool ?? "");

    // Observe tools only; never block or rewrite them. The mood and the prop change as the tool starts,
    // so Ditto holds the prop while the tool runs.
    if (tool === "Bash") {
      const command = String(e.command ?? "");
      const mood = /test|lint|typecheck|build|check/i.test(command) ? "thinking" : "working";
      await saveState($, { mood, lastTool: tool });
    } else if (["Read", "Glob", "Grep", "WebSearch", "WebFetch"].includes(tool)) {
      await saveState($, { mood: "thinking", lastTool: tool });
    } else if (["Edit", "Write", "NotebookEdit"].includes(tool)) {
      await saveState($, { mood: "working", lastTool: tool });
    }
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId) {
      const answer = String(e.answer ?? "");
      const mood = /\b(error|failed|exception)\b|실패|오류/i.test(answer) ? "error" : "done";
      await saveState($, { mood });
      if (mood === "done") scheduleIdle($);
    }
    return result;
  });

  on("command.run", { command: "ditto" }, async ($, e) => {
    const raw = String(e.args ?? "").trim();
    const [word, name] = raw.split(/\s+/);
    if (word === "mood") {
      if (!MOODS[name]) {
        return { text: text.moodNames(Object.keys(MOODS).join(", ")) };
      }
      await showMood($, name);
      return { text: text.moodChanged(text.moods[name]) };
    }
    if (word === "lang") {
      if (!LANGUAGE_OPTIONS.includes(name)) {
        return { text: text.languageNow(languageOption, text.languageName) };
      }
      const { deny } = await setLanguageOption($, name);
      if (deny !== undefined) return { text: text.languageDenied(deny) };
      // The reply already speaks the language the reload is about to switch to.
      const next = LOCALES[await resolveLanguage($, name)];
      return { text: next.languageSet(name, next.languageName) };
    }
    if (word === "demo") {
      await startDemo($);
      return { text: text.demoStarted(DEMO_MS / 1000) };
    }
    if (!raw || raw === "help") {
      return { text: text.help.join("\n") };
    }

    // Sends the question to this session as a turn of its own, so the answer keeps the conversation's context.
    // A command.run hook holds the turn it answers, so the question goes out just after the command ends.
    // It reads as the person's own words, and the persona section tells the model to answer as Ditto.
    $.clock.after(1, () => void $.prompt.submit({ text: text.questionPrefix + raw, asUser: true }));
    return { text: text.questionSent };
  });

  on("prompt.compose", async ($, e, next) => {
    const { sections } = await next(e);
    return { sections: [...sections, personaSection()] };
  });

  // Every skill run passes here: typed as /name, called by the Skill tool, or preloaded into a subagent.
  on("skill.prompt", async ($, e, next) => {
    const result = await next(e);
    await announceSkill($, e.skill);
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props?.hasSurvey) return next(e);

    const { value } = await $.state.get(STATE);
    const state = value ?? { mood: "idle", lastMessage: text.messages.idle[0] };
    const mood = MOODS[state.mood] ?? MOODS.idle;
    const elements = $.ui.resolve(e);
    const { Box, Text } = elements;

    // Terminal draws the sprite as half-block cells that a timer repaints, Desktop as an animated SVG;
    // ASCII art where neither exists. Other surfaces list Raster too but draw it as an empty fragment,
    // so pick by surface.
    const sprite = drawSprite({ ...state, prop: propFor(state) });
    if (e.surface === "terminal") {
      // An idle action or a change of mood plays from its first frame.
      if (animation.action !== state.action || animation.transition !== state.transition) animation.tick = 0;
      animation.requestId = e.requestId;
      animation.sprite = sprite;
      animation.action = state.action;
      animation.transition = state.transition;
    }
    const art = e.surface === "terminal"
      ? [elements.Raster({ key: SPRITE_KEY, ...terminalFrame(sprite, animation.tick) })]
      : elements.Svg
        ? [elements.Svg({ ...sprite.svg, alt: text.alts[state.mood] ?? text.alts.idle })]
        : DITTO_ART.map((line) => Text({ color: "magenta", children: line }));

    // The status line's own figures; the plain call costs nothing. The band redraws at least every
    // MESSAGE_MS when the message changes, so the bar stays current without a timer of its own.
    const usage = await $.session.usage().catch(() => undefined);
    const context = usage ? contextParts(usage.context) : undefined;
    const usageItems = usage ? usageParts(usage.rateLimits, usage.cost) : [];
    // The main loop's model as /model shows it; a /model switch shows up on the next redraw.
    const model = await $.session.model().catch(() => undefined);

    // Session facts under a divider, apart from what Ditto says: a dim label, then the value.
    const infoRow = (label, values) =>
      Box({
        flexDirection: "row",
        columnGap: 1,
        children: [Text({ dimColor: true, children: label.padEnd(INFO_LABEL_WIDTH) }), ...values],
      });
    const info = [
      ...(context
        ? [infoRow("Context", [
            ...(context.bar ? [Text({ color: context.color, children: context.bar })] : []),
            Text({ children: context.value }),
          ])]
        : []),
      ...(usageItems.length > 0
        ? [infoRow("Usage", usageItems.flatMap((item, i) => [
            ...(i > 0 ? [Text({ color: "subtle", children: SEPARATOR })] : []),
            Text({ children: item }),
          ]))]
        : []),
      ...(model ? [infoRow("Model", [Text({ children: model })])] : []),
    ];
    return Box({
      flexDirection: "row",
      paddingX: 1,
      children: [
        Box({ flexDirection: "column", children: art }),
        Box({
          flexDirection: "column",
          justifyContent: "center",
          paddingX: 1,
          children: [
            Text({ color: mood.color, bold: true, children: text.moods[state.mood] ?? text.moods.idle }),
            state.announcement
              ? Text({ color: ANNOUNCEMENT_COLOR, bold: true, children: state.announcement })
              : Text({ color: MESSAGE_COLOR, children: String(state.lastMessage ?? text.messages.idle[0]) }),
            ...(info.length > 0 ? [Text({ color: "subtle", children: DIVIDER }), ...info] : []),
          ],
        }),
      ],
    });
  });
}

// The prop Ditto holds for the tool it last used this turn, while it is thinking or working.
const TOOL_PROPS = { Read: "read", Grep: "search", Glob: "search", Bash: "bash", WebSearch: "web", WebFetch: "web" };

function propFor({ mood, lastTool }) {
  return mood === "thinking" || mood === "working" ? TOOL_PROPS[lastTool] : undefined;
}

// Test commands: pin one mood, or walk through every mood once and then the tools' props.
const DEMO_MS = 3000;
let demoTimer;

async function showMood($, name) {
  demoTimer?.cancel();
  demoTimer = undefined;
  await saveState($, { mood: name }, { refresh: true });
}

// Each prop is shown in a mood that holds it, as if Ditto were using that tool.
const DEMO_PROPS = [
  { mood: "thinking", lastTool: "Read" },
  { mood: "thinking", lastTool: "Grep" },
  { mood: "working", lastTool: "Bash" },
  { mood: "thinking", lastTool: "WebSearch" },
];

async function startDemo($) {
  const steps = [...Object.keys(MOODS).map((mood) => ({ mood, lastTool: undefined })), ...DEMO_PROPS];
  await showMood($, steps[0].mood);
  const step = (i) => {
    demoTimer = $.clock.after(DEMO_MS, () => {
      if (i < steps.length) {
        void saveState($, steps[i]);
        step(i + 1);
      } else {
        void saveState($, { mood: "idle", lastTool: undefined });
        demoTimer = undefined;
      }
    });
  };
  step(1);
}

// Box-drawing and block characters, which every terminal draws one cell wide.
const DIVIDER = "─".repeat(30);
const SEPARATOR = "│";
const INFO_LABEL_WIDTH = "Context".length;
const CONTEXT_BAR_CELLS = 10;
const CONTEXT_WARN_PERCENT = 70;
const CONTEXT_FULL_PERCENT = 85;

// Short names for the rate-limit windows; a window the list does not know keeps its own name.
const LIMIT_NAMES = { five_hour: "5h", seven_day: "7d", spend_limit: "spend" };

// The rate-limit windows as percentages, then the session's cost, for one line. An account with no
// plan limits has no windows (nor does any session before its first response), so it shows the cost alone.
function usageParts(rateLimits, cost) {
  const parts = (rateLimits ?? []).map(limit => `${LIMIT_NAMES[limit.kind] ?? limit.kind} ${limit.percentUsed}%`);
  if (cost) parts.push(`$${cost.usd.toFixed(2)}`);
  return parts;
}

function formatTokens(tokens) {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

// The bar and the figures of the context line. A fresh or just-compacted session has no reading
// until its next response, so it has no bar.
function contextParts(context) {
  if (context?.percent === undefined || context.tokens === undefined) {
    return { value: text.contextEmpty };
  }
  const percent = Math.min(100, Math.max(0, context.percent));
  const filled = Math.round((percent / 100) * CONTEXT_BAR_CELLS);
  return {
    bar: "█".repeat(filled) + "░".repeat(CONTEXT_BAR_CELLS - filled),
    color: percent >= CONTEXT_FULL_PERCENT ? "error" : percent >= CONTEXT_WARN_PERCENT ? "warning" : "success",
    value: `${percent}% (${formatTokens(context.tokens)} / ${formatTokens(context.window)})`,
  };
}

// Repaints only the sprite's cells each frame, without redrawing the band.
function startAnimation($) {
  $.clock.every(FRAME_MS, () => void stepAnimation($));
}

async function stepAnimation($) {
  if (animation.requestId === undefined) return;
  animation.tick += 1;
  const sprite = animation.sprite ?? drawSprite({ mood: "idle" });
  // A blit that fails outright stops the animation as a refused one does, until the band is drawn again.
  const result = await $.ui
    .blit({ requestId: animation.requestId, key: SPRITE_KEY, ...terminalFrame(sprite, animation.tick) })
    .catch(() => ({ deny: "blit failed" }));
  if (result.deny !== undefined) animation.requestId = undefined;
}

// Picks a message for the mood, never the one on screen, so the line visibly changes.
function randomMessage(mood, current) {
  const choices = text.messages[mood].filter((message) => message !== current);
  return choices[Math.floor(Math.random() * choices.length)];
}

// A skill run is announced in the message's place for a while, the way a Pokémon battle names a move,
// in the theme's accent colour so it stands apart from Ditto's usual lines.
const ANNOUNCEMENT_MS = 10000;
const ANNOUNCEMENT_COLOR = "claude";
let announcementTimer;

async function announceSkill($, skill) {
  // A plugin skill is named "plugin:skill"; the skill's own name is enough here.
  const name = skill.split(":").pop();
  announcementTimer?.cancel();
  await saveState($, { announcement: text.skillUsed(name) });
  announcementTimer = $.clock.after(ANNOUNCEMENT_MS, () => void saveState($, { announcement: undefined }));
}

// After a finished turn Ditto celebrates for a while, then waits again. A turn that starts in the
// meantime has changed the mood, so the timer leaves it alone.
const DONE_MS = 10000;
let idleTimer;

function scheduleIdle($) {
  idleTimer?.cancel();
  idleTimer = $.clock.after(DONE_MS, async () => {
    const { value } = await $.state.get(STATE);
    if (value?.mood === "done") await saveState($, { mood: "idle" });
  });
}

// How long one message stays before Ditto says another one for the same mood.
const MESSAGE_MS = 5000;
let messageTimer;

// A new message only when the mood changes (or `refresh`), so a run of tool calls does not flicker it.
// Each new message schedules the next one, so the line keeps changing while the mood stays.
async function saveState($, patch, { refresh = false } = {}) {
  const { value: previous } = await $.state.get(STATE);
  const mood = patch.mood ?? previous?.mood ?? "idle";
  const keep = !refresh && previous?.mood === mood && previous?.lastMessage;
  // A reload drops the module's timers, so Ditto starts waiting over even when it was idle already.
  const startsIdle = mood === "idle" && (previous?.mood !== "idle" || !idleActions.running);
  // A new mood melts in from the old one. One that comes while a change still plays just becomes what
  // Ditto wells up into, so a burst of tool calls does not keep it melting.
  const startsTransition = previous?.mood !== undefined && previous.mood !== mood && !previous.transition;
  await $.state.set(STATE, {
    ...(previous ?? {}),
    ...patch,
    mood,
    ...(startsTransition ? { transition: previous.mood } : {}),
    ...(mood !== "idle" || startsIdle ? { action: undefined } : {}),
    lastMessage: keep ? previous.lastMessage : randomMessage(mood, previous?.lastMessage),
  });
  if (!keep) {
    messageTimer?.cancel();
    messageTimer = $.clock.after(MESSAGE_MS, () => void saveState($, {}, { refresh: true }));
  }
  if (startsTransition) {
    transitionTimer?.cancel();
    transitionTimer = $.clock.after(TRANSITION_MS, () => void saveState($, { transition: undefined }));
  }
  if (startsIdle) startIdleActions($);
  else if (mood !== "idle") stopIdleActions();
}

let transitionTimer;

// While idle Ditto blinks, and every so often does one short action. After a minute it falls asleep
// and sleeps until the mood changes.
const IDLE_ACTION_MIN_MS = 3000;
const IDLE_ACTION_MAX_MS = 5000;
const SLEEP_AFTER_MS = 60000;
const SLEEP_ACTION = "sleep";
const SHORT_ACTIONS = Object.keys(IDLE_ACTIONS).filter((name) => !IDLE_ACTIONS[name].loops);
const idleActions = { running: false, elapsed: 0, timer: undefined };

function startIdleActions($) {
  stopIdleActions();
  idleActions.running = true;
  idleActions.elapsed = 0;
  scheduleIdleAction($);
}

function stopIdleActions() {
  idleActions.timer?.cancel();
  idleActions.timer = undefined;
  idleActions.running = false;
}

function scheduleIdleAction($) {
  const wait = randomBetween(IDLE_ACTION_MIN_MS, IDLE_ACTION_MAX_MS);
  if (idleActions.elapsed + wait >= SLEEP_AFTER_MS) {
    // The last action may end past the minute, and then Ditto falls asleep right away.
    const left = Math.max(0, SLEEP_AFTER_MS - idleActions.elapsed);
    idleActions.timer = $.clock.after(left, () => void saveState($, { action: SLEEP_ACTION }));
    return;
  }
  idleActions.timer = $.clock.after(wait, async () => {
    const name = SHORT_ACTIONS[Math.floor(Math.random() * SHORT_ACTIONS.length)];
    const length = IDLE_ACTIONS[name].sequence.length * FRAME_MS;
    idleActions.elapsed += wait + length;
    await saveState($, { action: name });
    idleActions.timer = $.clock.after(length, async () => {
      await saveState($, { action: undefined });
      scheduleIdleAction($);
    });
  });
}

// In every mood Ditto now and then glances one way and back, and once in a while turns around. A sleeping
// Ditto keeps still, and the timers carry on so it looks around again once it wakes.
const GAZE_MIN_MS = 4000;
const GAZE_MAX_MS = 8000;
const TURN_MIN_MS = 15000;
const TURN_MAX_MS = 30000;
const GLANCES = ["left", "right", "up"];
let gazeTimer;
let turnTimer;

function startLooking($) {
  gazeTimer?.cancel();
  turnTimer?.cancel();
  scheduleGaze($);
  scheduleTurn($);
}

function scheduleGaze($) {
  gazeTimer = $.clock.after(randomBetween(GAZE_MIN_MS, GAZE_MAX_MS), async () => {
    const { value } = await $.state.get(STATE);
    const looking = value?.gaze && value.gaze !== "center";
    if (value?.action !== SLEEP_ACTION) {
      await saveState($, { gaze: looking ? "center" : GLANCES[Math.floor(Math.random() * GLANCES.length)] });
    }
    scheduleGaze($);
  });
}

function scheduleTurn($) {
  turnTimer = $.clock.after(randomBetween(TURN_MIN_MS, TURN_MAX_MS), async () => {
    const { value } = await $.state.get(STATE);
    if (value?.action !== SLEEP_ACTION) {
      await saveState($, { facing: value?.facing === "right" ? "left" : "right" });
    }
    scheduleTurn($);
  });
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

// Korean when Claude Code's own `language` setting names Korean, English when it names any other language.
// Most people never set it, so then the system's locale decides. A language picked in the options wins.
async function resolveLanguage($, option) {
  if (option === "ko" || option === "en") return option;
  const setting = await $.settings.read({ key: "language" }).catch(() => undefined);
  if (typeof setting === "string" && setting.trim()) {
    return /^(ko|korean|한국)/i.test(setting.trim()) ? "ko" : "en";
  }
  // A terminal often leaves LANG unset or at C, and an app started from the dock has no LANG at all.
  const lang = await $.env.get("LANG").catch(() => undefined);
  const locale = lang && !/^(C|POSIX)\b/.test(lang) ? lang : Intl.DateTimeFormat().resolvedOptions().locale;
  return String(locale ?? "").toLowerCase().startsWith("ko") ? "ko" : "en";
}

// Saves the option as the /config menu would, so it holds in later sessions too. The change reloads the
// module with the new options, and the next session.start picks the language again.
async function setLanguageOption($, value) {
  const rows = await $.config.list();
  const row = rows.find((candidate) => candidate.provider.plugin.split("@")[0] === "ditto" && candidate.key.endsWith(".language"));
  if (!row) return { deny: "language row not found" };
  return $.config.set({ key: row.key, value });
}
