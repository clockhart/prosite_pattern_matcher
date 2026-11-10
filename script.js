// patterns.js and matcher.js must be sourced first!!
const allPatterns = prositePatterns;
const PAGE_SIZE = 50;

const form = document.getElementById('searchForm');
const input = document.getElementById('patternInput');
const errorEl = document.getElementById('error');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const showMoreBtn = document.getElementById('showMore');

document.getElementById('release').textContent = `Data: PROSITE release ${prositeRelease}`;

let currentMatches = [];
let shown = 0;

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// live = true when triggered by typing: half-typed patterns are normal there, so
// stay quiet (keep the previous results) instead of showing errors.
function findMatches(live = false) {
    const inputPattern = input.value.trim();
    errorEl.hidden = true;

    if (!inputPattern) {
        if (live) clearResults();
        else showError('Please enter a Prosite pattern.');
        return;
    }

    try {
        currentMatches = searchPatterns(inputPattern, allPatterns);
    } catch (error) {
        if (!live) showError(`That doesn't look like a valid Prosite pattern: ${error.message}`);
        return;
    }
    shown = 0;
    resultsEl.innerHTML = '';
    renderMore();
}

function clearResults() {
    currentMatches = [];
    shown = 0;
    summaryEl.hidden = true;
    resultsEl.innerHTML = '';
    showMoreBtn.hidden = true;
}

function showError(message) {
    clearResults();
    errorEl.textContent = message;
    errorEl.hidden = false;
}

// The raw pattern text, with the stretch that lined up with the query marked.
function patternHtml(entry) {
    const parsed = parsePrositePattern(entry.pattern);
    const texts = parsed.elements.map(e => escapeHtml(e.text));
    const { match } = entry;
    let body;
    if (match.exact) {
        body = texts.join('-');
    } else {
        const before = texts.slice(0, match.start);
        const after = texts.slice(match.end + 1);
        body = [...before, `<mark>${texts.slice(match.start, match.end + 1).join('-')}</mark>`, ...after].join('-');
    }
    return (parsed.nterm ? '&lt;' : '') + body + (parsed.cterm ? '&gt;' : '') + '.';
}

// Hits against UniProtKB/Swiss-Prot, counted in proteins.
// Each number links to the list of those proteins on the motif's PROSITE page.
function statsHtml(entry) {
    const { stats } = entry;
    if (!stats) return '<div class="meta stats">No PROSITE statistics available for this motif.</div>';
    const n = x => x.toLocaleString();
    const link = (anchor, html) =>
        `<a href="https://prosite.expasy.org/${entry.id}#${anchor}" target="_blank" rel="noopener">${html}</a>`;
    const parts = [
        link('cross_ref', `<strong>${n(stats.total)}</strong> Swiss-Prot proteins hit`),
        link('TP', `${n(stats.positive)} true positive${stats.positive === 1 ? '' : 's'}`),
        link('FP', `${n(stats.falsePositive)} false positive${stats.falsePositive === 1 ? '' : 's'}`),
    ];
    if (stats.unknown) parts.push(link('unknown', `${n(stats.unknown)} unknown`));
    if (stats.falseNegative !== null) parts.push(link('FN', `${n(stats.falseNegative)} missed`));
    return `<div class="meta stats" title="PROSITE statistics against UniProtKB/Swiss-Prot, counted in proteins">${parts.join(' · ')}</div>`;
}

function cardHtml(entry) {
    const docLink = entry.doc
        ? `<a href="https://prosite.expasy.org/${entry.doc}" target="_blank" rel="noopener">Read the documentation ↗</a>`
        : '';
    return `<li class="result">
        <div class="title">${escapeHtml(entry.description)}</div>
        <div class="meta"><a href="https://prosite.expasy.org/${entry.id}" target="_blank" rel="noopener">${entry.id} ↗</a> · ${escapeHtml(entry.name)}</div>
        <code>${patternHtml(entry)}</code>
        ${statsHtml(entry)}
        ${docLink ? `<div class="meta doc">${docLink}</div>` : ''}
    </li>`;
}

// Render the next page of results.
function renderMore() {
    const batch = currentMatches.slice(shown, shown + PAGE_SIZE);
    resultsEl.insertAdjacentHTML('beforeend', batch.map(cardHtml).join(''));
    shown += batch.length;

    summaryEl.hidden = false;
    summaryEl.innerHTML = currentMatches.length === 0
        ? 'No matches found.'
        : `<strong>${currentMatches.length} match${currentMatches.length === 1 ? '' : 'es'}</strong> · exact matches first`;

    const remaining = currentMatches.length - shown;
    showMoreBtn.hidden = remaining <= 0;
    showMoreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} left)`;
}

form.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(typingTimer);
    findMatches();
});

// Search as you type, after a short pause so fast typing doesn't search on every key.
let typingTimer;
input.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => findMatches(true), 120);
});
showMoreBtn.addEventListener('click', renderMore);

// Clicking the title resets the page.
document.getElementById('home').addEventListener('click', event => {
    event.preventDefault();
    clearTimeout(typingTimer);
    input.value = '';
    errorEl.hidden = true;
    clearResults();
    input.focus();
});
document.querySelectorAll('[data-example]').forEach(button => {
    button.addEventListener('click', () => {
        input.value = button.dataset.example;
        findMatches();
    });
});
