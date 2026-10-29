// Puts Ditto together from its pixels in sprites.mjs: the mood's body turned the way Ditto faces, its eyes
// moved where it looks, its breath, then each frame's hop, blink and glyphs. The terminal gets half-block
// cells for one frame at a time; Desktop gets an SVG that animates by itself.

import { COLOURS, IDLE_ACTIONS, MOODS, PALETTE, TIMING, TOOLS, ZED_GLYPH } from "./sprites.mjs";

export const FRAME_MS = TIMING.frameMs;

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const OUTLINES = new Set(COLOURS.outlines);
const GAZES = { center: [0, 0], left: [0, -1], right: [0, 1], up: [-1, 0] };
const key = (r, c) => `${r},${c}`;

const drawn = new Map();

// Ditto as the state shows it: the change from one mood to the next while it plays, else an idle action
// when one plays, else the mood. Each one is drawn once.
export function drawSprite({ mood, action, transition, prop, facing = "left", gaze = "center" }) {
  const to = MOODS[mood] ? mood : "idle";
  if (MOODS[transition]) {
    return remember(`transition ${transition} ${to} ${facing} ${gaze}`, () =>
      drawTransition(MOODS[transition], MOODS[to], facing, gaze));
  }
  if (mood === "idle" && IDLE_ACTIONS[action]) {
    return remember(`action ${action} ${facing}`, () => drawAction(IDLE_ACTIONS[action], facing));
  }
  const held = TOOLS[prop] ? prop : undefined;
  return remember(`mood ${to} ${facing} ${gaze} ${held}`, () => drawMood(MOODS[to], facing, gaze, TOOLS[held]));
}

function remember(id, draw) {
  if (!drawn.has(id)) drawn.set(id, draw());
  return drawn.get(id);
}

// The cells the terminal shows on this tick of the animation.
export function terminalFrame(sprite, tick) {
  return { columns: sprite.columns, rows: sprite.rows, cells: sprite.cellsAt(tick) };
}

function readGrid(rows) {
  const cells = new Map();
  rows.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      if (line[c] !== ".") cells.set(key(r, c), DIGITS.indexOf(line[c]));
    }
  });
  return cells;
}

function mirror(cells, width) {
  const out = new Map();
  for (const [cell, colour] of cells) {
    const [r, c] = cell.split(",").map(Number);
    out.set(key(r, width - 1 - c), colour);
  }
  return out;
}

function stamp(cells, row, column, pattern, colour) {
  pattern.forEach((line, dr) => {
    for (let dc = 0; dc < line.length; dc++) {
      if (line[dc] === "#") cells.set(key(row + dr, column + dc), colour);
    }
  });
}

// The mood's parts as Ditto faces and looks: the sprites face left, and facing right mirrors everything
// but the glyphs' own shapes. The eyes move one pixel the way Ditto looks where the body has room for it.
function poseMood(layer, facing, gaze, held) {
  const { width } = layer;
  let body = readGrid(layer.body);
  let props = readGrid(layer.props);
  let eyes = layer.eyes.map(([r, c]) => [r, c]);
  let glyphs = layer.glyphs;
  if (held) {
    // A tool's prop takes the place of what the mood shows there: the laptop in front, the glyphs above.
    if (held.place === "front") props = new Map();
    else glyphs = [];
    for (const [cell, colour] of readGrid(held.pattern)) {
      const [r, c] = cell.split(",").map(Number);
      props.set(key(r + held.at.row, c + held.at.column), colour);
    }
  }
  if (facing === "right") {
    body = mirror(body, width);
    props = mirror(props, width);
    eyes = eyes.map(([r, c]) => [r, width - 1 - c]);
    glyphs = glyphs.map((glyph) => ({ ...glyph, column: width - glyph.pattern[0].length - glyph.column }));
  }
  const extras = new Map();
  for (const glyph of glyphs) stamp(extras, glyph.row, glyph.column, glyph.pattern, glyph.colour);
  const [dr, dc] = GAZES[gaze] ?? GAZES.center;
  const looked = eyes.map(([r, c]) => [r + dr, c + dc]);
  const eyeKeys = new Set(eyes.map(([r, c]) => key(r, c)));
  const moved = looked.filter(([r, c]) => !eyeKeys.has(key(r, c)));
  if (moved.length > 0 && moved.every(([r, c]) => body.has(key(r, c)) && !OUTLINES.has(body.get(key(r, c))))) {
    for (const [r, c] of eyes) body.set(key(r, c), COLOURS.body);
    for (const [r, c] of looked) body.set(key(r, c), COLOURS.black);
    eyes = looked;
  }
  return { body, props, extras, eyes: new Set(eyes.map(([r, c]) => key(r, c))), stretchRow: layer.stretchRow };
}

