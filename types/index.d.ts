export type DittoMood = "idle" | "thinking" | "working" | "error" | "done";
export type DittoState = {
  mood: DittoMood;
  lastMessage: string;
  lastTool?: string;
};

declare module "claude-code" {
  interface PluginState {
    "ditto": {
      state: DittoState;
    };
  }
}
