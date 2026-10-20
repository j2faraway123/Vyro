import type { ShieldState } from "./types";

/** Shield state shown in the browser preview, where filtering is unavailable. */
export const DEFAULT_SHIELD_PREVIEW: ShieldState = {
  config: {
    enabled: false,
    trackerProtection: true,
    cosmeticFiltering: true,
    blockPopups: true,
    lists: [
      { id: "easylist", name: "EasyList", url: "https://easylist.to/easylist/easylist.txt", homepage: "https://easylist.to/", license: "GPLv3 or CC BY-SA 3.0", category: "ads", enabled: true, builtin: true },
      { id: "easyprivacy", name: "EasyPrivacy", url: "https://easylist.to/easylist/easyprivacy.txt", homepage: "https://easylist.to/", license: "GPLv3 or CC BY-SA 3.0", category: "privacy", enabled: true, builtin: true },
    ],
    allowlist: [],
    customRules: "",
  },
  statuses: {},
  engine: { ready: false, building: false, networkRules: 0, cosmeticRules: 0, error: null, builtAt: null, revision: 0 },
  windows: [],
  totalBlocked: 0,
  platform: {
    networkBlocking: false,
    blockCounts: false,
    cosmeticFiltering: false,
    note: "Vyro Shield runs in the desktop app. The browser preview cannot filter requests.",
  },
};
