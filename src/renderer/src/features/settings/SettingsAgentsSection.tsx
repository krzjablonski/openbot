import { type ClientAgentSummary, LOCAL_SERVER_ID, type UpdateAgentInput } from "@openbot/contracts/ipc";
import type { GeneralSettingsValue } from "@openbot/ui/features/settings/app-settings";
import {
  type AgentDefaultChoice,
  type AgentDefaultSetting,
  type AgentDefaultsAgent,
  agentDefaultSettingTitle,
  SettingsAgentsTab,
} from "@openbot/ui/features/settings/SettingsAgentsTab";
import { currentText, useText } from "@openbot/ui/text";
import type { JSX } from "@solidjs/web";
import { createEffect, createStore } from "solid-js";
import { actionToast } from "../../action-toast";
import { settingsPort } from "./settings-port";

interface AgentsSectionState {
  agents: AgentDefaultsAgent[];
  loadFailed: boolean;
  setting: AgentDefaultSetting | null;
  /** The editor text of the global instructions, and the text that is saved. */
  globalInstructions: string;
  savedGlobalInstructions: string;
  /** True after a read of the saved text worked. Until then the editor is off. */
  globalInstructionsLoaded: boolean;
  /** True when the last read of the saved text failed. */
  globalInstructionsLoadFailed: boolean;
  /** True when the last read found a saved file that was not valid. A save replaces the file. */
  globalInstructionsStoredInvalid: boolean;
  globalInstructionsSaving: boolean;
}

export interface SettingsAgentsSection {
  Panel: (props: { menuMount: HTMLElement | undefined }) => JSX.Element;
  /** The setting page, for the dialog header `Agents › Local scripts`. */
  crumb: () => { title: string; back: () => void } | null;
  /** Closes the setting page, so that a requested tab, such as a search result, opens on the list. */
  showList: () => void;
}

function updateFor(agentId: string, setting: AgentDefaultSetting, choice: AgentDefaultChoice): UpdateAgentInput {
  if (setting === "busyMessageMode") {
    return { agentId, busyMessageMode: choice === "default" ? null : choice === "on" ? "steer" : "queue" };
  }
  return { agentId, [setting]: choice === "default" ? null : choice === "on" };
}

function showAgentSaveFailure(error: unknown): void {
  const { t, errorMessage } = currentText();
  actionToast.error(errorMessage(error, t("agent.error.settingsFailed")), {
    id: "settings-agent-defaults-save-failed",
    report: { operation: "settings", source: "action", cause_code: "unknown" },
  });
}

function showGlobalInstructionsSaveFailure(error: unknown): void {
  const { t, errorMessage } = currentText();
  actionToast.error(errorMessage(error, t("settings.globalInstructions.saveFailed")), {
    id: "settings-global-instructions-save-failed",
    report: { operation: "settings", source: "action", cause_code: "unknown" },
  });
}

/**
 * Settings › Agents: the defaults of the agents on this computer, and each agent's own value. The
 * tab reads the local agents each time it shows, whichever server is open.
 */
