
// Precompute regex for each pattern
// patterns.js must be source first!!
prositePatterns.forEach(patternObj => {
    patternObj.regex = convertPrositeToRegex(patternObj.pattern);
});


// Function to find matches
function findMatches() {
    const inputPattern = document.getElementById('patternInput').value.trim();

    if (!inputPattern) {
        alert('Please enter a Prosite pattern.');
        return;
    }

    try {
        // Convert input to regex
        const inputRegex = convertPrositeToRegex(inputPattern);

        // Perform exact matching
        const exactMatches = prositePatterns.filter(({ regex }) =>
            inputRegex.source == regex.source
        );

        // Perform regex matching
        const regexMatches = prositePatterns.filter(({ regex }) =>
            inputRegex.test(regex.source)
        );

        // Combine matches, ensuring no duplicates
        const combinedMatches = [
            ...exactMatches,
            ...regexMatches.filter(({ id }) => !exactMatches.some(match => match.id === id)),
        ];

        displayResults(combinedMatches);
    } catch (error) {
        alert('Invalid Prosite pattern. ', inputPattern);
        console.error(error);
    }
}

// Convert Prosite pattern to regex
function convertPrositeToRegex(pattern) {
    // Escape any regex meta-characters not part of Prosite
    let regex = pattern
        .replace(/\./g, '') // Remove periods
        .replace(/<([A-Zx\[\{\}\-\(\)]+)/g, '^$1') // N-terminal
        .replace(/([A-Zx\[\{\}\-\(\)]+)>/g, '$1$') // C-terminal
        .replace(/\-/g, '') // Remove separators
        .replace(/x/g, '.') // Wildcard
        .replace(/\[([A-Z>]+)\]/g, '[$1]') // Square brackets
        .replace(/\{([A-Z]+)\}/g, '[^$1]') // Curly brackets
        .replace(/([A-Z\]\}])\((\d+)\)/g, '$1{$2}') // Single repeat
        .replace(/([A-Z\]\}])\((\d+),(\d+)\)/g, '$1{$2,$3}') // Range repeat
        .replace(/\[([A-Z]+)\>\]/g, '(?:[$1]|$)'); // Handle > inside []

    return new RegExp(regex);
}

// Display results
function displayResults(matches) {
    const resultsDiv = document.getElementById('results');
    if (matches.length === 0) {
        resultsDiv.innerHTML = '<p>No matches found.</p>';
    } else {
        resultsDiv.innerHTML = `
            <p>Found ${matches.length} match(es):</p>
            <ul>
                ${matches.map(
                    ({ id, pattern }) =>
                        `<li><strong>ID:</strong> <a href="https://prosite.expasy.org/${id}">${id}</a> <br><strong>Pattern:</strong> ${pattern}</li>`
                ).join('')}
            </ul>
        `;
    }
}

