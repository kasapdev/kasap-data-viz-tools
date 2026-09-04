import { diffSchemas } from "/lib/diff.js";

const fileAInput = document.getElementById("fileA");
const fileBInput = document.getElementById("fileB");
const statusEl = document.getElementById("status");
const treeEl = document.getElementById("tree");

let docA = null;
let docB = null;

fileAInput.addEventListener("change", () => loadFile(fileAInput, (doc) => (docA = doc)));
fileBInput.addEventListener("change", () => loadFile(fileBInput, (doc) => (docB = doc)));

async function loadFile(input, assign) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    assign(JSON.parse(text));
    statusEl.textContent = `Loaded ${file.name}.`;
    maybeRenderDiff();
  } catch (err) {
    statusEl.textContent = `Failed to parse ${file.name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function maybeRenderDiff() {
  if (docA === null || docB === null) return;
  const tree = diffSchemas(docA, docB);
  statusEl.textContent = "Diff computed.";
  treeEl.innerHTML = "";
  treeEl.appendChild(renderNode(tree, true));
}

function renderNode(node, expanded) {
  const wrapper = document.createElement("div");
  wrapper.className = "node";

  const row = document.createElement("div");
  row.className = "node-row" + (node.children.length > 0 ? " has-children" : "");

  const toggle = document.createElement("span");
  toggle.className = "toggle";
  toggle.textContent = node.children.length > 0 ? (expanded ? "▾" : "▸") : "";
  row.appendChild(toggle);

  const key = document.createElement("span");
  key.className = `key ${node.status}`;
  key.textContent = node.key;
  row.appendChild(key);

  const badge = document.createElement("span");
  badge.className = `badge ${node.status}`;
  badge.textContent = node.status;
  row.appendChild(badge);

  if (node.changes.length > 0) {
    const changes = document.createElement("span");
    changes.className = "changes";
    changes.textContent = node.changes.join("; ");
    row.appendChild(changes);
  }

  wrapper.appendChild(row);

  if (node.children.length > 0) {
    const childrenEl = document.createElement("div");
    childrenEl.className = "children";
    childrenEl.hidden = !expanded;
    for (const child of node.children) {
      // Auto-expand a subtree only if it (or a descendant) has changes, to
      // keep large unchanged trees collapsed by default.
      const childExpanded = expanded && hasNonUnchangedDescendant(child);
      childrenEl.appendChild(renderNode(child, childExpanded));
    }
    wrapper.appendChild(childrenEl);

    row.addEventListener("click", () => {
      const willShow = childrenEl.hidden;
      childrenEl.hidden = !willShow;
      toggle.textContent = willShow ? "▾" : "▸";
    });
  }

  return wrapper;
}

function hasNonUnchangedDescendant(node) {
  if (node.status !== "unchanged") return true;
  return node.children.some(hasNonUnchangedDescendant);
}
