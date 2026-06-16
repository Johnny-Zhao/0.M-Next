import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(import.meta.dirname, "..");
const fixturesRoot = path.join(root, "tests", "contracts", "fixtures");
const schemas = {
  commands: JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "schemas", "kernel-commands.schema.json"),
      "utf8",
    ),
  ),
  events: JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "contracts",
        "schemas",
        "kernel-event-envelope.schema.json",
      ),
      "utf8",
    ),
  ),
  "meta-commands": JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "schemas", "meta-commands.schema.json"),
      "utf8",
    ),
  ),
  "review-commands": JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "schemas", "review-commands.schema.json"),
      "utf8",
    ),
  ),
  "simulation-events": JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "schemas", "simulation-events.schema.json"),
      "utf8",
    ),
  ),
  "rule-commands": JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "schemas", "rule-commands.schema.json"),
      "utf8",
    ),
  ),
  "rule-result": JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "schemas", "rule-result.schema.json"),
      "utf8",
    ),
  ),
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validators = {
  commands: ajv.compile(schemas.commands),
  events: ajv.compile(schemas.events),
  "meta-commands": ajv.compile(schemas["meta-commands"]),
  "review-commands": ajv.compile(schemas["review-commands"]),
  "simulation-events": ajv.compile(schemas["simulation-events"]),
  "rule-commands": ajv.compile(schemas["rule-commands"]),
  "rule-result": ajv.compile(schemas["rule-result"]),
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const fixtures = walk(fixturesRoot).filter((file) => file.endsWith(".json"));
let failures = 0;
const fixtureCounts = { valid: 0, invalid: 0 };

for (const fixture of fixtures) {
  const relative = path.relative(fixturesRoot, fixture).split(path.sep);
  const [schemaName, expectation] = relative;
  const validator = validators[schemaName];
  if (validator === undefined || !["valid", "invalid"].includes(expectation)) {
    console.error(
      `FAIL ${path.relative(root, fixture)}: expected <commands|events|meta-commands|review-commands|simulation-events|rule-commands|rule-result>/<valid|invalid>`,
    );
    failures += 1;
    continue;
  }
  fixtureCounts[expectation] += 1;

  const data = JSON.parse(fs.readFileSync(fixture, "utf8"));
  const accepted = validator(data);
  const expectedAccepted = expectation === "valid";
  if (accepted !== expectedAccepted) {
    console.error(
      `FAIL ${path.relative(root, fixture)}: expected ${expectation}, got ${
        accepted ? "valid" : "invalid"
      }`,
    );
    if (validator.errors)
      console.error(JSON.stringify(validator.errors, null, 2));
    failures += 1;
  } else {
    console.log(`PASS ${path.relative(root, fixture)}`);
  }
}

if (fixtures.length < 10) {
  console.error(`FAIL expected at least 10 fixtures, found ${fixtures.length}`);
  failures += 1;
}
for (const expectation of ["valid", "invalid"]) {
  if (fixtureCounts[expectation] < 5) {
    console.error(`FAIL expected at least 5 ${expectation} fixtures`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`Contract checks failed: ${failures} failure(s).`);
  process.exitCode = 1;
} else {
  console.log(`Contract checks passed: ${fixtures.length} fixtures.`);
}
