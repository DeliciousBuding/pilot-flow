import assert from "node:assert/strict";
import { extractContactCandidates, resolveContactSearchAssignee } from "./contact-owner-resolver.js";

const searchOutput = {
  json: {
    code: 0,
    data: {
      users: [
        {
          open_id: "ou_product",
          name: "Product Owner",
          email: "product@example.com"
        },
        {
          open_id: "ou_agent",
          name: "Agent Engineer"
        }
      ]
    }
  }
};

assert.deepEqual(resolveContactSearchAssignee("Product Owner", searchOutput), {
  owner: "Product Owner",
  assignee: "ou_product",
  source: "contact_lookup_exact",
  contact_lookup: {
    status: "matched",
    source: "contact_lookup_exact",
    candidate_count: 2,
    matched_candidate: {
      open_id: "ou_product",
      name: "Product Owner",
      email: "product@example.com"
    }
  }
});

assert.equal(
  resolveContactSearchAssignee("Only Result", {
    json: {
      data: {
        items: [
          {
            open_id: "ou_only",
            display_name: "Different Name"
          }
        ]
      }
    }
  }).source,
  "contact_lookup_unique"
);

assert.equal(
  resolveContactSearchAssignee("Product Owner", {
    json: {
      data: {
        users: [
          { open_id: "ou_1", name: "Product Owner" },
          { open_id: "ou_2", display_name: "Product Owner" }
        ]
      }
    }
  }).contact_lookup.status,
  "ambiguous_exact_match"
);

assert.equal(
  resolveContactSearchAssignee("Product Owner", {
    dry_run: true,
    command: ["lark-cli", "contact", "+search-user"]
  }).source,
  "contact_lookup_dry_run"
);

assert.equal(resolveContactSearchAssignee("Product Owner", { json: { code: 41050, msg: "permission denied" } }).contact_lookup.status, "api_error");
assert.equal(extractContactCandidates({ data: { users: [{ name: "No ID" }] } }).length, 0);

console.log("contact owner resolver tests passed");
