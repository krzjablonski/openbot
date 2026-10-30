import { DEFAULT_GLOBAL_INSTRUCTIONS, type GlobalInstructions, isGlobalInstructions } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { createOpenBotLogger } from "@openbot/logging";
import { PreferenceStore } from "./preference-file";

const logger = createOpenBotLogger("global-instructions");

/**
 * The text that this app's agents get in their instructions. A missing file reads as empty. A wrong
 * version, a value that is not a string and a saved text over the limit, from a hand edit, also read
 * as empty, with `storedFileInvalid`, so the settings show that the saved file was not valid.
 * The text is private: no log line includes it.
 */
export type GlobalInstructionsPreferenceStore = PreferenceStore<GlobalInstructions>;

const INVALID: GlobalInstructions = { text: "", storedFileInvalid: true };

export function createGlobalInstructionsPreferenceStore(path: string): GlobalInstructionsPreferenceStore {
  return new PreferenceStore({
    path,
    defaultValue: DEFAULT_GLOBAL_INSTRUCTIONS,
    decode: (parsed) => {
      if (!isDynamicRecord(parsed) || parsed.version !== 1 || typeof parsed.text !== "string") return INVALID;
      if (!isGlobalInstructions({ text: parsed.text })) {
        logger.warn("The saved global instructions are over the limit and are ignored.");
        return INVALID;
      }
      return { text: parsed.text };
    },
  });
}
