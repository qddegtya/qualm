import { expect, test } from "vitest";
import { choice, client, is, score } from "../src/index.ts";
import { answered, stubFetch } from "./helpers.ts";

const jev = (body: unknown) => {
  const { fetch, calls } = stubFetch(body);
  return { client: client({ provider: "typesafe", apiKey: "k", fetch }), calls };
};

test("sends every question in one request, keyed by the names you chose", async () => {
  const { client: c, calls } = jev(
    answered({
      urgent: { type: "noul", noul: 0.9 },
      team: {
        type: "choice",
        choice: "billing",
        probabilities: { billing: 0.9, sales: 0.1 },
        confidence: 0.8,
      },
    }),
  );

  await c.ask("Payouts have been failing.", {
    urgent: is`This conveys urgency`,
    team: choice`Which team?`({ billing: "Payments", sales: null }),
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
  expect(calls[0]?.headers.get("authorization")).toBe("Bearer k");
  expect(calls[0]?.body).toEqual({
    model: "jev-latest",
    state: "Payouts have been failing.",
    questions: {
      urgent: { type: "noul", instructions: "This conveys urgency" },
      team: {
        type: "choice",
        instructions: "Which team?",
        criteria: { billing: "Payments", sales: null },
      },
    },
  });
});

test("an `is` answer keeps the probability the model reported", async () => {
  const { client: c } = jev(answered({ urgent: { type: "noul", noul: 0.9 } }));
  const { urgent } = await c.ask("...", { urgent: is`This conveys urgency` });

  expect(urgent.probability).toBe(0.9);
  expect(urgent.top).toBe(true);
});

test("an `is` answer derives confidence, because the API reports none for this type", async () => {
  const { client: c } = jev(
    answered({ a: { type: "noul", noul: 0.9 }, b: { type: "noul", noul: 0.5 } }),
  );
  const { a, b } = await c.ask("...", { a: is`Certainly true`, b: is`Exactly even` });

  // |2 * 0.9 - 1|
  expect(a.confidence).toBeCloseTo(0.8);
  // An even split carries no information.
  expect(b.confidence).toBe(0);
});

test("a `choice` answer exposes the top label and the whole distribution", async () => {
  const { client: c } = jev(
    answered({
      team: {
        type: "choice",
        choice: "billing",
        probabilities: { billing: 0.85, sales: 0.15 },
        confidence: 0.82,
      },
    }),
  );
  const { team } = await c.ask("...", {
    team: choice`Which team?`({ billing: "Payments", sales: null }),
  });

  expect(team.top).toBe("billing");
  expect(team.confidence).toBe(0.82);
  expect(team.probabilities).toEqual({ billing: 0.85, sales: 0.15 });
});

test("a `score` answer keeps the expected value and its legend", async () => {
  const { client: c } = jev(
    answered({
      severity: {
        type: "score",
        score: 1.6,
        legend: { 0: "Cosmetic", 1: "Annoying", 2: "Blocks production" },
        probabilities: { 0: 0.05, 1: 0.3, 2: 0.65 },
        confidence: 0.78,
      },
    }),
  );
  const { severity } = await c.ask("...", {
    severity: score`How severe?`(["Cosmetic", "Annoying", "Blocks production"]),
  });

  expect(severity.value).toBe(1.6);
  expect(severity.legend[2]).toBe("Blocks production");
});
