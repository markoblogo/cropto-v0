import type { BrokerageEntry, MatchSuggestion } from "../types";
import { createSeaBrokerageMonitorDemoEntries } from "./seedEntries";

export interface SeaBrokerageMonitorSectionState {
  standardizedFeed: BrokerageEntry[];
  matchSuggestions: MatchSuggestion[];
}

export const seaBrokerageMonitorMockState: SeaBrokerageMonitorSectionState = {
  standardizedFeed: createSeaBrokerageMonitorDemoEntries(),
  matchSuggestions: [],
};
