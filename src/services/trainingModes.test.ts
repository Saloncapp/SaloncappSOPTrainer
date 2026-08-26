import assert from "node:assert/strict";
import test from "node:test";
import { managerClientHandling } from "../data/sops/managerClientHandling";
import { stylistClientHandling } from "../data/sops/stylistClientHandling";
import { hydrafacial } from "../data/sops/hydrafacial";
import {
  clientHandlingRoleFor,
  isClientHandlingTraining,
  isManagerClientHandling,
  isStylistClientHandling,
  trainingModeFor,
} from "./trainingModes";
import { STYLIST_SCENARIO_TOPIC_BANK } from "./clientHandlingTypes";

test("training mode is derived from slug", () => {
  assert.equal(trainingModeFor(hydrafacial), "SOP_VIDEO");
  assert.equal(trainingModeFor(managerClientHandling), "MANAGER_CLIENT_HANDLING");
  assert.equal(trainingModeFor(stylistClientHandling), "STYLIST_CLIENT_HANDLING");
  assert.equal(isManagerClientHandling(hydrafacial), false);
  assert.equal(isManagerClientHandling(managerClientHandling), true);
  assert.equal(isStylistClientHandling(stylistClientHandling), true);
  assert.equal(isStylistClientHandling(managerClientHandling), false);
  assert.equal(isClientHandlingTraining(hydrafacial), false);
  assert.equal(isClientHandlingTraining(managerClientHandling), true);
  assert.equal(isClientHandlingTraining(stylistClientHandling), true);
  assert.equal(clientHandlingRoleFor(managerClientHandling), "manager");
  assert.equal(clientHandlingRoleFor(stylistClientHandling), "stylist");
  assert.equal(clientHandlingRoleFor(hydrafacial), null);
});

test("stylist client handling covers the seven core skill topic areas", () => {
  const required = [
    "client_greeting",
    "consultation_needs",
    "service_explanation",
    "managing_expectations",
    "client_questions",
    "complaint_handling",
    "service_completion_feedback",
  ];
  for (const topic of required) {
    assert.ok(
      STYLIST_SCENARIO_TOPIC_BANK.includes(topic as (typeof STYLIST_SCENARIO_TOPIC_BANK)[number]),
      `missing stylist topic: ${topic}`,
    );
  }
  assert.ok(STYLIST_SCENARIO_TOPIC_BANK.length >= 7);
});
