export type DittoMood = "idle" | "thinking" | "working" | "error" | "done";
export type DittoState = {
  mood: DittoMood;
  lastMessage: string;
  lastTool?: string;
  /** The way Ditto faces; the sprites are drawn facing left. */
  facing?: "left" | "right";
  /** Where Ditto's eyes look. */
  gaze?: "center" | "left" | "right" | "up";
  /** The idle action Ditto is playing, by its name in IDLE_ACTIONS. */
  action?: string;
  /** What Ditto says in the message's place for a few seconds after a skill runs. */
  announcement?: string;
};

declare module "claude-code" {
  interface PluginState {
    "ditto": {
      state: DittoState;
    };
  }
}
