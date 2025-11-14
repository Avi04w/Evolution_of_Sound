// era_story.js
// internal era scroller + mini dot bar chart per era

(async function () {
    const d3 = window.d3;
    if (!d3) {
        console.warn("d3 not found for era_story.js");
        return;
    }

    // -------- era metadata (text + tags) --------

    const eras = [
        {
            id: "era-1980",
            label: "1980",
            title: "post-disco glow",
            subtitle: "synths and boogie basslines keep the floor moving.",
        },
        {
            id: "era-1985",
            label: "1985",
            title: "mtv pop + neon hooks",
            subtitle: ""
        },
        {
            id: "era-1990",
            label: "1990",
            title: "feedback and flannel",
            subtitle: "grunge surges while r&b ballads mellow the dial.",
        },
        {
            id: "era-1995",
            label: "1995",
            title: "neo-soul and britpop moods",
            subtitle: "organic grooves meet swaggering guitar choruses.",
        },
        {
            id: "era-2000",
            label: "2000",
            title: "pop maximalism 1.0",
            subtitle: "teen pop hooks and glossy hip-hop crossovers.",
        },
        {
            id: "era-2005",
            label: "2005",
            title: "electro swagger + pop punk",
            subtitle: "club-ready synths share space with arena guitars.",
        }
    ];

    const ALL_GENRE_KEY = "__all";
    const ERA_BUCKET_START = 1980;
    const ERA_BUCKET_END = 2010;
    const ERA_BUCKET_SIZE = 5;

    function assignEraRanges() {
        eras.forEach((era, idx) => {
            const baseYear = Number(era.label);
            if (!Number.isFinite(baseYear)) return;

            const nextEra = eras[idx + 1];
            const upperBound = nextEra
                ? Number(nextEra.label)
                : baseYear + ERA_BUCKET_SIZE;
            const clampedUpper = Math.min(ERA_BUCKET_END, upperBound);

            let rangeStart = baseYear + 1;
            let rangeEnd = clampedUpper;

            if (!Number.isFinite(rangeEnd)) {
                rangeStart = baseYear;
                rangeEnd = baseYear;
            } else if (rangeEnd < rangeStart) {
                rangeStart = rangeEnd;
            }

            era.rangeStart = rangeStart;
            era.rangeEnd = rangeEnd;
            era.rangeLabel =
                rangeStart === rangeEnd
                    ? `${rangeEnd}`
                    : `${rangeStart}-${rangeEnd}`;
        });
    }

    assignEraRanges();

    const terminalTick = {
        id: "era-terminal-2010",
        label: "2010",
        rangeLabel: "2010",
        isTerminal: true
    };
    const navTicks = eras.concat([terminalTick]);

    // -------- fake genre counts for each decade (top 5) --------
    // swap these for your real numbers later

    const ERA_GENRE_COUNTS = {
        "1980": [
            { genre: "synth-pop", count: 120 },
            { genre: "disco", count: 110 },
            { genre: "arena rock", count: 90 },
            { genre: "new wave", count: 70 },
            { genre: "power ballad", count: 50 }
        ],
        "1985": [
            { genre: "new wave", count: 130 },
            { genre: "electro-pop", count: 115 },
            { genre: "hair metal", count: 90 },
            { genre: "freestyle", count: 75 },
            { genre: "soft rock", count: 60 }
        ],
        "1990": [
            { genre: "grunge", count: 140 },
            { genre: "alt rock", count: 120 },
            { genre: "r&b", count: 100 },
            { genre: "rap", count: 95 },
            { genre: "dance pop", count: 75 }
        ],
        "1995": [
            { genre: "neo soul", count: 135 },
            { genre: "r&b", count: 120 },
            { genre: "trip-hop", count: 80 },
            { genre: "britpop", count: 70 },
            { genre: "pop rock", count: 65 }
        ],
        "2000": [
            { genre: "pop", count: 150 },
            { genre: "teen pop", count: 130 },
            { genre: "hip-hop", count: 110 },
            { genre: "trance", count: 95 },
            { genre: "r&b", count: 85 }
        ],
        "2005": [
            { genre: "electro pop", count: 145 },
            { genre: "crunk", count: 110 },
            { genre: "indie rock", count: 95 },
            { genre: "pop punk", count: 90 },
            { genre: "dance pop", count: 80 }
        ],
        "2010": [
            { genre: "edm", count: 155 },
            { genre: "trap", count: 135 },
            { genre: "pop", count: 120 },
            { genre: "dubstep", count: 95 },
            { genre: "indie", count: 85 }
        ]
    };

    const FEATURE_KEYS = [
        "acousticness",
        "danceability",
        "energy",
        "loudness",
        "speechiness",
        "tempo",
        "valence"
    ];

    const TRACK_METRICS = ["danceability", "energy", "valence"];

    const GENRE_THEMES = {
        "synth-pop": {
            bg: "#f5f8ff",
            border: "rgba(76, 110, 245, 0.25)",
            accent: "#5361ff",
            accentSoft: "#b3c0ff",
            pillBg: "rgba(83, 97, 255, 0.12)",
            text: "#0f172a"
        },
        "new wave": {
            bg: "#f6fbff",
            border: "rgba(59, 130, 246, 0.25)",
            accent: "#3b82f6",
            accentSoft: "#a5c4ff",
            pillBg: "rgba(59, 130, 246, 0.1)",
            text: "#0b1b33"
        },
        "alt rock": {
            bg: "#fff6f5",
            border: "rgba(255, 154, 118, 0.35)",
            accent: "#ff6b6b",
            accentSoft: "#ffc9ca",
            pillBg: "rgba(255, 107, 107, 0.12)",
            text: "#230d11"
        },
        grunge: {
            bg: "#fdf4f3",
            border: "rgba(255, 152, 109, 0.35)",
            accent: "#f97316",
            accentSoft: "#fed7aa",
            pillBg: "rgba(249, 115, 22, 0.14)",
            text: "#2b0f03"
        },
        "neo soul": {
            bg: "#f4faf5",
            border: "rgba(34, 197, 94, 0.25)",
            accent: "#16a34a",
            accentSoft: "#bbf7d0",
            pillBg: "rgba(22, 163, 74, 0.12)",
            text: "#052912"
        },
        pop: {
            bg: "#fef8ec",
            border: "rgba(255, 196, 102, 0.35)",
            accent: "#f59e0b",
            accentSoft: "#ffd8a3",
            pillBg: "rgba(245, 158, 11, 0.14)",
            text: "#291a05"
        },
        "electro-pop": {
            bg: "#f6f2ff",
            border: "rgba(139, 92, 246, 0.3)",
            accent: "#8b5cf6",
            accentSoft: "#c4b5fd",
            pillBg: "rgba(139, 92, 246, 0.12)",
            text: "#180633"
        },
        "electro pop": {
            bg: "#f6f2ff",
            border: "rgba(139, 92, 246, 0.3)",
            accent: "#8b5cf6",
            accentSoft: "#c4b5fd",
            pillBg: "rgba(139, 92, 246, 0.12)",
            text: "#180633"
        },
        trap: {
            bg: "#f4fbf8",
            border: "rgba(82, 214, 185, 0.35)",
            accent: "#10b981",
            accentSoft: "#9be6cc",
            pillBg: "rgba(16, 185, 129, 0.12)",
            text: "#022c1f"
        },
        "r&b": {
            bg: "#fff6f0",
            border: "rgba(248, 153, 124, 0.35)",
            accent: "#f97316",
            accentSoft: "#fed7aa",
            pillBg: "rgba(249, 115, 22, 0.12)",
            text: "#331305"
        },
        edm: {
            bg: "#f1f9ff",
            border: "rgba(59, 130, 246, 0.25)",
            accent: "#2563eb",
            accentSoft: "#93c5fd",
            pillBg: "rgba(59, 130, 246, 0.12)",
            text: "#031938"
        },
        "future bass": {
            bg: "#f5f0ff",
            border: "rgba(167, 139, 250, 0.35)",
            accent: "#a855f7",
            accentSoft: "#e9d5ff",
            pillBg: "rgba(168, 85, 247, 0.12)",
            text: "#25093f"
        },
        "tropical house": {
            bg: "#f0fbff",
            border: "rgba(45, 212, 191, 0.3)",
            accent: "#0ea5e9",
            accentSoft: "#99f6e4",
            pillBg: "rgba(14, 165, 233, 0.12)",
            text: "#05212e"
        },
        "bedroom pop": {
            bg: "#fff8fb",
            border: "rgba(248, 113, 113, 0.25)",
            accent: "#f472b6",
            accentSoft: "#fecdd3",
            pillBg: "rgba(244, 114, 182, 0.12)",
            text: "#381020"
        },
        default: {
            bg: "#ffffff",
            border: "rgba(15, 23, 42, 0.08)",
            accent: "#2563eb",
            accentSoft: "#93c5fd",
            pillBg: "rgba(37, 99, 235, 0.08)",
            text: "#0f172a"
        }
    };

    const dynamicThemeCache = new Map();
    const genreTokenCounts = new Map();
    const genreCanonicalCache = new Map();
    let canonicalGenreTokens = [];
    let canonicalGenreTokenSet = new Set();
    const canonicalTokenOverrides = new Map([
        ["hip", "hip-hop"],
        ["hop", "hip-hop"],
        ["r", "r&b"],
        ["b", "r&b"]
    ]);

    function tokenizeGenre(value) {
        return (value || "")
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean);
    }

    function canonicalizeGenre(rawGenre) {
        const value = (rawGenre || "").toLowerCase().trim();
        if (!value) return "";
        if (genreCanonicalCache.has(value)) return genreCanonicalCache.get(value);
        const tokens = tokenizeGenre(value);
        const useTokenSet = canonicalGenreTokenSet.size > 0;
        let bestToken = "";
        let bestCount = -Infinity;
        tokens.forEach(token => {
            if (useTokenSet && !canonicalGenreTokenSet.has(token)) return;
            const count = genreTokenCounts.get(token) || 0;
            if (count > bestCount) {
                bestToken = token;
                bestCount = count;
            }
        });
        if (!bestToken && tokens.length) {
            let fallbackToken = "";
            let fallbackCount = -Infinity;
            tokens.forEach(token => {
                const count = genreTokenCounts.get(token) || 0;
                if (count > fallbackCount) {
                    fallbackToken = token;
                    fallbackCount = count;
                }
            });
            bestToken = fallbackToken || tokens[0];
        }
        const canonicalBase = canonicalTokenOverrides.get(bestToken) || bestToken;
        const canonical = canonicalBase || value;
        genreCanonicalCache.set(value, canonical);
        return canonical;
    }

    function hashGenreToHue(str) {
        if (!str) return 210;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0; // force 32-bit int
        }
        const hue = Math.abs(hash) % 360;
        return hue;
    }

    function getThemeForGenre(rawGenre) {
        const key = canonicalizeGenre(rawGenre);
        if (!key) return GENRE_THEMES.default;
        if (GENRE_THEMES[key]) return GENRE_THEMES[key];
        if (dynamicThemeCache.has(key)) return dynamicThemeCache.get(key);

        const hue = hashGenreToHue(key);
        const accent = `hsl(${hue}, 70%, 45%)`;
        const accentSoft = `hsl(${hue}, 85%, 70%)`;
        const bg = `hsl(${hue}, 65%, 96%)`;
        const border = `hsla(${hue}, 60%, 40%, 0.25)`;
        const pillBg = `hsla(${hue}, 85%, 90%, 0.65)`;

        const theme = {
            bg,
            border,
            accent,
            accentSoft,
            pillBg,
            text: "#0f172a"
        };

        dynamicThemeCache.set(key, theme);
        return theme;
    }

    function formatFeatureValue(key, value) {
        if (!Number.isFinite(value)) return "—";
        if (key === "tempo") return `${Math.round(value)} bpm`;
        if (key === "loudness") return `${value.toFixed(1)} dB`;
        return `${Math.round(value * 100)}%`;
    }

    function normalizeFeatureValue(key, value, featureDomains) {
        if (!Number.isFinite(value)) return 0;
        const stats = featureDomains.get(key);
        if (!stats) return Math.min(Math.max(value, 0), 1);
        const span = stats.max - stats.min;
        if (span === 0) return 0;
        return Math.max(0, Math.min(1, (value - stats.min) / span));
    }

    function bucketLabelForYear(year) {
        if (!Number.isFinite(year)) return null;
        if (year < ERA_BUCKET_START || year > ERA_BUCKET_END) return null;
        const offset = Math.floor((year - ERA_BUCKET_START) / ERA_BUCKET_SIZE);
        const startYear = ERA_BUCKET_START + offset * ERA_BUCKET_SIZE;
        return startYear.toString();
    }

    function formatFeatureName(name) {
        if (!name) return "";
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    function getPrimaryGenre(label) {
        const decadeEntries = ERA_GENRE_COUNTS[label];
        if (!decadeEntries || !decadeEntries.length) return label;
        return canonicalizeGenre(decadeEntries[0].genre);
    }

    function formatGenreDisplay(genre) {
        if (!genre) return "";
        const lower = genre.toLowerCase();
        if (lower === "r&b" || lower === "rnb" || lower === "rnb/soul") {
            return "Rhythm and Blues";
        }
        return genre
            .split(/[\s-]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function formatDeltaText(key, delta) {
        if (!Number.isFinite(delta)) return "—";
        const sign = delta >= 0 ? "+" : "";
        if (key === "tempo") return `${sign}${delta.toFixed(1)} bpm vs era avg`;
        if (key === "loudness") return `${sign}${delta.toFixed(1)} dB vs era avg`;
        return `${sign}${Math.round(delta * 100)} pts vs era avg`;
    }

    function computeFeatureComparisons(
        era,
        bucketFeatureAverages,
        featureDomains
    ) {
        const labelMap = bucketFeatureAverages.get(era.label);
        if (!labelMap) return [];
        const genreAvg = labelMap.get(era.genreKey);
        const baseAvg = labelMap.get(ALL_GENRE_KEY);
        if (!genreAvg && !baseAvg) return [];
        const comparisons = FEATURE_KEYS.map(key => {
            const hasGenre = genreAvg && Number.isFinite(Number(genreAvg[key]));
            const hasBase = baseAvg && Number.isFinite(Number(baseAvg[key]));
            if (!hasGenre && !hasBase) {
                return null;
            }
            const genreValue = hasGenre
                ? Number(genreAvg[key])
                : Number(baseAvg[key]);
            const baseValue = hasBase
                ? Number(baseAvg[key])
                : Number(genreAvg[key]);
            return {
                key,
                genreValue,
                baseValue,
                delta: genreValue - baseValue,
                genrePercent: normalizeFeatureValue(key, genreValue, featureDomains),
                basePercent: normalizeFeatureValue(key, baseValue, featureDomains)
            };
        })
            .filter(Boolean)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        return comparisons;
    }

    async function loadBillboardSummary() {
        try {
            const raw = await d3.text("data/processed/billboard_full.ndjson");
            if (!raw) return {
                topGenres: new Map(),
                bucketFeatureAverages: new Map(),
                bucketTopTracks: new Map(),
                featureDomains: new Map()
            };

            genreTokenCounts.clear();
            canonicalGenreTokens = [];
            canonicalGenreTokenSet = new Set();
            genreCanonicalCache.clear();

            const lines = raw.split(/\n+/).filter(Boolean);
            const parsedEntries = [];
            const featureDomains = new Map();
            const yearlyLeaders = new Map();

            lines.forEach(line => {
                let record;
                try {
                    record = JSON.parse(line);
                } catch (err) {
                    return;
                }

                if (!record || !record.date) return;
                const year = new Date(record.date).getFullYear();
                const label = bucketLabelForYear(year);
                if (!label) return;

                const rawGenres = Array.isArray(record.genres)
                    ? record.genres
                    : record.genres
                        ? [record.genres]
                        : [];
                const cleanedGenres = rawGenres
                    .map(g => (g || "").toLowerCase().trim())
                    .filter(Boolean);

                cleanedGenres.forEach(rawKey => {
                    tokenizeGenre(rawKey).forEach(token => {
                        if (!token) return;
                        genreTokenCounts.set(
                            token,
                            (genreTokenCounts.get(token) || 0) + 1
                        );
                    });
                });

                const featureValues = {};
                FEATURE_KEYS.forEach(key => {
                    const rawVal = Number(record[key]);
                    if (!Number.isFinite(rawVal)) return;
                    featureValues[key] = rawVal;

                    const domain = featureDomains.get(key);
                    if (!domain) {
                        featureDomains.set(key, { min: rawVal, max: rawVal });
                    } else {
                        if (rawVal < domain.min) domain.min = rawVal;
                        if (rawVal > domain.max) domain.max = rawVal;
                    }
                });

                parsedEntries.push({
                    label,
                    genres: cleanedGenres,
                    features: featureValues
                });

                const peakRank = Number(record["peak-rank"]) || Number(record.rank) || 101;
                const weeks = Number(record["weeks-on-board"]) || 0;
                const score = (101 - Math.min(peakRank, 101)) * weeks;
                if (!Number.isFinite(score) || score <= 0) return;

                const artists = Array.isArray(record.artists)
                    ? record.artists.join(", ")
                    : record.artists || "Unknown";

                const summaryFeatures = {};
                FEATURE_KEYS.forEach(key => {
                    const val = Number(record[key]);
                    if (Number.isFinite(val)) summaryFeatures[key] = val;
                });

                const candidate = {
                    year,
                    name: record.name || "Untitled",
                    artists,
                    id: record.id || null,
                    score,
                    features: summaryFeatures
                };

                const existing = yearlyLeaders.get(year);
                if (!existing || candidate.score > existing.score) {
                    yearlyLeaders.set(year, candidate);
                }
            });

            const bucketGenreCounts = new Map();
            const bucketFeatureAcc = new Map();

            const canonicalTokenEntries = Array.from(genreTokenCounts.entries())
                .filter(([token, count]) => token.length >= 3 && count >= 20)
                .sort((a, b) => b[1] - a[1]);
            canonicalGenreTokens = canonicalTokenEntries
                .slice(0, 30)
                .map(([token]) => token);
            canonicalGenreTokenSet = new Set(canonicalGenreTokens);
            genreCanonicalCache.clear();

            parsedEntries.forEach(entry => {
                const { label, genres, features } = entry;
                const canonicalList = (genres.length
                    ? genres.map(canonicalizeGenre).filter(Boolean)
                    : []
                ) || [];
                const uniqueGenres =
                    canonicalList.length > 0
                        ? Array.from(new Set(canonicalList))
                        : ["unknown"];
                const finalGenres = uniqueGenres.concat([ALL_GENRE_KEY]);

                const genreCounts =
                    bucketGenreCounts.get(label) || new Map();
                finalGenres.forEach(genre => {
                    if (genre === ALL_GENRE_KEY) return;
                    genreCounts.set(
                        genre,
                        (genreCounts.get(genre) || 0) + 1
                    );
                });
                bucketGenreCounts.set(label, genreCounts);

                const labelFeatureMap =
                    bucketFeatureAcc.get(label) || new Map();
                finalGenres.forEach(genre => {
                    const featureMap =
                        labelFeatureMap.get(genre) || new Map();
                    FEATURE_KEYS.forEach(key => {
                        const rawVal = Number(features[key]);
                        if (!Number.isFinite(rawVal)) return;
                        const stats = featureMap.get(key) || {
                            sum: 0,
                            count: 0
                        };
                        stats.sum += rawVal;
                        stats.count += 1;
                        featureMap.set(key, stats);
                    });
                    labelFeatureMap.set(genre, featureMap);
                });
                bucketFeatureAcc.set(label, labelFeatureMap);
            });

            const topGenres = new Map();
            bucketGenreCounts.forEach((genreMap, label) => {
                if (!genreMap.size) return;
                let bestGenre = null;
                let bestCount = -Infinity;
                genreMap.forEach((count, genre) => {
                    if (genre === "unknown") return;
                    if (count > bestCount) {
                        bestCount = count;
                        bestGenre = genre;
                    }
                });
                if (!bestGenre) {
                    genreMap.forEach((count, genre) => {
                        if (count > bestCount) {
                            bestCount = count;
                            bestGenre = genre;
                        }
                    });
                }
                if (bestGenre) {
                    topGenres.set(label, bestGenre);
                }
            });

            const bucketFeatureAverages = new Map();
            bucketFeatureAcc.forEach((genreMap, label) => {
                const genreAverages = new Map();
                genreMap.forEach((featureMap, genre) => {
                    const averages = {};
                    FEATURE_KEYS.forEach(key => {
                        const stats = featureMap.get(key);
                        if (stats && stats.count) {
                            averages[key] = stats.sum / stats.count;
                        }
                    });
                    genreAverages.set(genre, averages);
                });
                bucketFeatureAverages.set(label, genreAverages);
            });

            const bucketTopTracks = new Map();
            eras.forEach((era, idx) => {
                const baseYear = Number(era.label);
                const startYear = Number.isFinite(baseYear) ? baseYear : 0;
                const nextEra = eras[idx + 1];
                const rawUpper = nextEra
                    ? Number(nextEra.label)
                    : startYear + ERA_BUCKET_SIZE;
                const upperBound = Number.isFinite(rawUpper)
                    ? rawUpper
                    : startYear + ERA_BUCKET_SIZE;
                const endYear = Math.max(
                    startYear,
                    Math.min(ERA_BUCKET_END, upperBound - 1)
                );
                const list = [];
                for (let year = startYear; year <= endYear; year++) {
                    const entry = yearlyLeaders.get(year);
                    if (entry) list.push(entry);
                }
                bucketTopTracks.set(era.label, list);
            });

            FEATURE_KEYS.forEach(key => {
                if (!featureDomains.has(key)) {
                    featureDomains.set(key, { min: 0, max: 1 });
                }
            });

            return {
                topGenres,
                bucketFeatureAverages,
                bucketTopTracks,
                featureDomains
            };
        } catch (err) {
            console.warn("Failed to load billboard genres", err);
            return {
                topGenres: new Map(),
                bucketFeatureAverages: new Map(),
                bucketTopTracks: new Map(),
                featureDomains: new Map()
            };
        }
    }

    const {
        topGenres: topGenreMap,
        bucketFeatureAverages,
        bucketTopTracks,
        featureDomains
    } = await loadBillboardSummary();

    let featuredKeys = new Set();

    eras.forEach((era, idx) => {
        const inferredGenre = topGenreMap.get(era.label);
        const fallbackGenre = getPrimaryGenre(era.label);
        const resolvedGenre =
            canonicalizeGenre(inferredGenre || fallbackGenre) || "pop";
        const displayGenre = formatGenreDisplay(resolvedGenre);
        const theme = getThemeForGenre(resolvedGenre);
        const featureAverageMap =
            bucketFeatureAverages.get(era.label) || new Map();
        era.primaryGenre = displayGenre;
        era.genreKey = resolvedGenre;
        era.theme = theme;
        era.topTracks = bucketTopTracks.get(era.label) || [];
        era.featureAverages = featureAverageMap;
        const comparisons = computeFeatureComparisons(
            era,
            bucketFeatureAverages,
            featureDomains
        );
        const preferredComparisons = comparisons
            .filter(entry => !featuredKeys.has(entry.key))
            .slice(0, 3);
        if (preferredComparisons.length < 3) {
            comparisons.some(entry => {
                if (preferredComparisons.length >= 3) return true;
                if (!preferredComparisons.includes(entry)) {
                    preferredComparisons.push(entry);
                }
                return false;
            });
        }
        preferredComparisons.forEach(entry => featuredKeys.add(entry.key));
        era.featureComparisons = preferredComparisons;
    });

    const idToIndex = new Map(eras.map((d, i) => [d.id, i]));

    // -------- timeline nav svg --------

    const navSvg = d3.select("#era-nav");
    if (navSvg.empty()) return; // section might not exist

    const navWidth = +navSvg.attr("width");
    const navHeight = +navSvg.attr("height");
    const margin = { top: 80, bottom: 40 };

    const yScale = d3
        .scalePoint(
            navTicks.map(d => d.id),
            [margin.top, navHeight - margin.bottom]
        )
        .padding(0.7);

    navSvg
        .append("line")
        .attr("class", "nav-line")
        .attr("x1", navWidth / 2)
        .attr("x2", navWidth / 2)
        .attr("y1", yScale.range()[0])
        .attr("y2", yScale.range()[1]);

    const intervalData = eras.map((d, i) => {
        const next = eras[i + 1];
        const y0 = yScale(d.id);
        const y1 = next ? yScale(next.id) : yScale.range()[1];
        return { era: d, index: i, y0, y1 };
    });

    const intervalSegments = navSvg
        .append("g")
        .attr("class", "nav-intervals")
        .selectAll("line")
        .data(intervalData)
        .join("line")
        .attr("class", "nav-interval")
        .attr("x1", navWidth / 2)
        .attr("x2", navWidth / 2)
        .attr("y1", d => d.y0)
        .attr("y2", d => d.y1)
        .on("click", (event, d) => setActiveByIndex(d.index));

    const dotGroup = navSvg
        .append("g")
        .attr("transform", `translate(${navWidth / 2},0)`);

    const ticks = dotGroup
        .selectAll("g.nav-tick")
        .data(navTicks)
        .join("g")
        .attr("class", "nav-tick")
        .attr("transform", d => `translate(0, ${yScale(d.id)})`)
        .on("click", (event, d) => {
            const idx = idToIndex.get(d.id);
            if (idx != null) setActiveByIndex(idx);
        });

    ticks
        .append("circle")
        .attr("class", "nav-dot")
        .attr("cx", 0)
        .attr("cy", 0);

    ticks
        .append("text")
        .attr("class", "nav-label")
        .attr("x", 12)
        .attr("y", 0)
        .attr("text-anchor", "start")
        .text(d => d.label);

    // -------- panels (text + pill row + genre viz container) --------

    const panelContainer = d3.select("#era-panels");

    const panels = panelContainer
        .selectAll(".era-panel")
        .data(eras)
        .join("section")
        .attr("class", "era-panel")
        .attr("id", d => d.id)
        .attr("data-era-label", d => d.label);

    const shell = panels
        .append("div")
        .attr("class", "era-panel-inner")
        .each(function (d) {
            const theme = d.theme || GENRE_THEMES.default;
            d3.select(this)
                .style("--panel-bg", theme.bg)
                .style("--panel-border", theme.border)
                .style("--panel-accent", theme.accent)
                .style("--panel-accent-soft", theme.accentSoft || theme.accent)
                .style("--panel-pill-bg", theme.pillBg)
                .style("--panel-text", theme.text);
        });

    const header = shell.append("div").attr("class", "era-panel-header");

    header
        .append("span")
        .attr("class", "era-era-tag")
        .text(d => d.rangeLabel || d.label);
    header
        .append("h2")
        .attr("class", "era-genre-name")
        .text(d => d.primaryGenre);
    // description removed per latest design

    const chartBlock = shell.append("div").attr("class", "era-chart-block");

    chartBlock.append("h3").attr("class", "block-title").text("Feature Highlights");

    const featureCardsContainer = chartBlock
        .append("div")
        .attr("class", "era-feature-cards")
        .each(function (d) {
            const container = d3.select(this);
            container.html("");
            const cardsData = d.featureComparisons || [];
            if (!cardsData.length) {
                container
                    .append("p")
                    .attr("class", "feature-card-placeholder")
                    .text("Feature data unavailable for this era.");
                return;
            }

            const cards = container
                .selectAll(".feature-card")
                .data(cardsData)
                .join("div")
                .attr("class", "feature-card");

            const headers = cards
                .append("div")
                .attr("class", "feature-card__header");

            headers
                .append("span")
                .attr("class", "feature-card__label")
                .text(item => formatFeatureName(item.key));

            headers
                .append("span")
                .attr("class", "feature-card__delta")
                .text(item => formatDeltaText(item.key, item.delta));

            const progress = cards
                .append("div")
                .attr("class", "feature-progress");

            progress
                .append("div")
                .attr("class", "feature-progress__baseline")
                .style("width", d =>
                    `${Math.round(Math.max(0, Math.min(1, d.basePercent || 0)) * 100)}%`
                );

            progress
                .append("div")
                .attr("class", "feature-progress__value")
                .style("width", d =>
                    `${Math.round(Math.max(0, Math.min(1, d.genrePercent || 0)) * 100)}%`
                );

            const values = cards
                .append("div")
                .attr("class", "feature-card__values");

            values
                .append("span")
                .attr("class", "feature-card__value feature-card__value--genre")
                .text(item => formatFeatureValue(item.key, item.genreValue));

            values
                .append("span")
                .attr("class", "feature-card__value feature-card__value--baseline")
                .text(item => `Era avg ${formatFeatureValue(item.key, item.baseValue)}`);
        });

    /*
    const legacyChartBlock = shell.append("div").attr("class", "era-legacy-chart");
    legacyChartBlock
        .append("h3")
        .attr("class", "block-title")
        .text("Legacy Feature Profile");
    legacyChartBlock.append("div").attr("class", "era-legacy-chart__viz");
    */
    const tracksBlock = shell.append("div").attr("class", "era-tracks-block");

    tracksBlock
        .append("h3")
        .attr("class", "block-title")
        .text(d => `Top ${d.primaryGenre || "era"} Songs in This Era`);

    const tracksWrap = tracksBlock.append("div").attr("class", "era-top-tracks");

    const trackCards = tracksWrap
        .selectAll(".era-track")
        .data(d => d.topTracks)
        .join("div")
        .attr("class", "era-track")
        .on("click", function (event, d) {
            const wrap = d3.select(this.parentNode);
            wrap.selectAll(".era-track").classed("is-selected", false);
            d3.select(this).classed("is-selected", true);
            if (typeof showSpotifyPlayer === "function" && d?.id) {
                showSpotifyPlayer(d.id);
            }
        });

    trackCards
        .append("span")
        .attr("class", "track-year")
        .text(d => d.year);

    trackCards
        .append("div")
        .attr("class", "track-title")
        .text(d => d.name);

    trackCards
        .append("div")
        .attr("class", "track-artists")
        .text(d => d.artists || "Unknown");

    let updateGenreChart = null;
    let chartSvg = null;

    // Legacy bar chart intentionally commented out for now.

    // -------- active era state + interactions --------

    let currentIndex = 0;

    function setActiveByIndex(idx) {
        const clamped = Math.max(0, Math.min(eras.length - 1, idx));
        currentIndex = clamped;

        const activeEra = eras[currentIndex];

        // update active classes
        const lastTickIndex = navTicks.length - 1;
        ticks.classed("active", (d, i) => {
            if (d.isTerminal) {
                return currentIndex === eras.length - 1 && i === lastTickIndex;
            }
            const nextIndex = Math.min(currentIndex + 1, lastTickIndex);
            return i === currentIndex || i === nextIndex;
        });
        intervalSegments.classed("active", (d, i) => i === currentIndex);
        panels.classed("active", d => d.id === activeEra.id);

        // move the chart svg into the active panel's legacy container
        if (chartSvg) {
            const hostSel = d3
                .select("#" + activeEra.id)
                .select(".era-legacy-chart__viz");

            const hostNode = hostSel.node();
            const svgNode = chartSvg.node();
            if (hostNode && svgNode && svgNode.parentNode !== hostNode) {
                hostNode.appendChild(svgNode);
            }
        }

        // animate the mini chart to this decade
        if (updateGenreChart) {
            updateGenreChart(activeEra.label, activeEra.theme, activeEra.genreKey);
        }
    }

    // initial active state
    const initialLastTickIndex = navTicks.length - 1;
    ticks.classed("active", (d, i) => {
        if (d.isTerminal) {
            return currentIndex === eras.length - 1 && i === initialLastTickIndex;
        }
        const nextIndex = Math.min(currentIndex + 1, initialLastTickIndex);
        return i === currentIndex || i === nextIndex;
    });
    panels.classed("active", (d, i) => i === currentIndex);

    // also run through the full setter once so it attaches the svg to the active panel
    setActiveByIndex(0);

    const eraSection = document.querySelector(".era-layout");
    const pageScroller = document.querySelector(".pageScroller");

    if (eraSection) {
        eraSection.addEventListener("mouseenter", () => {
            if (pageScroller) pageScroller.classList.add("no-snap");
        });

        eraSection.addEventListener("mouseleave", () => {
            if (pageScroller) pageScroller.classList.remove("no-snap");
        });

        let scrollLocked = false;

        eraSection.addEventListener(
            "wheel",
            evt => {
                if (scrollLocked) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
                if (evt.deltaY === 0) return;

                const direction = evt.deltaY > 0 ? 1 : -1;
                const atTop = currentIndex === 0;
                const atBottom = currentIndex === eras.length - 1;

                if (atTop && direction < 0) {
                    if (pageScroller) pageScroller.classList.remove("no-snap");
                    return;
                }

                if (atBottom && direction > 0) {
                    if (pageScroller) pageScroller.classList.remove("no-snap");
                    return;
                }

                const targetIndex = currentIndex + direction;
                if (targetIndex >= 0 && targetIndex < eras.length) {
                    evt.preventDefault();
                    evt.stopPropagation();

                    setActiveByIndex(targetIndex);

                    scrollLocked = true;
                    setTimeout(() => {
                        scrollLocked = false;
                    }, 420);
                }
            },
            { passive: false }
        );
    }

    document.addEventListener("keydown", evt => {
        if (!eraSection || !document.body.contains(eraSection)) return;

        const rect = eraSection.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inView) return;

        if (evt.key === "ArrowDown" || evt.key === "PageDown") {
            setActiveByIndex(currentIndex + 1);
        } else if (evt.key === "ArrowUp" || evt.key === "PageUp") {
            setActiveByIndex(currentIndex - 1);
        }
    });
})();
