import { expect, test } from "vitest";
import { choice, client, is } from "../src/index.ts";
import { answered, stubFetch } from "./helpers.ts";

const team = { billing: "Payments", technical: "Bugs", sales: null };

const ask = (wire: Record<string, unknown>, confidence?: number) => {
  const { fetch } = stubFetch(answered(wire));
  const c = client({ provider: "typesafe", apiKey: "k", fetch, ...(confidence && { confidence }) });
  return c.ask("...", { urgent: is`This conveys urgency`, team: choice`Which team?`(team) });
};

const picked = {
  type: "choice",
  choice: "billing",
  probabilities: { billing: 0.85, technical: 0.1, sales: 0.05 },
  confidence: 0.82,
} as const;

const branches = {
  billing: () => "billing" as const,
  technical: () => "technical" as const,
  sales: () => "sales" as const,
  unsure: () => "unsure" as const,
};

test("takes the branch for the top label when confident enough", async () => {
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: picked });

  expect(t.decide(branches)).toBe("billing");
});

test("takes `unsure` when confidence falls below the bar, however clear the top label looks", async () => {
  const flat = {
    ...picked,
    probabilities: { billing: 0.34, technical: 0.33, sales: 0.33 },
    confidence: 0.02,
  };
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: flat });

  expect(t.top).toBe("billing");
  expect(t.decide(branches)).toBe("unsure");
});

test("acts when confidence sits exactly on the bar", async () => {
  const exact = { ...picked, confidence: 0.7 };
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: exact }, 0.7);

  expect(t.decide(branches)).toBe("billing");
});

test("a bar given at the call site overrides the client's", async () => {
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: picked }, 0.5);

  expect(t.decide(branches)).toBe("billing");
  expect(t.decide(branches, { confidence: 0.95 })).toBe("unsure");
});

test("`is` splits into yes, no and unsure", async () => {
  const yes = await ask({ urgent: { type: "noul", noul: 0.95 }, team: picked });
  const no = await ask({ urgent: { type: "noul", noul: 0.02 }, team: picked });
  const even = await ask({ urgent: { type: "noul", noul: 0.52 }, team: picked });
  const handlers = { yes: () => "yes", no: () => "no", unsure: () => "unsure" };

  expect(yes.urgent.decide(handlers)).toBe("yes");
  expect(no.urgent.decide(handlers)).toBe("no");
  expect(even.urgent.decide(handlers)).toBe("unsure");
});

test("stays synchronous when every branch is, so a decision costs no tick", async () => {
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: picked });

  expect(t.decide(branches)).not.toBeInstanceOf(Promise);
});

test("passes a branch's promise straight through, so escalations can run in parallel", async () => {
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: picked });
  // oxlint-disable-next-line require-await -- an async branch with no await is exactly what is under test
  const escalating = { ...branches, unsure: async () => "escalated" as const };

  const [a, b] = await Promise.all([
    t.decide(escalating, { confidence: 0.95 }),
    t.decide(escalating, { confidence: 0.95 }),
  ]);
  expect([a, b]).toEqual(["escalated", "escalated"]);
});

test("refuses a label the model invented, because that is a broken protocol and not uncertainty", async () => {
  const invented = { ...picked, choice: "marketing" };
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: invented });

  expect(() => t.decide(branches)).toThrow(/marketing/u);
});

test("the handler map must cover every label and `unsure`, and nothing else", async () => {
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: picked });

  // @ts-expect-error `unsure` is missing.
  t.decide({ billing: () => 1, technical: () => 2, sales: () => 3 });
  // @ts-expect-error `sales` is missing.
  t.decide({ billing: () => 1, technical: () => 2, unsure: () => 4 });
  t.decide({
    billing: () => 1,
    technical: () => 2,
    sales: () => 3,
    unsure: () => 4,
    // @ts-expect-error `marketing` is not one of the labels.
    marketing: () => 5,
  });

  expect(t.top).toBe("billing");
});

test("an async branch keeps a promise in the return type, which is what the lint rule keys on", async () => {
  const { team: t } = await ask({ urgent: { type: "noul", noul: 0.9 }, team: picked });

  // @ts-expect-error the union still carries a promise. If this ever becomes assignable,
  // `no-floating-promises` loses the type it needs to see a forgotten `await`.
  const flattened: string = t.decide({
    ...branches,
    // oxlint-disable-next-line require-await -- an async branch is the point of this test
    unsure: async () => "escalated" as const,
  });

  expect(flattened).toBe("billing");
});
