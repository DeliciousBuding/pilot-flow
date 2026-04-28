import assert from "node:assert/strict";
import { loadRuntimeConfig } from "./runtime-config.js";

const config = loadRuntimeConfig(["--owner-open-id-map-json", '{"Product Owner":"ou_product"}', "--task-assignee-open-id", "ou_default"], {});

assert.deepEqual(config.taskAssignee.ownerOpenIdMap, {
  "Product Owner": "ou_product"
});
assert.equal(config.taskAssignee.defaultOpenId, "ou_default");

assert.deepEqual(
  loadRuntimeConfig([], {
    PILOTFLOW_OWNER_OPEN_ID_MAP_JSON: '{"Agent Engineer":"ou_agent"}',
    PILOTFLOW_TASK_ASSIGNEE_OPEN_ID: "ou_default_env"
  }).taskAssignee,
  {
    ownerOpenIdMap: {
      "Agent Engineer": "ou_agent"
    },
    defaultOpenId: "ou_default_env"
  }
);

assert.throws(() => loadRuntimeConfig(["--owner-open-id-map-json", "[]"], {}), /expected a JSON object/);
assert.throws(() => loadRuntimeConfig(["--owner-open-id-map-json", "not-json"], {}), /Invalid owner open_id map/);

console.log("runtime config tests passed");
