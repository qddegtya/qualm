import { expect, test } from "vitest";
import { choice, is, score } from "../src/index.ts";

test("`is` keeps the wire type the API expects, not the name we call it", () => {
  expect(is`This message conveys urgency`).toEqual({
    type: "noul",
    instructions: "This message conveys urgency",
  });
});

test("`choice` carries its options through as criteria", () => {
  expect(choice`Which team should handle this?`({ billing: "Payments", sales: null })).toEqual({
    type: "choice",
    instructions: "Which team should handle this?",
    criteria: { billing: "Payments", sales: null },
  });
});

test("`score` keeps its levels in the order they were written", () => {
  expect(score`How severe is this?`(["Cosmetic", "Blocks production"])).toEqual({
    type: "score",
    instructions: "How severe is this?",
    criteria: ["Cosmetic", "Blocks production"],
  });
});

test("interpolated text lands in the instructions", () => {
  const team = "billing";
  expect(is`This belongs to ${team}`.instructions).toBe("This belongs to billing");
});

test("a question is plain data, so it survives being serialised", () => {
  const question = choice`Pick one`({ a: "first", b: "second" });
  expect(JSON.parse(JSON.stringify(question))).toEqual(question);
});

test("`choice` narrows option labels to their literals, not to `string`", () => {
  const question = choice`Pick one`({ bug: "broken", other: null });
  type Label = keyof typeof question.criteria;

  const known: Label = "bug";
  // @ts-expect-error "nope" is not one of the declared labels.
  const unknownLabel: Label = "nope";

  expect([known, unknownLabel]).toEqual(["bug", "nope"]);
});

test("`score` keeps its levels as a tuple, so positions stay known", () => {
  const question = score`How severe?`(["Cosmetic", "Blocks production"]);
  type Level = (typeof question.criteria)[number];

  const known: Level = "Cosmetic";
  // @ts-expect-error "Catastrophic" is not one of the declared levels.
  const unknownLevel: Level = "Catastrophic";

  expect([known, unknownLevel]).toEqual(["Cosmetic", "Catastrophic"]);
});

test("`score` rejects a rubric with fewer than the two levels the API requires", () => {
  // @ts-expect-error a single level is not a valid rubric.
  const tooFew = score`How severe?`(["Only one"]);

  expect(tooFew.criteria).toEqual(["Only one"]);
});
