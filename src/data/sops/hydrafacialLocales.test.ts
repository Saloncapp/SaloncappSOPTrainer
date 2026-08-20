import assert from "node:assert/strict";
import test from "node:test";
import { hydrafacial } from "./hydrafacial";
import { hydrafacialStepLocales } from "./hydrafacialLocales";
import { resolveSopStepCopy } from "./types";

test("hydrafacial locales match English step structure", () => {
  for (const step of hydrafacial.steps) {
    const ta = hydrafacialStepLocales[step.stepNumber]?.ta;
    const hi = hydrafacialStepLocales[step.stepNumber]?.hi;
    assert.ok(ta?.description, `Tamil description missing for step ${step.stepNumber}`);
    assert.ok(hi?.description, `Hindi description missing for step ${step.stepNumber}`);
    assert.equal(ta?.importantPoints.length, step.importantPoints.length);
    assert.equal(hi?.importantPoints.length, step.importantPoints.length);
  }
});

test("resolveSopStepCopy follows selected language", () => {
  const step = hydrafacial.steps[0];
  const en = resolveSopStepCopy(step, "en");
  const ta = resolveSopStepCopy(step, "ta");
  const hi = resolveSopStepCopy(step, "hi");
  assert.equal(en.description, step.description);
  assert.equal(ta.description, step.locales?.ta?.description);
  assert.equal(hi.description, step.locales?.hi?.description);
  assert.notEqual(ta.description, en.description);
  assert.notEqual(hi.description, en.description);
});
