import { strict as assert } from "node:assert";
import { CardEventListener } from "./card-event-listener.js";

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    testsPassed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testsFailed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

console.log("card-event-listener.test.js");

await test("handleLine parses valid card.action.trigger with approved action", async () => {
  const triggers = [];
  const callbacks = [];
  const events = [];

  const listener = new CardEventListener({
    dryRun: true,
    onEvent: (e) => events.push(e),
    onCallback: (c) => callbacks.push(c),
    onTrigger: (c) => triggers.push(c)
  });

  const payload = {
    event_type: "card.action.trigger",
    event: {
      action: {
        value: {
          pilotflow_card: "execution_plan",
          pilotflow_action: "confirm_execute",
          pilotflow_run_id: "run-abc-123"
        }
      },
      operator: {
        open_id: "ou_user1"
      }
    }
  };

  listener.handleLine(JSON.stringify(payload));
  await Promise.resolve();

  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].ok, true);
  assert.equal(callbacks[0].card, "execution_plan");
  assert.equal(callbacks[0].action, "confirm_execute");
  assert.equal(callbacks[0].decision.status, "approved");
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].action, "confirm_execute");
});

await test("handleLine does not trigger on non-approved action", () => {
  const triggers = [];
  const callbacks = [];

  const listener = new CardEventListener({
    dryRun: true,
    onCallback: (c) => callbacks.push(c),
    onTrigger: (c) => triggers.push(c)
  });

  const payload = {
    event: {
      action: {
        value: {
          pilotflow_card: "execution_plan",
          pilotflow_action: "cancel"
        }
      }
    }
  };

  listener.handleLine(JSON.stringify(payload));

  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].ok, true);
  assert.equal(callbacks[0].decision.status, "cancelled");
  assert.equal(triggers.length, 0);
});

await test("handleLine reports async trigger failures", async () => {
  const errors = [];
  const events = [];

  const listener = new CardEventListener({
    dryRun: true,
    onEvent: (e) => events.push(e),
    onError: (error) => errors.push(error),
    onTrigger: () => {
      throw new Error("trigger failed");
    }
  });

  listener.handleLine(
    JSON.stringify({
      event: {
        action: {
          value: {
            pilotflow_card: "execution_plan",
            pilotflow_action: "confirm_execute"
          }
        }
      }
    })
  );
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, "trigger failed");
  assert.equal(events.some((event) => event.type === "trigger_failed"), true);
});

await test("handleLine ignores invalid JSON", () => {
  const events = [];

  const listener = new CardEventListener({
    dryRun: true,
    onEvent: (e) => events.push(e)
  });

  listener.handleLine("not json");

  const parseErrors = events.filter((e) => e.type === "parse_error");
  assert.equal(parseErrors.length, 1);
});

await test("handleLine ignores empty lines", () => {
  const events = [];

  const listener = new CardEventListener({
    dryRun: true,
    onEvent: (e) => events.push(e)
  });

  listener.handleLine("  ");

  assert.equal(events.length, 0);
});

await test("handleLine does not trigger when stopped", () => {
  const triggers = [];

  const listener = new CardEventListener({
    dryRun: true,
    onTrigger: (c) => triggers.push(c)
  });

  listener.stopped = true;

  const payload = {
    event: {
      action: {
        value: {
          pilotflow_card: "execution_plan",
          pilotflow_action: "confirm_execute"
        }
      }
    }
  };

  listener.handleLine(JSON.stringify(payload));

  assert.equal(triggers.length, 0);
});

await test("handleLine handles risk_decision card actions", () => {
  const callbacks = [];

  const listener = new CardEventListener({
    dryRun: true,
    onCallback: (c) => callbacks.push(c)
  });

  const payload = {
    event: {
      action: {
        value: {
          pilotflow_card: "risk_decision",
          pilotflow_action: "accept_risk"
        }
      }
    }
  };

  listener.handleLine(JSON.stringify(payload));

  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].ok, true);
  assert.equal(callbacks[0].card, "risk_decision");
  assert.equal(callbacks[0].decision.status, "accepted");
});

await test("handleLine stops after maxEvents", () => {
  const events = [];

  const listener = new CardEventListener({
    maxEvents: 1,
    onEvent: (e) => events.push(e)
  });

  listener.handleLine(
    JSON.stringify({
      event: {
        action: {
          value: {
            pilotflow_card: "execution_plan",
            pilotflow_action: "cancel"
          }
        }
      }
    })
  );

  assert.equal(listener.stopped, true);
  assert.equal(events.some((event) => event.type === "listener_max_events_reached"), true);
});

await test("buildSubscribeArgs includes profile and event types", () => {
  const listener = new CardEventListener({ profile: "pilotflow-contest" });
  assert.equal(listener.profile, "pilotflow-contest");
  assert.equal(listener.dryRun, false);
});

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
if (testsFailed > 0) process.exitCode = 1;
