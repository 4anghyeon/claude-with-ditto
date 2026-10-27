// Claude with Ditto — terminal/Desktop companion.
// Uses only documented mod hooks and UI primitives. The command /ditto <message>
// sends a pair-programming question to the current session, answered in Ditto's voice.

import { FRAME_MS, FRAME_SEQUENCE, SPRITES } from "./sprites.mjs";

const SPRITE_KEY = "ditto-sprite";

// The terminal band the animation repaints; cleared when the band is gone.
const animation = { requestId: undefined, mood: "idle", tick: 0 };

const STATE = { plugin: "ditto", key: "state" };

// A /ditto question reaches the session as "메타몽, <question>"; this system prompt section tells the model
// how to answer those, so the transcript shows the question alone and not the role.
const QUESTION_PREFIX = "메타몽, ";
const PERSONA = {
  id: "ditto:persona",
  scope: "session",
  text: [
    `사용자 메시지가 "${QUESTION_PREFIX.trim()}"으로 시작하면 말랑말랑 페어 프로그래밍 파트너 '메타몽'에게 온 질문이야!`,
    "그때는 동글동글 해맑고 다정한 메타몽이 되어 한국어로 간결하고 편안하게 이야기해 줘.",
    "현재 세션의 코드와 대화 맥락을 함께 살피며, 단순히 정답만 딱 던지기보다는 옆에서 같이 몽글몽글 고민해 주는 느낌으로 답해 줘.",
    "필요할 땐 여러 선택지와 장단점(트레이드오프)을 차근차근 설명해 주고, 아직 확인하지 못한 코드는 '짐작해 본 것'이라고 솔직하게 알려 줘!",
  ].join("\n"),
};

// Theme colours, so each one reads well in both the light and the dark theme.
const MOODS = {
  idle:     { color: "subtle",     label: "대기 중" },
  thinking: { color: "suggestion", label: "생각 중" },
  working:  { color: "warning",    label: "함께 작업 중" },
  error:    { color: "error",      label: "오류 발견" },
  done:     { color: "success",    label: "작업 완료" },
};

// Ditto's own body colour from the sprite, so the message reads as Ditto speaking.
const MESSAGE_COLOR = "#C47BE6";

// Ditto says one of these, picked at random whenever the mood changes.
const MESSAGES = {
  idle: [
    "메타아-! 같이 코딩할 준비 됐어!",
    "오늘은 또 어떤 신나는 걸 만들어 볼까?",
    "언제든 어떤 모양으로든 변신할 준비 완료!",
    "커피 한 잔 마시면서 말랑하게 시작해 볼까?",
    "조용하네... 찌부러져서 졸고 있는 중...",
    "필요하면 메타! 하고 불러 줘!",
    "머릿속에 떠오르는 재미있는 아이디어 있어?",
    "천천히 해도 괜찮아, 느긋하게 가자~",
    "오늘은 잔디밭에 커밋을 몇 개 심어 볼까?",
    "메타~ 여기서 너 기다리고 있었어!",
  ],
  thinking: [
    "음... 어디부터 변신해서 살펴볼까?",
    "말랑말랑한 뇌를 열심히 굴려 보는 중이야.",
    "잠깐만, 생각을 정돈하고 있어!",
    "어라...? 이 부분이 살짝 삐뚤빼뚤 수상한데?",
    "전체적인 모양을 파악하는 중이야.",
    "코드 타고 스르륵... 흐름을 따라가는 중!",
    "두근두근, 결과를 기다리는 중이야!",
    "버그의 흔적을 꼼꼼하게 모아 볼게.",
    "좋은 아이디어가 몽글몽글 떠오를 것 같아!",
    "머리를 꾹꾹 굴리는 중... 메타아!",
  ],
  working: [
    "차근차근 하나씩 해 보자!",
    "말랑한 손을 죽 늘려서 고치는 중이야!",
    "새로운 코드를 착! 붙이는 중!",
    "타닥타닥... 젤리 손으로 코드 치는 중!",
    "거의 다 됐어, 조금만 더 힘내자!",
    "복잡한 것들을 차곡차곡 정리하고 있어.",
    "메타몽 변신! 슈퍼 개발자 모드!",
    "집중, 또 집중! 눈을 동그랗게 뜨고!",
    "요 부분만 살짝 매만지면 완벽해.",
    "손이 너무 바빠서 몸이 흐물거리는 중...",
  ],
  error: [
    "앗! 몸이 찌그러졌어! 뭔가 잘못됐나 봐!",
    "괜찮아 괜찮아, 같이 원인을 찾아보자!",
    "에러 메시지부터 차근차근 읽어 볼까?",
    "다시 동그랗게 변신하면 되니까 걱정 마!",
    "어라라? 생각했던 모양이랑 조금 다르네?",
    "로그를 스윽 훑어볼까?",
    "버그가 풀숲 사이에 꼭꼭 숨었나 봐.",
    "당황하지 말고 말랑한 마음으로 천천히!",
    "메타몽도 너무 놀라서 납작해졌어!",
    "한 단계씩 차근차근 되짚어 보자!"
  ],
  done: [
    "와아! 끝났다! 정말 대단해!",
    "좋았어! 완벽한 결과를 확인해 보자!",
    "동글동글 깔끔하게 마무리 성공!",
    "오늘도 멋진 작품 하나를 해냈다!",
    "메타~ 완전히 완벽해!",
    "정말 수고했어! 잠깐 말랑하게 쉬어가자~",
    "테스트도 신나게 한 바퀴 돌려 볼까?",
    "커밋 버튼 누를 준비 됐어?",
    "반짝반짝 예쁘게 완성!",
    "다음엔 또 어떤 멋진 걸 만들러 갈까?",
  ],
};

