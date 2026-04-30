import type { ToolDefinition } from "../../types/tool.js";
import { registry, type ToolRegistry } from "../registry.js";
import { announcementUpdateTool } from "./announcement-update.js";
import { baseWriteTool } from "./base-write.js";
import { cardSendTool } from "./card-send.js";
import { contactSearchTool } from "./contact-search.js";
import { docCreateTool } from "./doc-create.js";
import { entryPinTool } from "./entry-pin.js";
import { entrySendTool } from "./entry-send.js";
import { imSendTool } from "./im-send.js";
import { taskCreateTool } from "./task-create.js";

export const feishuTools: readonly ToolDefinition[] = [
  docCreateTool,
  baseWriteTool,
  taskCreateTool,
  imSendTool,
  entrySendTool,
  entryPinTool,
  cardSendTool,
  announcementUpdateTool,
  contactSearchTool,
];

let globalRegistryLoaded = false;

export function registerFeishuTools(target: ToolRegistry = registry): void {
  if (target === registry && globalRegistryLoaded) return;
  for (const tool of feishuTools) {
    target.register(tool);
  }
  if (target === registry) globalRegistryLoaded = true;
}

registerFeishuTools(registry);
