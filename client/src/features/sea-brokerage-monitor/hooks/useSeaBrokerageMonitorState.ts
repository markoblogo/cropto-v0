import { useSyncExternalStore } from "react";
import {
  getSeaBrokerageMonitorState,
  subscribeToSeaBrokerageMonitorState,
} from "../services/seaBrokerageMonitor.service";

export function useSeaBrokerageMonitorState() {
  return useSyncExternalStore(
    subscribeToSeaBrokerageMonitorState,
    getSeaBrokerageMonitorState,
    getSeaBrokerageMonitorState,
  );
}
