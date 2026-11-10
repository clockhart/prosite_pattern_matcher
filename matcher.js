// Semantic PROSITE pattern matching.
//
// A pattern is parsed into elements. Each element is a set of allowed residues
// (or the complement of a set, for {..}; or "anything" for x) plus a repeat range.
// A query matches a database pattern if some expansion of the query lines up,
// position by position, with a contiguous stretch of some expansion of the
// database pattern, where every aligned pair of positions can be the same residue.

// Parse a PROSITE pattern string into { nterm, cterm, elements }.
function parsePrositePattern(pattern) {
    let text = pattern.trim().replace(/\.$/, '');
    let nterm = false;
    let cterm = false;
    if (text.startsWith('<')) { nterm = true; text = text.slice(1); }
    if (text.endsWith('>')) { cterm = true; text = text.slice(0, -1); }

    const elements = [];
    for (const raw of text.split('-')) {
        if (raw === '') continue;
        const m = raw.match(/^(x|[A-Za-z]|\[[A-Za-z<>]+\]|\{[A-Za-z]+\})(?:\((\d+)(?:,(\d+))?\))?$/);
        if (!m) throw new Error(`Invalid PROSITE element: "${raw}"`);
        const [, body, lo, hi] = m;

        let neg = false;
        let letters = new Set();
        if (body === 'x') {
            neg = true; // complement of the empty set = anything
        } else if (body[0] === '[') {
            // A '>' inside [] means "or C-terminus"; the residue set is what matters here.
            letters = new Set(body.slice(1, -1).replace(/[<>]/g, ''));
        } else if (body[0] === '{') {
            neg = true;
            letters = new Set(body.slice(1, -1));
        } else {
            letters = new Set([body]);
        }

        const min = lo === undefined ? 1 : parseInt(lo, 10);
        const max = hi === undefined ? min : parseInt(hi, 10);
        if (max < min) throw new Error(`Invalid repeat range in "${raw}"`);
        elements.push({ neg, letters, min, max, text: raw });
    }
    if (elements.length === 0) throw new Error('Empty pattern');
    return { nterm, cterm, elements };
}

const isWildcard = e => e.neg && e.letters.size === 0; // x

// Can two residue positions be the same residue? In strict mode a specific query
// residue may not sit on a database wildcard (used to pick the most natural alignment
// to highlight; plain matching is not strict).
function compatible(a, b, strict = false) {
    if (strict && !isWildcard(a) && isWildcard(b)) return false;
    if (a.neg && b.neg) return true; // both exclude only a few of the 20 residues
    if (!a.neg && !b.neg) {
        for (const l of a.letters) if (b.letters.has(l)) return true;
        return false;
    }
    const pos = a.neg ? b : a;
    const neg = a.neg ? a : b;
    for (const l of pos.letters) if (!neg.letters.has(l)) return true;
    return false;
}

// Expand a pattern into every concrete list of positions (used for the short query).
function expandPattern(parsed, limit = 20000) {
    let results = [[]];
    for (const el of parsed.elements) {
        const next = [];
        for (const prefix of results) {
            for (let n = el.min; n <= el.max; n++) {
                next.push(prefix.concat(Array(n).fill(el)));
                if (next.length > limit) throw new Error('Query is too ambiguous to expand');
            }
        }
        results = next;
    }
    return results;
}

// Does the concrete position list `positions` fit inside some expansion of `db`?
// Returns { start, end } (indices of the first and last db elements it covers) or null.
function fitsInPattern(positions, db, anchorStart, anchorEnd, strict = false) {
    const els = db.elements;
    // State (i, c): c residues of element i consumed so far, next residue comes from
    // element i (if c < max) or, once c >= min, from element i + 1.
    const memo = new Map();

    function canFinish(i, c) {
        // All remaining elements must be skippable/completable.
        if (i >= els.length) return true;
        if (c < els[i].min) return false;
        for (let j = i + 1; j < els.length; j++) if (els[j].min > 0) return false;
        return true;
    }

    // Returns the index of the db element holding the last query position, or -1.
    function run(k, i, c) {
        if (k === positions.length) return (!anchorEnd || canFinish(i, c)) ? i : -1;
        const key = (k * (els.length + 1) + i) * 1024 + c;
        if (memo.has(key)) return memo.get(key);
        let end = -1;
        if (i < els.length) {
            if (c < els[i].max && compatible(positions[k], els[i], strict)) end = run(k + 1, i, c + 1);
            if (end < 0 && c >= els[i].min) end = run(k, i + 1, 0); // move on to the next element
        }
        memo.set(key, end);
        return end;
    }

    for (let i = 0; i < (anchorStart ? 1 : els.length); i++) {
        for (let c = 0; c < (anchorStart ? 1 : els[i].max); c++) {
            const end = run(0, i, c);
            if (end >= 0) return { start: i, end };
        }
    }
    return null;
}

// Does the query pattern describe a stretch that the database pattern can produce?
// Returns { start, end } (db element indices of the stretch it lines up with) or null.
function queryMatchesPattern(query, dbPattern) {
    const db = parsePrositePattern(dbPattern);
    const expansions = expandPattern(query);
    for (const strict of [true, false]) {
        for (const positions of expansions) {
            const span = fitsInPattern(positions, db, query.nterm, query.cterm, strict);
            if (span) return span;
        }
    }
    return null;
}

// Canonical text for exact comparison.
function normalizePattern(pattern) {
    return pattern.replace(/\./g, '').replace(/\s+/g, '');
}

// Returns matching entries, exact matches first. Each is a copy of the entry with
// `match` set to { exact: true } or { exact: false, start, end } (db element indices).
function searchPatterns(inputPattern, entries) {
    const query = parsePrositePattern(inputPattern);
    const normalizedInput = normalizePattern(inputPattern);
    const exact = [];
    const partial = [];
    for (const entry of entries) {
        if (normalizePattern(entry.pattern) === normalizedInput) {
            exact.push({ ...entry, match: { exact: true } });
            continue;
        }
        const span = queryMatchesPattern(query, entry.pattern);
        if (span) partial.push({ ...entry, match: { exact: false, ...span } });
    }
    return exact.concat(partial);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parsePrositePattern, queryMatchesPattern, searchPatterns };
}
