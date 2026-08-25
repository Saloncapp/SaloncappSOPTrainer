import assert from "node:assert/strict";
import test from "node:test";
import { managerClientHandling } from "../data/sops/managerClientHandling";
import { hydrafacial } from "../data/sops/hydrafacial";
import { isManagerClientHandling, trainingModeFor } from "./trainingModes";

test("training mode is derived from slug", () => {
  assert.equal(trainingModeFor(hydrafacial), "SOP_VIDEO");
  assert.equal(trainingModeFor(managerClientHandling), "MANAGER_CLIENT_HANDLING");
  assert.equal(isManagerClientHandling(hydrafacial), false);
  assert.equal(isManagerClientHandling(managerClientHandling), true);
});
