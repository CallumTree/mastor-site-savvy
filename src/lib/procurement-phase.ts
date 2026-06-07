// Construction phase classifier for procurement items.
// Maps a description (and optionally a matched scope element) to a phase_order
// 1..12 following the standard UK refurbishment sequence.

export const PHASES = [
  { order: 1, name: "Demolition" },
  { order: 2, name: "Structural" },
  { order: 3, name: "Roofing" },
  { order: 4, name: "First Fix Carpentry" },
  { order: 5, name: "M&E First Fix" },
  { order: 6, name: "Plastering & Screeding" },
  { order: 7, name: "Second Fix Carpentry" },
  { order: 8, name: "M&E Second Fix" },
  { order: 9, name: "Tiling & Flooring" },
  { order: 10, name: "Decoration & Finishing" },
  { order: 11, name: "External Works" },
  { order: 12, name: "Snagging" },
] as const;

export const UNMATCHED_PHASE_ORDER = 6;

export function phaseName(order: number): string {
  return PHASES.find((p) => p.order === order)?.name ?? "Unassigned";
}

// Keyword → phase_order. Order matters: earlier matches win when overlapping.
const PHASE_KEYWORDS: Array<{ order: number; keywords: string[] }> = [
  { order: 1, keywords: ["demolition", "demo ", "strip out", "stripout", "soft strip", "break out", "breakout", "removal of"] },
  { order: 2, keywords: ["steel", "rsj", "beam", "lintel", "concrete", "foundation", "underpin", "structural", "joist", "block work", "blockwork", "brickwork", "rebar", "masonry"] },
  { order: 3, keywords: ["roof", "tile batten", "felt", "membrane", "slate", "gutter", "fascia", "soffit", "flashing", "chimney", "rooflight", "skylight"] },
  { order: 4, keywords: ["stud", "partition", "noggin", "first fix carpentry", "stud wall", "timber frame", "door lining", "door frame", "subfloor", "sub floor", "floorboard"] },
  { order: 5, keywords: ["first fix electric", "1st fix electric", "back box", "cable", "conduit", "trunking", "consumer unit", "first fix plumb", "1st fix plumb", "pipework", "copper pipe", "waste pipe", "soil pipe", "boiler", "radiator pipe"] },
  { order: 6, keywords: ["plaster", "skim", "render", "screed", "bonding", "plasterboard", "drylining", "dry lining", "scrim", "beading"] },
  { order: 7, keywords: ["second fix carpentry", "2nd fix carpentry", "skirting", "architrave", "door", "handle", "kitchen unit", "worktop", "wardrobe", "shelving"] },
  { order: 8, keywords: ["socket", "switch", "light fitting", "downlight", "pendant", "second fix electric", "2nd fix electric", "second fix plumb", "2nd fix plumb", "tap", "basin", "toilet", "wc", "shower", "bath", "radiator", "towel rail", "extractor"] },
  { order: 9, keywords: ["tile", "tiling", "grout", "adhesive", "vinyl", "lvt", "carpet", "underlay", "laminate", "engineered floor", "wood floor", "stone floor", "floor finish"] },
  { order: 10, keywords: ["paint", "primer", "undercoat", "emulsion", "gloss", "varnish", "wallpaper", "decoration", "filler", "caulk", "sealant"] },
  { order: 11, keywords: ["external", "paving", "patio", "driveway", "tarmac", "fence", "fencing", "landscap", "render external", "gate", "drainage", "soakaway", "kerb"] },
  { order: 12, keywords: ["snag", "snagging", "touch up", "touch-up", "final clean", "handover"] },
];

function normalise(s: string): string {
  return s.toLowerCase();
}

export function detectPhaseOrder(description: string): number | null {
  if (!description) return null;
  const t = normalise(description);
  // Score across all phases; pick the phase with the most keyword hits, ties
  // broken by earliest order.
  let best: { order: number; hits: number } | null = null;
  for (const { order, keywords } of PHASE_KEYWORDS) {
    let hits = 0;
    for (const kw of keywords) if (t.includes(kw)) hits++;
    if (hits > 0 && (!best || hits > best.hits)) best = { order, hits };
  }
  return best?.order ?? null;
}

// Light-weight scope element matcher: best token-overlap with title/description.
export type MinimalScopeElement = {
  id: string;
  title: string | null;
  description: string | null;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "of", "to", "a", "an", "in", "on", "at",
  "by", "or", "is", "be", "as", "new", "all", "any", "per", "incl", "ex",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

export function matchScopeElement(
  description: string,
  candidates: MinimalScopeElement[],
): { id: string; score: number } | null {
  if (!description || !candidates.length) return null;
  const t = tokens(description);
  if (t.size === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const text = `${c.title ?? ""} ${c.description ?? ""}`;
    const ct = tokens(text);
    if (ct.size === 0) continue;
    let overlap = 0;
    for (const w of t) if (ct.has(w)) overlap++;
    if (overlap > 0 && (!best || overlap > best.score)) best = { id: c.id, score: overlap };
  }
  // Require at least 2 overlapping tokens to count as a confident match.
  return best && best.score >= 2 ? best : null;
}

// Resolve scope_element_id + phase_order for a procurement description.
// Phase preference: scope-element-derived phase wins when available, else
// keyword scan on the description, else UNMATCHED_PHASE_ORDER.
export function classifyProcurement(
  description: string,
  scopeCandidates: MinimalScopeElement[],
): { scope_element_id: string | null; phase_order: number; matched: boolean } {
  const match = matchScopeElement(description, scopeCandidates);
  let phase: number | null = null;
  if (match) {
    const el = scopeCandidates.find((c) => c.id === match.id);
    if (el) phase = detectPhaseOrder(`${el.title ?? ""} ${el.description ?? ""}`);
  }
  if (phase == null) phase = detectPhaseOrder(description);
  return {
    scope_element_id: match?.id ?? null,
    phase_order: phase ?? UNMATCHED_PHASE_ORDER,
    matched: match != null || phase != null,
  };
}