const DITTO_ART = [
  "      .--.",
  "   .-'          '-.",
  "  /   •        •   \\",
  " |       ───       |",
  "  \\               /",
  "   '-.__________.-'",
];

export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    await saveState($, { mood: "idle" });
    await $.command.register({
      name: "ditto",
      description: "Ask Ditto a pair-programming question in this session",
    });
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
        return { text: `기분 이름: ${Object.keys(MOODS).join(", ")}` };
      }
      await showMood($, name);
      return { text: `메타몽 표정을 ${MOODS[name].label}(으)로 바꿨어요.` };
    }
    if (word === "demo") {
      await startDemo($);
      return { text: `메타몽이 ${DEMO_MS / 1000}초마다 다섯 표정을 차례로 보여 줘요.` };
    }
    if (!raw || raw === "help") {
      return {
        text: [
          "Claude with Ditto",
          "",
          "사용법: /ditto <질문 또는 고민>",
          "예: /ditto 이 컴포넌트의 상태 관리 구조를 같이 검토해 줘",
          "",
          "표정 테스트: /ditto mood <idle|thinking|working|error|done>, /ditto demo",
          "",
          "질문은 현재 세션에 바로 보내져서 Claude가 이 세션의 코드 맥락을 활용해 메타몽처럼 답합니다.",
          "음성 기능은 추후 VoiceAdapter 확장 지점으로 분리되어 있습니다.",
        ].join("\n"),
      };
    }

    // Sends the question to this session as a turn of its own, so the answer keeps the conversation's context.
    // A command.run hook holds the turn it answers, so the question goes out just after the command ends.
    // It reads as the person's own words, and the PERSONA section tells the model to answer as Ditto.
    $.clock.after(1, () => void $.prompt.submit({ text: QUESTION_PREFIX + raw, asUser: true }));
    return { text: "메타몽에게 질문을 보냈어요." };
  });

  on("prompt.compose", async ($, e, next) => {
    const { sections } = await next(e);
    return { sections: [...sections, PERSONA] };
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
    const state = value ?? { mood: "idle", lastMessage: MESSAGES.idle[0] };
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
        ? [elements.Svg({ alt: sprite.alt, ...sprite.svg })]
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
            Text({ color: mood.color, bold: true, children: mood.label }),
            state.announcement
              ? Text({ color: ANNOUNCEMENT_COLOR, bold: true, children: state.announcement })
              : Text({ color: MESSAGE_COLOR, children: String(state.lastMessage ?? MESSAGES.idle[0]) }),
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
    return { value: "아직 없음" };
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
  const choices = MESSAGES[mood].filter((message) => message !== current);
  return choices[Math.floor(Math.random() * choices.length)];
}

// A skill run is announced in the message's place for a while, the way a Pokémon battle names a move,
// in the theme's accent colour so it stands apart from Ditto's usual lines.
const ANNOUNCEMENT_MS = 10000;
const ANNOUNCEMENT_COLOR = "claude";
let announcementTimer;

// 을 after a final consonant, 를 after a vowel. Hangul tells by its last syllable and a digit by how it
// is read; a Latin name cannot be told reliably, so it gets both.
function objectParticle(name) {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을";
  if (/[0-9]/.test(last)) return "013678".includes(last) ? "을" : "를";
  return "을(를)";
}

async function announceSkill($, skill) {
  // A plugin skill is named "plugin:skill"; the skill's own name is enough here.
  const name = skill.split(":").pop();
  announcementTimer?.cancel();
  await saveState($, { announcement: `메타몽은 ${name}${objectParticle(name)} 사용했다!` });
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