// One breath every ten seconds: the upper body rises a pixel, holds for half a second and settles. It rises
// between hops, on ground beats of the bounce, since a hop and a breath at once lift the tip of the head out
// of the canvas. Ten seconds is a whole number of bounces, so the two never drift into each other.
const BREATH_TICKS = 10000 / FRAME_MS;
const RISE_FROM = 5;
const RISE_UNTIL = 9;
const BREATH = Array.from({ length: BREATH_TICKS }, (_, i) => (i >= RISE_FROM && i < RISE_UNTIL ? 1 : 0));

// The body and eyes partway through a breath. Rising repeats the last row above the shadow along the
// bottom, so everything above it, eyes and arms too, lifts while the shadow and the bottom stay as they are.
function breathe(parts, rise) {
  if (!rise) return parts;
  const middle = parts.stretchRow;
  const lift = (cell) => {
    const [r, c] = cell.split(",").map(Number);
    return key(r <= middle ? r - 1 : r, c);
  };
  const body = new Map();
  for (const [cell, colour] of parts.body) {
    if (Number(cell.split(",")[0]) === middle) body.set(cell, colour);
    body.set(lift(cell), colour);
  }
  return { ...parts, body, eyes: new Set([...parts.eyes].map(lift)) };
}

// The frame for one tick: up off the ground on the hop, eyes shut on the blink, glyphs on their beat.
function frameKey(tick, bounces) {
  const i = tick % TIMING.cycle;
  return {
    lifted: bounces && TIMING.bounce[i % TIMING.bounce.length] === 1,
    blinking: i === TIMING.blinkFrame,
    extrasOn: i % TIMING.extrasPeriod < TIMING.extrasOn,
  };
}

function composeMood(parts, width, height, { lifted, blinking, extrasOn }) {
  const grid = Array.from({ length: height }, () => new Array(width).fill(-1));
  const put = (r, c, colour) => {
    if (r >= 0 && r < height && c >= 0 && c < width) grid[r][c] = colour;
  };
  const shift = lifted ? TIMING.lift : 0;
  for (const [cell, colour] of parts.body) {
    const [r, c] = cell.split(",").map(Number);
    put(r - shift, c, blinking && parts.eyes.has(cell) ? COLOURS.body : colour);
  }
  for (const [cell, colour] of parts.props) {
    const [r, c] = cell.split(",").map(Number);
    put(r, c, colour);
  }
  if (extrasOn) {
    for (const [cell, colour] of parts.extras) {
      const [r, c] = cell.split(",").map(Number);
      put(r, c, colour);
    }
  }
  return grid;
}

