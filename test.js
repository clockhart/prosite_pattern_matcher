// Run with: node test.js
const assert = require('assert');
const fs = require('fs');
const { parsePrositePattern, queryMatchesPattern, searchPatterns } = require('./matcher.js');

const PS00028 = 'C-x(2,4)-C-x(3)-[LIVMFYWC]-x(8)-H-x(3,5)-H.';
const q = p => parsePrositePattern(p);
const cases = [
    // [query, db pattern, expected]
    ['C-x-x-C', PS00028, true],                 // reported bug: x(2,4) can be x(2)
    ['C-x-x-x-C', PS00028, true],
    ['C-x-x-x-x-C', PS00028, true],
    ['C-x-C', PS00028, true],                   // x can be any residue, including C
    ['A-x(3)-G', 'A-x(2,4)-G.', true],
    ['A-x(5)-G', 'A-x(2,4)-G.', false],         // x(2,4) cannot reach 5
    ['A-x(1)-G', 'A-x(2,4)-G.', true],          // x is a wildcard, so G can sit on an x slot
    ['C-x(2,4)-C', PS00028, true],
    ['H-x(3,5)-H', PS00028, true],              // sub-motif at the end
    ['C-x(3)-L', PS00028, true],                // [LIVMFYWC] contains L
    ['C-x(3)-K', 'C-x(3)-[LIVM]', false],
    ['C-x(3)-[LK]', 'C-x(3)-[LIVM]', true],     // sets overlap
    ['C-x(3)-{LIVM}', 'C-x(3)-[LIVM]', false],  // complement excludes the whole set
    ['C-x(3)-{LI}', 'C-x(3)-[LIVM]', true],
    ['<C', PS00028, true],                      // unanchored db pattern can occur at the N-terminus
    ['N-{P}-[ST]-{P}', 'N-{P}-[ST]-{P}.', true],
    ['N-x-S', 'N-{P}-[ST]-{P}.', true],
    ['N-P-S', 'N-{P}-[ST]-{P}.', false],
    ['<A-x', '<A-x(2)-G.', true],
    ['<G', '<A-x(2)-G.', false],
    ['G>', '<A-x(2)-G>', true],
    ['A>', '<A-x(2)-G>', false],
    ['[RK](2)-x-[ST]', '[RK](2)-x-[ST].', true],
];

for (const [query, db, expected] of cases) {
    assert.strictEqual(queryMatchesPattern(q(query), db) !== null, expected, `${query} vs ${db}: expected ${expected}`);
}

// Which part of the db pattern the query lines up with (element indices).
assert.deepStrictEqual(queryMatchesPattern(q('C-x-x-C'), PS00028), { start: 0, end: 2 });
assert.deepStrictEqual(queryMatchesPattern(q('H-x(3,5)-H'), PS00028), { start: 6, end: 8 });
assert.deepStrictEqual(queryMatchesPattern(q('<A-x'), '<A-x(2)-G.'), { start: 0, end: 1 });

// Against the real data: the reported query finds PS00028, exact match sorts first.
const source = fs.readFileSync('./patterns.js', 'utf8');
const entries = new Function(source + '; return prositePatterns;')();
const hits = searchPatterns('C-x-x-C', entries).map(e => e.id);
assert(hits.includes('PS00028'), 'C-x-x-C should find PS00028');
const exact = searchPatterns(PS00028, entries)[0];
assert.strictEqual(exact.id, 'PS00028', 'exact match should be first');
assert.deepStrictEqual(exact.match, { exact: true });
assert.strictEqual(hits.length > 0 && searchPatterns('C-x-x-C', entries).find(e => e.id === 'PS00028').match.exact, false);
// every real pattern is a whole pattern now (none left ending in a dangling '-')
assert(entries.every(e => e.pattern.endsWith('.') && e.description && e.name), 'incomplete entry');
for (const e of entries) parsePrositePattern(e.pattern);
// statistics: counted in proteins, so true + unknown + false positives add up to the total
for (const e of entries) {
    if (!e.stats) continue;
    const { total, positive, unknown, falsePositive } = e.stats;
    assert.strictEqual(positive + unknown + falsePositive, total, `${e.id} stats don't add up`);
}
// a few motifs (very common ones, and any with no Swiss-Prot hits) have no statistics
assert(entries.filter(e => !e.stats).length < 30, 'too many entries without statistics');
assert(entries.find(e => e.id === 'PS00028').stats.total > 0);

console.log(`all tests passed (C-x-x-C -> ${hits.length} hits)`);
