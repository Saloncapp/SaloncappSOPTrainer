import assert from "node:assert/strict";
import test from "node:test";
import { parseClientHandlingIntent } from "./clientHandlingIntents";

test("bare ok in awaiting_post_scenario_intent is not yes_next_scenario", () => {
  assert.equal(parseClientHandlingIntent("ok", "awaiting_post_scenario_intent"), "bare_ok");
  assert.equal(
    parseClientHandlingIntent("I understand", "awaiting_post_scenario_intent"),
    "bare_ok",
  );
  assert.equal(parseClientHandlingIntent("Okay", "awaiting_post_scenario_intent"), "bare_ok");
});

test("clear yes starts next scenario only in awaiting_post_scenario_intent", () => {
  assert.equal(
    parseClientHandlingIntent("yes", "awaiting_post_scenario_intent"),
    "yes_next_scenario",
  );
  assert.equal(
    parseClientHandlingIntent("give me another scenario", "awaiting_post_scenario_intent"),
    "yes_next_scenario",
  );
  assert.equal(
    parseClientHandlingIntent("Let's continue", "awaiting_post_scenario_intent"),
    "yes_next_scenario",
  );
  assert.equal(
    parseClientHandlingIntent("Okay, next", "awaiting_post_scenario_intent"),
    "yes_next_scenario",
  );
  assert.equal(
    parseClientHandlingIntent("Another one", "awaiting_post_scenario_intent"),
    "yes_next_scenario",
  );
});

test("no and stop in awaiting_post_scenario_intent exit training", () => {
  assert.equal(parseClientHandlingIntent("no", "awaiting_post_scenario_intent"), "stop");
  assert.equal(parseClientHandlingIntent("no thanks", "awaiting_post_scenario_intent"), "stop");
  assert.equal(parseClientHandlingIntent("stop", "awaiting_post_scenario_intent"), "stop");
  assert.equal(parseClientHandlingIntent("exit", "awaiting_post_scenario_intent"), "stop");
  assert.equal(
    parseClientHandlingIntent("that's enough", "awaiting_post_scenario_intent"),
    "stop",
  );
  assert.equal(
    parseClientHandlingIntent("I don't want another scenario", "awaiting_post_scenario_intent"),
    "stop",
  );
  assert.equal(parseClientHandlingIntent("end training", "awaiting_post_scenario_intent"), "stop");
  assert.equal(parseClientHandlingIntent("finish", "awaiting_post_scenario_intent"), "stop");
});

test("no during an answer is not treated as exit", () => {
  assert.equal(
    parseClientHandlingIntent("I would not argue with the client", "awaiting_answer"),
    "answer",
  );
});

test("end in an answer is not treated as stop", () => {
  assert.equal(
    parseClientHandlingIntent("I would end with an apology and a realistic update", "awaiting_answer"),
    "answer",
  );
});

test("mid-scenario doubt stays in awaiting_answer intent path", () => {
  assert.equal(
    parseClientHandlingIntent("What if she starts shouting?", "awaiting_answer"),
    "doubt",
  );
  assert.equal(
    parseClientHandlingIntent("What if she starts shouting?", "awaiting_retry_answer"),
    "doubt",
  );
});

test("ask for answer is detected during answer phases", () => {
  assert.equal(
    parseClientHandlingIntent("What should I do?", "awaiting_answer"),
    "ask_for_answer",
  );
  assert.equal(
    parseClientHandlingIntent("Tell me the correct approach", "awaiting_retry_answer"),
    "ask_for_answer",
  );
});

test("no doubt in awaiting_post_scenario_intent", () => {
  assert.equal(
    parseClientHandlingIntent("no doubt", "awaiting_post_scenario_intent"),
    "no_doubt",
  );
  assert.equal(
    parseClientHandlingIntent("no doubts", "awaiting_post_scenario_intent"),
    "no_doubt",
  );
  assert.equal(
    parseClientHandlingIntent("nothing", "awaiting_post_scenario_intent"),
    "no_doubt",
  );
});

test("retry phase treats a handling response as an answer", () => {
  assert.equal(
    parseClientHandlingIntent(
      "I would stay calm, apologise and give a realistic waiting time",
      "awaiting_retry_answer",
    ),
    "answer",
  );
});