// `tool` is the prop of the tool Ditto is using, if any.
function drawMood(mood, facing, gaze, tool) {
  const holding = (surface) => tool && { place: tool.place, pattern: tool.pattern, at: tool[surface] };
  const terminal = poseMood(mood.terminal, facing, gaze, holding("terminal"));
  const breaths = [breathe(terminal, 0), breathe(terminal, 1)];
  const { width, height } = mood.terminal;
  const frames = new Map();
  return {
    columns: width,
    rows: Math.ceil(height / 2),
    cellsAt(tick) {
      const frame = frameKey(tick, mood.bounces);
      const rise = BREATH[tick % BREATH.length];
      const id = `${frame.lifted} ${frame.blinking} ${frame.extrasOn} ${rise}`;
      if (!frames.has(id)) frames.set(id, encodeCells(composeMood(breaths[rise], width, height, frame)));
      return frames.get(id);
    },
    svg: moodSvg(mood, poseMood(mood.desktop, facing, gaze, holding("desktop"))),
  };
}

// A change of mood: the old Ditto shuts its eyes and melts down row by row, spreading out to the sides as it
// flattens, then the new one wells back up, springs a pixel past its height a little slimmer and settles.
// Props and glyphs stay away until it has settled.
const TRANSITION = [
  { from: true, squash: 2, spread: 1 },
  { from: true, squash: 4, spread: 2, shut: true },
  { from: true, squash: 6, spread: 3, shut: true },
  { squash: 6, spread: 3, shut: true },
  { squash: 3, spread: 2, shut: true },
  { squash: 1, spread: 1 },
  { rise: 1, spread: -1 },
];
export const TRANSITION_MS = TRANSITION.length * FRAME_MS;

// The body and eyes with rows taken out just above the shadow, the rows over them sinking into the gap.
function squash(parts, rows) {
  let { body, eyes } = parts;
  for (let i = 0; i < rows; i++) {
    const sink = (cell) => {
      const [r, c] = cell.split(",").map(Number);
      return key(r < parts.stretchRow ? r + 1 : r, c);
    };
    const kept = [...body].filter(([cell]) => Number(cell.split(",")[0]) !== parts.stretchRow);
    body = new Map(kept.map(([cell, colour]) => [sink(cell), colour]));
    eyes = new Set([...eyes].map(sink));
  }
  return { ...parts, body, eyes };
}

// The body and eyes made wider (or slimmer, for a negative count) by that many columns: its middle column
// is drawn again, or taken out, with the sides moving apart or together around it. A wider body grows
// toward whichever side has more room in the canvas, so a Ditto facing either way stays inside it.
function spread(parts, columns, width) {
  if (!columns) return parts;
  const all = [...parts.body.keys()].map((cell) => Number(cell.split(",")[1]));
  const lowest = Math.min(...all);
  const highest = Math.max(...all);
  const middle = Math.round((lowest + highest) / 2);
  const roomier = lowest > width - 1 - highest ? "left" : "right";
  const half = Math.trunc(columns / 2);
  const left = roomier === "left" ? columns - half : half;
  const right = columns - left;
  const move = (r, c) => key(r, c < middle ? c - left : c > middle ? c + right : c);
  const body = new Map();
  for (const [cell, colour] of parts.body) {
    const [r, c] = cell.split(",").map(Number);
    if (c === middle && columns < 0) continue;
    if (c === middle) for (let dc = -left; dc <= right; dc++) body.set(key(r, c + dc), colour);
    else body.set(move(r, c), colour);
  }
  const eyes = new Set([...parts.eyes].map((cell) => move(...cell.split(",").map(Number))));
  return { ...parts, body, eyes };
}

function transitionGrids(from, to, layer, facing, gaze) {
  const posed = { from: poseMood(from[layer], facing, gaze), to: poseMood(to[layer], facing, gaze) };
  const { width, height } = to[layer];
  return TRANSITION.map((step) => {
    const parts = posed[step.from ? "from" : "to"];
    const shaped = spread(step.rise ? breathe(parts, 1) : squash(parts, step.squash), step.spread, width);
    return composeMood({ ...shaped, props: new Map() }, width, height, { lifted: false, blinking: !!step.shut, extrasOn: false });
  });
}

