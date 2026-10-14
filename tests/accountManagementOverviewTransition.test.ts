import assert = require("assert");
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import * as overviewData from "../src/data/accountManagementOverview";

// Execute the real TSX with deterministic hook scheduling and deferred reads.
// No browser globals, API calls, JET rendering, or production data mutations.
const ts = require(path.join(process.cwd(), "node_modules/typescript"));
type Node = { type: unknown; props: Record<string, any>; children: any[] };
const slots: any[] = [];
let cursor = 0;
let pendingEffects: Array<() => void> = [];
const hooks = {
  useState(initial: any) {
    const id = cursor++;
    if (!(id in slots)) slots[id] = typeof initial === "function" ? initial() : initial;
    return [slots[id], (value: any) => { slots[id] = typeof value === "function" ? value(slots[id]) : value; }];
  },
  useRef(initial: any) {
    const id = cursor++;
    if (!(id in slots)) slots[id] = { current: initial };
    return slots[id];
  },
  useMemo(fn: () => any) { cursor++; return fn(); },
  useEffect(fn: () => any, deps: unknown[]) {
    const id = cursor++;
    const prior = slots[id];
    if (!prior || deps.some((value, i) => value !== prior.deps[i])) {
      const next = { deps, cleanup: prior?.cleanup };
      slots[id] = next;
      pendingEffects.push(() => { prior?.cleanup?.(); next.cleanup = fn(); });
    }
  },
};
const requests: Array<{ resolve: (data: any) => void; reject: (error: Error) => void }> = [];
const FiscalYearSelector = () => null;
const moduleObject = { exports: {} as any };
const source = fs.readFileSync(process.env.OVERVIEW_TEST_SOURCE || path.join(process.cwd(), "src/components/content/AccountManagementOverviewPage.tsx"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, jsxFactory: "h" } }).outputText;
vm.runInNewContext(output, {
  exports: moduleObject.exports, module: moduleObject, console, React: { Fragment: "fragment" },
  require(name: string) {
    if (name === "preact") return { h: (type: unknown, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }) };
    if (name === "preact/hooks") return hooks;
    if (name.includes("accountsWorkloadsApi")) return { fetchAccountsWorkloadsHierarchy: () => {
      let success: (data: any) => void;
      let failure: (error: Error) => void;
      let finish: () => void;
      const chain = {
        then(fn: typeof success) { success = fn; return chain; },
        catch(fn: typeof failure) { failure = fn; return chain; },
        finally(fn: typeof finish) { finish = fn; return chain; },
      };
      // Replayable callbacks exercise guards against obsolete response commits,
      // including the narrow interval before the next effect cleanup.
      requests.push({ resolve: (data) => { success(data); finish(); }, reject: (error) => { failure(error); finish(); } });
      return chain;
    } };
    if (name.includes("accountManagementOverview")) return overviewData;
    if (name.includes("FiscalYearSelector")) return { FiscalYearSelector };
    return new Proxy({}, { get: (_target, key) => key });
  },
});
const render = (runEffects = true): Node => {
  cursor = 0;
  const tree = moduleObject.exports.AccountManagementOverviewPage({ onNavigate() {} });
  if (runEffects) { const effects = pendingEffects; pendingEffects = []; effects.forEach((fn) => fn()); }
  return tree;
};
const find = (tree: any, predicate: (node: Node) => boolean): Node | undefined => {
  if (!tree || typeof tree !== "object") return;
  if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(tree)) return tree;
  return find(tree.children, predicate) ?? find(Object.values(tree.props ?? {}), predicate);
};
const selector = (tree: Node) => find(tree, (node) => node.type === FiscalYearSelector)!;
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

async function main() {
  render();
  requests[0].resolve({ fiscalYear: null, accounts: [] });
  await tick();
  let tree = render();
  const oldYear = selector(tree).props.selected;
  const chosen = oldYear === "FY25" ? "FY26" : "FY25";
  selector(tree).props.onSelect(chosen);
  // Render before the request effect: selection is already committed and locked.
  tree = render(false);
  assert.strictEqual(selector(tree).props.selected, chosen);
  assert.strictEqual(selector(tree).props.disabled, true);
  selector(tree).props.onSelect(oldYear); // second same-turn action must be ignored
  assert.strictEqual(selector(render(false)).props.selected, chosen);
  const effects = pendingEffects; pendingEffects = []; effects.forEach((fn) => fn());
  requests[1].reject(new Error("refresh failed"));
  await tick();
  tree = render();
  assert.strictEqual(selector(tree).props.selected, chosen);
  assert.strictEqual(selector(tree).props.disabled, false);
  selector(tree).props.onSelect(oldYear);
  // Replay the prior request completion before effect cleanup has occurred.
  requests[1].resolve({ fiscalYear: null, accounts: [] });
  await tick();
  tree = render();
  assert.strictEqual(selector(tree).props.selected, oldYear);
  assert.strictEqual(selector(tree).props.disabled, true);
  requests[2].resolve({ fiscalYear: null, accounts: [] });
  await tick();
  tree = render();
  assert.strictEqual(selector(tree).props.selected, oldYear);
  assert.strictEqual(selector(tree).props.disabled, false);
  console.log("accountManagementOverviewTransition tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
