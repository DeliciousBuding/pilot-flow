import assert from "node:assert/strict";
import { applyDefaultTaskAssignee, lookupOwnerOpenId, resolveTaskAssignee } from "./task-assignee-resolver.js";

const plan = {
  members: ["Product Owner", "Agent Engineer"],
  deliverables: ["Project brief"]
};

assert.deepEqual(resolveTaskAssignee(plan), {
  owner: "Product Owner",
  assignee: "",
  source: "unmapped"
});

assert.deepEqual(
  resolveTaskAssignee(plan, {
    ownerOpenIdMap: {
      "product owner": "ou_product"
    }
  }),
  {
    owner: "Product Owner",
    assignee: "ou_product",
    source: "owner_open_id_map"
  }
);

assert.deepEqual(
  resolveTaskAssignee(plan, {
    defaultOpenId: "ou_default"
  }),
  {
    owner: "Product Owner",
    assignee: "ou_default",
    source: "default_task_assignee"
  }
);

assert.equal(lookupOwnerOpenId("  Product   Owner ", { "product owner": "ou_product" }), "ou_product");
assert.equal(lookupOwnerOpenId("Unknown", { "product owner": "ou_product" }), "");
assert.deepEqual(applyDefaultTaskAssignee({ owner: "Product Owner", assignee: "", source: "unmapped" }, "ou_default"), {
  owner: "Product Owner",
  assignee: "ou_default",
  source: "default_task_assignee"
});
assert.deepEqual(
  applyDefaultTaskAssignee({ owner: "Product Owner", assignee: "ou_product", source: "owner_open_id_map" }, "ou_default"),
  {
    owner: "Product Owner",
    assignee: "ou_product",
    source: "owner_open_id_map"
  }
);

console.log("task assignee resolver tests passed");