function drawTransition(from, to, facing, gaze) {
  const { width, height } = to.terminal;
  const cells = transitionGrids(from, to, "terminal", facing, gaze).map(encodeCells);
  const sequence = TRANSITION.map((_, i) => i);
  return {
    columns: width,
    rows: Math.ceil(height / 2),
    cellsAt: (tick) => cells[Math.min(tick, cells.length - 1)],
    svg: framesSvg(to.desktop.width, to.desktop.height, transitionGrids(from, to, "desktop", facing, gaze), sequence, to.label, { once: true }),
  };
}

// An idle action's frame: its body, mirrored when Ditto faces right, and the Z of a sleeping Ditto, which
// moves to the other side but keeps its shape.
function composeAction(frame, width, height, facing) {
  let body = readGrid(frame.body);
  if (facing === "right") body = mirror(body, width);
  if (frame.zed) {
    const [row, column] = frame.zed;
    stamp(body, row, facing === "right" ? width - ZED_GLYPH[0].length - column : column, ZED_GLYPH, COLOURS.zed);
  }
  const grid = Array.from({ length: height }, () => new Array(width).fill(-1));
  for (const [cell, colour] of body) {
    const [r, c] = cell.split(",").map(Number);
    if (r >= 0 && r < height && c >= 0 && c < width) grid[r][c] = colour;
  }
  return grid;
}

function drawAction(action, facing) {
  const { width, height, frames } = action.terminal;
  const cells = frames.map((frame) => encodeCells(composeAction(frame, width, height, facing)));
  const desktop = action.desktop;
  const grids = desktop.frames.map((frame) => composeAction(frame, desktop.width, desktop.height, facing));
  return {
    columns: width,
    rows: Math.ceil(height / 2),
    cellsAt: (tick) => cells[action.sequence[tick % action.sequence.length]],
    svg: framesSvg(desktop.width, desktop.height, grids, action.sequence, MOODS.idle.label),
  };
}

// Half-block cells, two pixels a cell, as the terminal's Raster takes them: per cell the character, its
// foreground and its background, each a little-endian 32-bit word, all of it in base64.
const DEFAULT = 0x01000000;
const RGB = PALETTE.map((hex) => parseInt(hex.slice(1), 16));

function encodeCells(grid) {
  const rows = grid.length % 2 ? [new Array(grid[0].length).fill(-1), ...grid] : grid;
  const words = [];
  for (let r = 0; r < rows.length; r += 2) {
    for (let c = 0; c < rows[r].length; c++) {
      const top = rows[r][c];
      const bottom = rows[r + 1][c];
      if (top < 0 && bottom < 0) words.push(0x20, DEFAULT, DEFAULT);
      else if (top < 0) words.push(0x2584, RGB[bottom], DEFAULT);
      else words.push(0x2580, RGB[top], bottom < 0 ? DEFAULT : RGB[bottom]);
    }
  }
  const bytes = new Uint8Array(words.length * 4);
  words.forEach((word, i) => {
    bytes[i * 4] = word & 255;
    bytes[i * 4 + 1] = (word >>> 8) & 255;
    bytes[i * 4 + 2] = (word >>> 16) & 255;
    bytes[i * 4 + 3] = (word >>> 24) & 255;
  });
  return base64(bytes);
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64[n & 63] : "=";
  }
  return out;
}

// Runs of one colour along each row, one rect a run, top to bottom.
function rects(cells) {
  const rows = new Map();
  for (const [cell, colour] of cells) {
    const [r, c] = cell.split(",").map(Number);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push([c, colour]);
  }
  let out = "";
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(r).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < row.length; ) {
      const [c, colour] = row[i];
      let run = 1;
      while (i + run < row.length && row[i + run][0] === c + run && row[i + run][1] === colour) run += 1;
      out += `<rect x="${c}" y="${r}" width="${run}" height="1" fill="${PALETTE[colour]}"/>`;
      i += run;
    }
  }
  return out;
}

