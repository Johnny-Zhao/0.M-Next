import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { evaluateServerReadiness } from "./dev-up-readiness.mjs";

test("health alone keeps startup waiting", () => {
  assert.equal(
    evaluateServerReadiness({ healthReady: true, javaRunning: true, log: "" })
      .state,
    "waiting",
  );
});

test("health and Spring started marker make startup ready", () => {
  assert.equal(
    evaluateServerReadiness({
      healthReady: true,
      javaRunning: true,
      log: "Started MNextApplication in 4.2 seconds",
    }).state,
    "ready",
  );
  assert.equal(
    evaluateServerReadiness({
      healthReady: false,
      javaRunning: true,
      log: "Started MNextApplication in 4.2 seconds",
    }).state,
    "waiting",
  );
});

test("Spring startup failure and Java exit are terminal", () => {
  const failed = evaluateServerReadiness({
    healthReady: true,
    javaRunning: true,
    log: "Application run failed\nIllegalStateException: seed failed",
  });
  assert.deepEqual(failed, {
    state: "failed",
    detail: "IllegalStateException: seed failed",
  });
  assert.equal(
    evaluateServerReadiness({ healthReady: true, javaRunning: false, log: "" })
      .state,
    "exited",
  );
});

test("startup script has no domain workspace readiness dependency", () => {
  const source = fs.readFileSync(
    new URL("./dev-up.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "pcWorkspaceId",
    "pc-procurement",
    "build_plan",
    "interior-design",
    "objectType=room",
    "serverReadyText",
    "/workspaces/",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
