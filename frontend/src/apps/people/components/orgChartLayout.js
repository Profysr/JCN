// Pure layout math for OrgChartPage — no React, no side effects. Kept separate
// so the tree/grid positioning logic can be reasoned about (and unit tested)
// independently of rendering.

export const NODE_W = 180;
export const NODE_H = 80;
export const H_GAP = 40; // horizontal gap between siblings
export const V_GAP = 70; // vertical gap between levels

// ── Tree layout algorithm ─────────────────────────────────────────────────────
// The hierarchy is loaded lazily: `roots` only ever holds nodes whose children
// have actually been fetched (see `childrenByNode` in the page component). A
// node with `has_reports: true` but no entry in `childrenByNode` is rendered as
// a leaf with an expand affordance — clicking it fetches and attaches its
// children one level at a time instead of the whole subtree.
export function buildTree(roots, expandedIds, childrenByNode) {
  function attach(node) {
    const withChildren = { ...node, children: [] };
    if (expandedIds.has(node.id) && childrenByNode[node.id]) {
      withChildren.children = childrenByNode[node.id].map(attach);
    }
    return withChildren;
  }

  const built = roots.map(attach);
  if (built.length > 1) {
    return [{ id: "__root__", name: "Company", virtual: true, children: built }];
  }
  return built;
}

function computeSubtreeWidth(node) {
  if (!node.children || node.children.length === 0) {
    return NODE_W;
  }
  const childrenW = node.children.reduce(
    (acc, child, i) => acc + computeSubtreeWidth(child) + (i > 0 ? H_GAP : 0),
    0,
  );
  return Math.max(NODE_W, childrenW);
}

export function layoutTree(nodes) {
  const positions = {};
  const edges = [];

  function layout(node, x, y) {
    positions[node.id] = { x, y, node };

    if (!node.children || node.children.length === 0) return;

    const children = node.children;
    const totalW = children.reduce(
      (acc, child, i) => acc + computeSubtreeWidth(child) + (i > 0 ? H_GAP : 0),
      0,
    );
    let childX = x - totalW / 2 + computeSubtreeWidth(children[0]) / 2;
    const childY = y + NODE_H + V_GAP;

    children.forEach((child) => {
      const cw = computeSubtreeWidth(child);
      layout(child, childX, childY);
      edges.push({ from: node.id, to: child.id });
      childX += cw + H_GAP;
    });
  }

  nodes.forEach((root, i) => {
    layout(root, i * (NODE_W + H_GAP), 0);
  });

  return { positions, edges };
}

// ── Department-grouped lazy layout ────────────────────────────────────────────
// `groups`: [{ dept, members: nodes[]|null, memberCount, loading }] — members is
// null until that department card has been expanded and its members fetched.
export function buildLazyDeptLayout(groups) {
  const positions = {};
  const deptRects = [];
  const COLS = 4;
  const CARD_W = NODE_W;
  const CARD_H = NODE_H;
  const PADDING = 24;
  const DEPT_HEADER = 36;
  const COLLAPSED_H = DEPT_HEADER + 44;

  let yOffset = 0;
  groups.forEach(({ dept, members, memberCount, loading }) => {
    if (members) {
      const count = Math.max(members.length, 1);
      const cols = Math.min(COLS, count);
      const rows = Math.ceil(count / COLS);
      const rectW = cols * (CARD_W + H_GAP) - H_GAP + PADDING * 2;
      const rectH = DEPT_HEADER + rows * (CARD_H + 16) - 16 + PADDING;
      deptRects.push({ dept, x: 0, y: yOffset, w: rectW, h: rectH, expanded: true, memberCount, loading, empty: members.length === 0 });

      members.forEach((m, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        positions[m.id] = {
          x: PADDING + col * (CARD_W + H_GAP),
          y: yOffset + DEPT_HEADER + row * (CARD_H + 16),
          node: m,
        };
      });
      yOffset += rectH + 24;
    } else {
      const rectW = CARD_W + PADDING * 2;
      deptRects.push({ dept, x: 0, y: yOffset, w: rectW, h: COLLAPSED_H, expanded: false, memberCount, loading });
      yOffset += COLLAPSED_H + 24;
    }
  });

  return { positions, deptRects, edges: [] };
}

// Bounds (and the offset that shifts everything into view) from the corners of
// every node card and department rect, in one consistent coordinate space —
// node positions are centers (OrgNode draws at x - NODE_W/2), rects are already
// top-left corners, so both are normalized to corner points here.
export function computeChartBounds(positions, deptRects) {
  const points = [];
  Object.values(positions).forEach((p) => {
    points.push({ x: p.x - NODE_W / 2, y: p.y }, { x: p.x + NODE_W / 2, y: p.y + NODE_H });
  });
  deptRects.forEach((r) => {
    points.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
  });
  if (!points.length) return { svgW: 800, svgH: 600, offsetX: 40, offsetY: 40 };
  const minX = Math.min(...points.map((p) => p.x)) - 40;
  const maxX = Math.max(...points.map((p) => p.x)) + 40;
  const minY = Math.min(...points.map((p) => p.y)) - 40;
  const maxY = Math.max(...points.map((p) => p.y)) + 40;
  return { svgW: maxX - minX, svgH: maxY - minY, offsetX: -minX, offsetY: -minY };
}