export function createSettingsAgentsSection(options: {
  visible: () => boolean;
  value: () => GeneralSettingsValue;
  onValueChange: (value: GeneralSettingsValue) => void;
}): SettingsAgentsSection {
  const { t } = useText();
  const [state, setState] = createStore<AgentsSectionState>({
    agents: [],
    loadFailed: false,
    setting: null,
    globalInstructions: "",
    savedGlobalInstructions: "",
    globalInstructionsLoaded: false,
    globalInstructionsLoadFailed: false,
    globalInstructionsStoredInvalid: false,
    globalInstructionsSaving: false,
  });
  /** Bumped for each read, so an answer of an earlier read is dropped. */
  let generation = 0;
  /** Bumped for each read and each save of the global instructions, so a read that started before them is dropped. */
  let globalInstructionsGeneration = 0;

  function applyAgent(agent: ClientAgentSummary): void {
    setState((draft) => {
      const index = draft.agents.findIndex((item) => item.id === agent.id);
      if (index !== -1) draft.agents[index] = agent;
    });
  }

  function load(): void {
    const current = ++generation;
    settingsPort()
      .agent.listAgents(LOCAL_SERVER_ID)
      .then((agents) => {
        if (current !== generation) return;
        setState((draft) => {
          draft.agents = agents;
          draft.loadFailed = false;
        });
      })
      .catch(() => {
        if (current !== generation) return;
        setState((draft) => {
          draft.loadFailed = true;
        });
      });
  }

  /** Reads the saved text, and keeps an edit that the user has begun. */
  function loadGlobalInstructions(): void {
    const current = ++globalInstructionsGeneration;
    // The alert shows the result of the latest read only.
    setState((draft) => {
      draft.globalInstructionsLoadFailed = false;
    });
    settingsPort()
      .getGlobalInstructions()
      .then(({ text, storedFileInvalid }) => {
        if (current !== globalInstructionsGeneration) return;
        setState((draft) => {
          if (draft.globalInstructions === draft.savedGlobalInstructions) draft.globalInstructions = text;
          draft.savedGlobalInstructions = text;
          draft.globalInstructionsLoaded = true;
          draft.globalInstructionsLoadFailed = false;
          draft.globalInstructionsStoredInvalid = storedFileInvalid === true;
        });
      })
      .catch(() => {
        if (current !== globalInstructionsGeneration) return;
        // Before the first read that works, the editor and Save stay off, so no save can replace the
        // stored text. After one, the editor keeps its text.
        setState((draft) => {
          draft.globalInstructionsLoadFailed = true;
        });
      });
  }

  function saveGlobalInstructions(): void {
    if (state.globalInstructionsSaving) return;
    const text = state.globalInstructions;
    globalInstructionsGeneration += 1;
    setState((draft) => {
      draft.globalInstructionsSaving = true;
    });
    settingsPort()
      .setGlobalInstructions({ text })
      .then((saved) => {
        setState((draft) => {
          draft.savedGlobalInstructions = saved.text;
          if (draft.globalInstructions === text) draft.globalInstructions = saved.text;
          draft.globalInstructionsLoadFailed = false;
          draft.globalInstructionsStoredInvalid = false;
          draft.globalInstructionsSaving = false;
        });
        actionToast.success(t("settings.globalInstructions.saved"), { id: "settings-global-instructions-saved" });
      })
      .catch((error: unknown) => {
        setState((draft) => {
          draft.globalInstructionsSaving = false;
        });
        showGlobalInstructionsSaveFailure(error);
      });
  }

  function showList(): void {
    setState((draft) => {
      draft.setting = null;
    });
  }

  createEffect(options.visible, (visible) => {
    if (visible) {
      load();
      loadGlobalInstructions();
    } else showList();
  });

  function changeDefault(setting: AgentDefaultSetting, on: boolean): void {
    const value = options.value();
    if (setting === "busyMessageMode") {
      options.onValueChange({ ...value, busyMessageMode: on ? "steer" : "queue" });
      return;
    }
    options.onValueChange({ ...value, agentDefaults: { ...value.agentDefaults, [setting]: on } });
  }

  function changeChoice(agentIds: readonly string[], setting: AgentDefaultSetting, choice: AgentDefaultChoice): void {
    for (const agentId of agentIds) {
      settingsPort()
        .agent.updateAgent(updateFor(agentId, setting, choice), LOCAL_SERVER_ID)
        .then(applyAgent)
        .catch((error: unknown) => {
          showAgentSaveFailure(error);
          load();
        });
    }
  }

  return {
    Panel: (props) => (
      <SettingsAgentsTab
        agents={state.agents}
        loadFailed={state.loadFailed}
        defaults={options.value().agentDefaults}
        steer={options.value().busyMessageMode === "steer"}
        setting={state.setting}
        globalInstructions={state.globalInstructions}
        savedGlobalInstructions={state.savedGlobalInstructions}
        globalInstructionsLoaded={state.globalInstructionsLoaded}
        globalInstructionsLoadFailed={state.globalInstructionsLoadFailed}
        globalInstructionsStoredInvalid={state.globalInstructionsStoredInvalid}
        globalInstructionsSaving={state.globalInstructionsSaving}
        onGlobalInstructionsChange={(text) =>
          setState((draft) => {
            draft.globalInstructions = text;
          })
        }
        onGlobalInstructionsSave={saveGlobalInstructions}
        menuMount={props.menuMount}
        onOpen={(setting) =>
          setState((draft) => {
            draft.setting = setting;
          })
        }
        onDefaultChange={changeDefault}
        onChoiceChange={changeChoice}
      />
    ),
    crumb() {
      const setting = state.setting;
      if (!setting) return null;
      return { title: t(agentDefaultSettingTitle(setting)), back: showList };
    },
    showList,
  };
}
