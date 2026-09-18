export default {
  extends: ["@commitlint/config-angular"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["question", "answer", "client", "provider", "retry", "error", "types", "deps", "release"],
    ],
  },
};
