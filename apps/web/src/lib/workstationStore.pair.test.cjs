"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function declarations(file, names) {
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText(tree);
      if (names.includes(name)) found.set(name, node.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

const store = declarations(path.join(__dirname, "workstationStore.tsx"), [
  "setActiveInstrument", "toggleComparison", "selectCorrelationPair",
]);
const dock = declarations(path.join(__dirname, "../components/workstation/LowerDock.tsx"), ["selectPair"]);

function clickPair(active, comparisons, left, right) {
  assert.ok(dock.has("selectPair"), "CorrelationMatrix must expose its pair click handler");
  const body = ["setActiveInstrument", "toggleComparison", "selectCorrelationPair"]
    .filter((name) => store.has(name))
    .map((name) => `const ${store.get(name)};`)
    .concat(`const ${dock.get("selectPair")};`)
    .join("\n");
  const source = `
    const activeInstrument = ${JSON.stringify(active)};
    let nextActive = activeInstrument;
    let nextComparisons = ${JSON.stringify(comparisons)};
    let selectedPair = null;
    const MAX_COMPARISONS = 8;
    const setActiveInstrumentState = (value) => { nextActive = value; };
    const setComparisonInstruments = (update) => {
      nextComparisons = typeof update === "function" ? update(nextComparisons) : update;
    };
    const setSelectedPair = (value) => { selectedPair = value; };
    ${body}
    selectPair(${JSON.stringify(left)}, ${JSON.stringify(right)});
    globalThis.result = { active: nextActive, comparisons: nextComparisons, selectedPair };
  `;
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const context = {};
  vm.runInNewContext(javascript, context, { timeout: 1000 });
  return JSON.parse(JSON.stringify(context.result));
}

test("reversing the default pair keeps the previous active instrument as comparison", () => {
  assert.deepEqual(clickPair("BTC", ["ETH"], "ETH", "BTC"), {
    active: "ETH", comparisons: ["BTC"], selectedPair: ["ETH", "BTC"],
  });
});

test("selecting an already compared pair does not toggle its comparison off", () => {
  assert.deepEqual(clickPair("BTC", ["ETH"], "BTC", "ETH"), {
    active: "BTC", comparisons: ["ETH"], selectedPair: ["BTC", "ETH"],
  });
});

test("pair selection preserves unrelated comparisons and excludes the new active", () => {
  assert.deepEqual(clickPair("BTC", ["ETH", "SOL"], "SOL", "LINK"), {
    active: "SOL", comparisons: ["ETH", "LINK"], selectedPair: ["SOL", "LINK"],
  });
});

test("selecting a diagonal cell does nothing", () => {
  assert.deepEqual(clickPair("BTC", ["ETH"], "BTC", "BTC"), {
    active: "BTC", comparisons: ["ETH"], selectedPair: null,
  });
});