// Seconds the way the SVGs have always written them: 3.0, 0.75.
function seconds(ms) {
  const value = ms / 1000;
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function svgOpen(width, height, label) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * TIMING.scale}" ` +
    `height="${height * TIMING.scale}" shape-rendering="crispEdges" role="img" aria-label="${label}">`
  );
}

function svgElement(source, width, height) {
  return { source, width: width * TIMING.scale, height: height * TIMING.scale, isInteractive: true };
}

// A mood's SVG animates by itself: the body breathes between its resting and risen frames and hops, the
// lids close on the blink and the glyphs twinkle. Every animation runs on the same clock, so each breath
// frame carries its own lids and blinks with the rest.
function moodSvg(mood, parts) {
  const { width, height } = mood.desktop;
  const { bounce, cycle, blinkFrame, extrasOn, extrasPeriod, frameMs, lift } = TIMING;
  const up = bounce.indexOf(1) / bounce.length;
  const down = (bounce.lastIndexOf(1) + 1) / bounce.length;
  const times = `0;${(RISE_FROM / BREATH_TICKS).toFixed(4)};${(RISE_UNTIL / BREATH_TICKS).toFixed(4)}`;
  const blink =
    `<animate attributeName="opacity" values="0;1;0" keyTimes="0;${(blinkFrame / cycle).toFixed(4)};${((blinkFrame + 1) / cycle).toFixed(4)}" ` +
    `dur="${seconds(cycle * frameMs)}s" calcMode="discrete" repeatCount="indefinite"/>`;
  const breaths = [0, 1].map((rise) => {
    const breath = breathe(parts, rise);
    const lids = new Map([...breath.eyes].map((cell) => [cell, COLOURS.body]));
    const values = rise ? "hidden;visible;hidden" : "visible;hidden;visible";
    return (
      `<g visibility="hidden">${rects(breath.body)}<g opacity="0">${rects(lids)}${blink}</g>` +
      `<animate attributeName="visibility" values="${values}" keyTimes="${times}" dur="${seconds(BREATH.length * frameMs)}s" ` +
      `calcMode="discrete" repeatCount="indefinite"/></g>`
    );
  });
  const hop = mood.bounces
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${lift};0 0" ` +
      `keyTimes="0;${up.toFixed(4)};${down.toFixed(4)}" dur="${seconds(bounce.length * frameMs)}s" calcMode="discrete" repeatCount="indefinite"/>`
    : "";
  const source =
    svgOpen(width, height, mood.label) +
    `<g>${breaths.join("")}${hop}</g>` +
    rects(parts.props) +
    `<g>${rects(parts.extras)}` +
    `<animate attributeName="opacity" values="1;0" keyTimes="0;${(extrasOn / extrasPeriod).toFixed(4)}" ` +
    `dur="${seconds(extrasPeriod * frameMs)}s" calcMode="discrete" repeatCount="indefinite"/></g>` +
    `</svg>`;
  return svgElement(source, width, height);
}

// An SVG that shows each distinct frame in turn, in the order the sequence gives: over and over, or once
// and then holding its last frame.
function framesSvg(width, height, grids, sequence, label, { once = false } = {}) {
  const duration = seconds(sequence.length * TIMING.frameMs);
  const times = sequence.map((_, i) => (i / sequence.length).toFixed(4)).join(";");
  const groups = grids.map((grid, k) => {
    const cells = new Map();
    grid.forEach((line, r) => line.forEach((colour, c) => colour >= 0 && cells.set(key(r, c), colour)));
    const values = sequence.map((index) => (index === k ? "visible" : "hidden")).join(";");
    return (
      `<g visibility="hidden">${rects(cells)}` +
      `<animate attributeName="visibility" values="${values}" keyTimes="${times}" dur="${duration}s" ` +
      `calcMode="discrete" ${once ? 'repeatCount="1" fill="freeze"' : 'repeatCount="indefinite"'}/></g>`
    );
  });
  return svgElement(svgOpen(width, height, label) + groups.join("") + "</svg>", width, height);
}
