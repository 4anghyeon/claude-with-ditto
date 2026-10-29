// Claude with Ditto — terminal/Desktop companion.
// Uses only documented mod hooks and UI primitives. The command /ditto <message>
// sends a pair-programming question to the current session, answered in Ditto's voice.

import { LOCALES } from "./locales.mjs";
import { FRAME_MS, FRAME_SEQUENCE, SPRITES } from "./sprites.mjs";

const SPRITE_KEY = "ditto-sprite";

// The terminal band the animation repaints; cleared when the band is gone.
const animation = { requestId: undefined, mood: "idle", tick: 0 };

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
    return result;
  });

  on("turn.start", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId) {
      await saveState($, { mood: "thinking" });
    }
    return result;
  });

  on("tool.call", async ($, e, next) => {
    const tool = String(e.tool ?? "");
    const result = await next(e);

    // Observe tools only; never block or rewrite them.
    if (tool === "Bash") {
      const command = String(e.command ?? "");
      const mood = /test|lint|typecheck|build|check/i.test(command) ? "thinking" : "working";
      await saveState($, { mood, lastTool: tool });
    } else if (["Read", "Glob", "Grep"].includes(tool)) {
      await saveState($, { mood: "thinking", lastTool: tool });
    } else if (["Edit", "Write", "NotebookEdit"].includes(tool)) {
      await saveState($, { mood: "working", lastTool: tool });
    }
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId) {
      const answer = String(e.answer ?? "");
      const mood = /(error|failed|exception|실패|오류)/i.test(answer) ? "error" : "done";
      await saveState($, { mood });
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
    const sprite = SPRITES[state.mood] ?? SPRITES.idle;
    if (e.surface === "terminal") {
      animation.requestId = e.requestId;
      animation.mood = state.mood;
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

// Test commands: pin one mood, or walk through every mood once.
const DEMO_MS = 3000;
let demoTimer;

async function showMood($, name) {
  demoTimer?.cancel();
  demoTimer = undefined;
  await saveState($, { mood: name }, { refresh: true });
}

async function startDemo($) {
  const names = Object.keys(MOODS);
  await showMood($, names[0]);
  const step = (i) => {
    demoTimer = $.clock.after(DEMO_MS, () => {
      if (i < names.length) {
        void saveState($, { mood: names[i] });
        step(i + 1);
      } else {
        void saveState($, { mood: "idle" });
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

function terminalFrame(sprite, tick) {
  const { columns, rows, frames } = sprite.terminal;
  return { columns, rows, cells: frames[FRAME_SEQUENCE[tick % FRAME_SEQUENCE.length]] };
}

// Repaints only the sprite's cells each frame, without redrawing the band.
function startAnimation($) {
  $.clock.every(FRAME_MS, () => void stepAnimation($));
}

async function stepAnimation($) {
  if (animation.requestId === undefined) return;
  animation.tick += 1;
  const sprite = SPRITES[animation.mood] ?? SPRITES.idle;
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

// How long one message stays before Ditto says another one for the same mood.
const MESSAGE_MS = 5000;
let messageTimer;

// A new message only when the mood changes (or `refresh`), so a run of tool calls does not flicker it.
// Each new message schedules the next one, so the line keeps changing while the mood stays.
async function saveState($, patch, { refresh = false } = {}) {
  const { value: previous } = await $.state.get(STATE);
  const mood = patch.mood ?? previous?.mood ?? "idle";
  const keep = !refresh && previous?.mood === mood && previous?.lastMessage;
  await $.state.set(STATE, {
    ...(previous ?? {}),
    ...patch,
    mood,
    lastMessage: keep ? previous.lastMessage : randomMessage(mood, previous?.lastMessage),
  });
  if (!keep) {
    messageTimer?.cancel();
    messageTimer = $.clock.after(MESSAGE_MS, () => void saveState($, {}, { refresh: true }));
  }
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
