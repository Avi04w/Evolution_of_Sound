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
        },
        {
            id: "era-2010",
            label: "2010",
            title: "edm crescendos + trap drops",
            subtitle: "super-saw synths and booming 808s dominate playlists.",
        },
        {
            id: "era-2015",
            label: "2015",
            title: "streaming pop + alt-r&b haze",
            subtitle: "minimal beats and moody hooks rule the feeds.",
        }
    ];

    const ALL_GENRE_KEY = "__all";
    const ERA_BUCKET_START = 1980;
    const ERA_BUCKET_END = 2020;
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
        id: "era-terminal-2020",
        label: "2020",
        rangeLabel: "2020",
        isTerminal: true
    };
    const navTicks = eras.concat([terminalTick]);

    // const ERA_GENRE_COUNTS = { /* removed fake counts */ };

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
    let updateGenreChart = null;
    let chartSvg = null;

    const FEATURE_HIGHLIGHT_OVERRIDES = {
        Rock: [
            { title: "Low danceability", detail: "riff-first, less groove-led" },
            { title: "High loudness", detail: "cranked amps and big drums" },
            { title: "High energy", detail: "driving, intense arrangements" }
        ],
        "Rock/Metal": [
            { title: "Low danceability", detail: "riff-first, less groove-led" },
            { title: "High loudness", detail: "cranked amps and big drums" },
            { title: "High energy", detail: "driving, intense arrangements" }
        ],
        "R&B": [
            { title: "High danceability", detail: "built for smooth grooves" },
            { title: "Low acousticness", detail: "polished, electric textures" },
            { title: "High loudness", detail: "radio-ready punch" }
        ],
        "R&B/Soul/Funk": [
            { title: "High danceability", detail: "built for smooth grooves" },
            { title: "Low acousticness", detail: "polished, electric textures" },
            { title: "High loudness", detail: "radio-ready punch" }
        ],
        "Electronic/Dance": [
            { title: "Low acousticness", detail: "synth-forward, fewer unplugged textures" },
            { title: "High valence", detail: "bright, euphoric moods" },
            { title: "High danceability", detail: "club-ready bounce" }
        ],
        "Hip-Hop": [
            { title: "High tempo", detail: "uptempo beats" },
            { title: "High energy", detail: "driving percussion" },
            { title: "Low valence", detail: "grittier, moodier tone" }
        ],
        Pop: [
            { title: "High danceability", detail: "catchy, groove-friendly" },
            { title: "High loudness", detail: "polished, loud masters" },
            { title: "Low speechiness", detail: "sung hooks over spoken vocals" }
        ],
        Country: [
            { title: "Low speechiness", detail: "sung storytelling over talky vocals" },
            { title: "High tempo", detail: "uptempo twang and shuffle" },
            { title: "High acousticness", detail: "unplugged warmth and strings" }
        ],
        "Country/Folk/Americana": [
            { title: "Low speechiness", detail: "sung storytelling over talky vocals" },
            { title: "High tempo", detail: "uptempo twang and shuffle" },
            { title: "High acousticness", detail: "unplugged warmth and strings" }
        ]
    };

    function interpretOverride(item) {
        if (!item || !item.title) return { direction: null, label: item?.title || "" };
        const m = item.title.match(/^\s*(high|low)\s+(.*)/i);
        if (!m) return { direction: null, label: item.title };
        const direction = m[1].toLowerCase();
        const label = m[2].trim();
        return { direction, label };
    }

    function renderUnknownGenreDebug(unknownCounts, missingCount = 0) {
        const hasUnknown =
            unknownCounts && unknownCounts.size && unknownCounts.size > 0;
        const hasMissing = Number.isFinite(missingCount) && missingCount > 0;
        if (!hasUnknown && !hasMissing) return;
        const sorted = Array.from(unknownCounts.entries()).sort(
            (a, b) => (b[1] || 0) - (a[1] || 0)
        );
        const host = document.createElement("section");
        host.className = "genre-debug-banner";
        host.style.margin = "24px auto";
        host.style.maxWidth = "900px";
        host.style.padding = "16px 18px";
        host.style.border = "1px dashed #e11d48";
        host.style.background = "#fff1f2";
        host.style.color = "#9f1239";
        host.style.fontFamily = "monospace";
        host.style.borderRadius = "12px";
        host.style.lineHeight = "1.4";
        const title = document.createElement("div");
        title.textContent = "Unknown supergenre mappings (raw genre : count)";
        title.style.fontWeight = "700";
        title.style.marginBottom = "8px";
        host.appendChild(title);
        if (hasMissing) {
            const missing = document.createElement("div");
            missing.textContent = `Rows with no genre provided: ${missingCount}`;
            missing.style.marginBottom = "6px";
            host.appendChild(missing);
        }
        if (hasUnknown) {
            const pre = document.createElement("pre");
            pre.style.whiteSpace = "pre-wrap";
            pre.style.margin = 0;
            pre.textContent = sorted
                .map(([genre, count]) => `${genre || "—"} : ${count || 0}`)
                .join("\n");
            host.appendChild(pre);
        }
        const target =
            document.querySelector(".era-layout") || document.body.firstChild;
        if (target && target.parentNode) {
            target.parentNode.insertBefore(host, target);
        } else {
            document.body.appendChild(host);
        }
    }

    // ----- supergenre mapping shared with universe (js/vis_universe_modules/DataManager.js) -----
    const SUPERGENRE_ORDER = [
        // "Pop",
        // "Hip-Hop/Rap",
        // "Rock/Metal",
        // "Electronic/Dance",
        // "R&B/Soul/Funk",
        // "Country/Folk/Americana",
        // "Latin",
        // "Reggae/Caribbean",
        // "Jazz/Blues",
        // "Other/Unknown"
        "Pop",
        "Hip-Hop",
        "Rock",
        "Electronic/Dance",
        "R&B",
        "Country",
        "Latin",
        "Reggae",
        "Jazz",
        "Other/Unknown"
    ];

    function toSuperGenre(genre) {
        const s = (genre || "Unknown").toLowerCase();
        const includesAny = list => list.some(token => s.includes(token));

        // hip-hop and rap families
        if (
            includesAny([
                "hip hop",
                "hip-hop",
                "rap",
                "drill",
                "trap",
                "grime",
                "crunk",
                "boom bap",
                "bounce",
                "hyphy",
                "baltimore club",
                "horrorcore",
                "shatta",
                "azonto"
            ])
        ) {
            // return "Hip-Hop/Rap";
            return "Hip-Hop";
        }

        // rock + alt + metal
        if (
            includesAny([
                "rock",
                "metal",
                "punk",
                "grunge",
                "emo",
                "aor",
                "post-grunge",
                "psychobilly",
                "jam band",
                "riot grrrl",
                "madchester",
                "indie",
                "shoegaze",
                "slowcore",
                "neo-psychedelic",
                "post-hardcore",
                "screamo"
            ])
        ) {
            // return "Rock/Metal";
            return "Rock";

        }

        // electronic / dance
        if (
            includesAny([
                "edm",
                "electro",
                "house",
                "trance",
                "techno",
                "dance",
                "dubstep",
                "euro",
                "disco",
                "post-disco",
                "hi-nrg",
                "new wave",
                "freestyle",
                "italo disco",
                "big room",
                "big beat",
                "uk garage",
                "industrial",
                "darkwave",
                "trip hop",
                "synth",
                "miami bass",
                "new rave",
                "footwork",
                "downtempo",
                "breakbeat",
                "ballroom vogue",
                "jersey club",
                "moombahton",
                "ambient",
                "minimalism",
                "cold wave",
                "bass music",
                "new age"
            ])
        ) {
            return "Electronic/Dance";
        }

        // r&b / soul / funk
        if (
            includesAny([
                "r&b",
                "rnb",
                "soul",
                "motown",
                "funk",
                "quiet storm",
                "doo-wop",
                "northern soul",
                "new jack swing",
                "classic soul",
                "gospel",
                "go-go",
                "boogie",
                "afrobeat",
                "afrobeats"
            ])
        ) {
            // return "R&B/Soul/Funk";
            return "R&B";

        }

        // country + folk
        if (
            includesAny([
                "country",
                "americana",
                "bluegrass",
                "folk",
                "honky tonk",
                "red dirt",
                "singer-songwriter",
                "celtic",
                "newgrass",
                "cajun",
                "sea shanties",
                "southern gothic",
                "zydeco",
                "native american music"
            ])
        ) {
            // return "Country/Folk/Americana";
            return "Country";
        }

        // latin
        if (
            includesAny([
                "latin",
                "reggaeton",
                "bachata",
                "merengue",
                "cumbia",
                "vallenato",
                "español",
                "espanol",
                "mariachi",
                "cha cha cha",
                "villancicos",
                "samba",
                "bolero",
                "tejano",
                "dembow",
                "música mexicana",
                "musica mexicana",
                "salsa",
                "mambo",
                "son cubano",
                "ranchera",
                "norteño",
                "norteno",
                "banda",
                "grupera"
            ])
        ) {
            return "Latin";
        }

        // reggae, dancehall, soca
        if (
            includesAny([
                "reggae",
                "dancehall",
                "soca",
                "calypso",
                "ragga",
                "riddim",
                "ska"
            ])
        ) {
            return "Reggae/Caribbean";
        }

        // jazz + blues
        if (
            includesAny([
                "jazz",
                "swing",
                "bossa",
                "blues",
                "boogie-woogie",
                "big band",
                "classic blues",
                "modern blues",
                "hard bop",
                "bebop",
                "ragtime",
                "lounge",
                "exotica"
            ])
        ) {
            // return "Jazz/Blues";
            return "Jazz";
        }

        // pop-ish catch-alls and adult
        if (s.includes("pop")) {
            return "Pop";
        }
        if (includesAny([
            "easy listening",
            "adult standards",
            "orchestral",
            "christmas",
            "musicals",
            "schlager",
            "worship",
            "ccm",
            "christian",
            "lullaby",
            "children's music",
            "chanson",
            "variété française",
            "variete francaise",
            "classical",
            "opera",
            "kundiman",
            "iskelmä",
            "dansband",
            "hollands",
            "choral",
            "gregorian chant",
            "medieval",
            "neue deutsche welle",
            "requiem",
            "chamber music",
            "comedy",
            "spoken word"
        ])) {
            return "Pop";
        }
        return "Other/Unknown";
    }

    function canonicalizeGenre(rawGenre) {
        if (genreCanonicalCache.has(rawGenre)) {
            return genreCanonicalCache.get(rawGenre);
        }
        const supergenre = toSuperGenre(rawGenre);
        genreCanonicalCache.set(rawGenre, supergenre);
        return supergenre;
    }

    function tokenizeGenre(rawGenre) {
        if (!rawGenre) return [];
        return rawGenre
            .toLowerCase()
            .split(/[^a-z0-9&]+/)
            .map(token => token.trim())
            .filter(Boolean);
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
        const finalEraLabel = Number(eras[eras.length - 1]?.label) || startYear;
        const clampedStart = Math.min(startYear, finalEraLabel);
        return clampedStart.toString();
    }

    function formatFeatureName(name) {
        if (!name) return "";
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    function getPrimaryGenre(label) {
        return label;
    }

    function formatGenreDisplay(genre) {
        if (!genre) return "";
        if (/[A-Z]/.test(genre)) return genre.trim();
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
            const bucketGenreDistributions = new Map();
            const totalSupergenreCounts = new Map();
            const unknownGenreCounts = new Map();
            let missingGenreCount = 0;

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
                if (!cleanedGenres.length) {
                    missingGenreCount += 1;
                }

                cleanedGenres.forEach(rawKey => {
                    const sg = toSuperGenre(rawKey);
                    if (sg === "Other/Unknown") {
                        unknownGenreCounts.set(
                            rawKey,
                            (unknownGenreCounts.get(rawKey) || 0) + 1
                        );
                    }
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

                const peakRank = Number(record["peak-rank"]);
                const rankVal = Number.isFinite(peakRank)
                    ? peakRank
                    : Number(record.rank);
                const safeRank = Number.isFinite(rankVal) ? rankVal : 100;
                const weeksRaw = Number(record["weeks-on-board"]);
                const weeks = Number.isFinite(weeksRaw) && weeksRaw > 0 ? weeksRaw : 1;
                const score = (101 - Math.min(safeRank, 101)) * weeks;
                if (!Number.isFinite(score)) return;

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
                    totalSupergenreCounts.set(
                        genre,
                        (totalSupergenreCounts.get(genre) || 0) + 1
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

            bucketGenreCounts.forEach((genreMap, label) => {
                const total = Array.from(genreMap.values()).reduce(
                    (sum, val) => sum + (Number.isFinite(val) ? val : 0),
                    0
                );
                let dist = Array.from(genreMap.entries())
                    .filter(([genre]) => genre && genre !== "unknown" && genre !== "Other/Unknown")
                    .map(([genre, count]) => ({
                        genre,
                        count: Number.isFinite(count) ? count : 0,
                        pct:
                            total > 0
                                ? Math.round(((Number.isFinite(count) ? count : 0) / total) * 100)
                                : 0
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                bucketGenreDistributions.set(label, dist);
            });

            if (typeof console !== "undefined" && console.table) {
                const supergenreSummary = SUPERGENRE_ORDER.map(key => ({
                    supergenre: key,
                    count: totalSupergenreCounts.get(key) || 0
                }));
                console.table(supergenreSummary, ["supergenre", "count"]);
            } else if (typeof console !== "undefined") {
                console.log(
                    "Supergenre counts:",
                    SUPERGENRE_ORDER.map(key => ({
                        supergenre: key,
                        count: totalSupergenreCounts.get(key) || 0
                    }))
                );
            }

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

            if (typeof console !== "undefined") {
                const unknownList = Array.from(unknownGenreCounts.entries()).sort(
                    (a, b) => (b[1] || 0) - (a[1] || 0)
                );
                console.log(
                    "[eras] unmatched genres -> Other/Unknown",
                    unknownList.length ? unknownList : "none"
                );
                if (missingGenreCount > 0) {
                    console.log("[eras] rows missing genres:", missingGenreCount);
                }
            }

            // renderUnknownGenreDebug(unknownGenreCounts, missingGenreCount);

            return {
                topGenres,
                bucketFeatureAverages,
                bucketGenreDistributions,
                bucketTopTracks,
                featureDomains,
                unknownGenreCounts
            };
        } catch (err) {
            console.warn("Failed to load billboard genres", err);
            return {
                topGenres: new Map(),
                bucketFeatureAverages: new Map(),
                bucketGenreDistributions: new Map(),
                bucketTopTracks: new Map(),
                featureDomains: new Map(),
                unknownGenreCounts: new Map()
            };
        }
    }

    const {
        topGenres: topGenreMap,
        bucketFeatureAverages,
        bucketTopTracks,
        bucketGenreDistributions,
        featureDomains,
        unknownGenreCounts
    } = await loadBillboardSummary();

    const HARDCODED_PRIMARY_GENRES = new Map([
        ["1980", "rock"],
        ["1985", "edm"],
        ["1990", "r&b"],
        ["1995", "r&b"],
        ["2000", "country"],
        ["2005", "country"],
        ["2010", "hip hop"],
        ["2015", "pop"]
    ]);

    let featuredKeys = new Set();

    eras.forEach((era, idx) => {
        const hardcoded = HARDCODED_PRIMARY_GENRES.get(era.label);
        const inferredRaw = topGenreMap.get(era.label);
        const inferredGenre =
            inferredRaw === "Other/Unknown" ? null : inferredRaw;
        const fallbackGenre = getPrimaryGenre(era.label);
        const resolvedGenre =
            canonicalizeGenre(hardcoded || inferredGenre || fallbackGenre) || "pop";
        const displayGenre = formatGenreDisplay(resolvedGenre);
        const theme = getThemeForGenre(resolvedGenre);
        const featureAverageMap =
            bucketFeatureAverages.get(era.label) || new Map();
        era.primaryGenre = displayGenre;
        era.genreKey = resolvedGenre;
        era.genreKeyRaw = resolvedGenre;
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
        if (FEATURE_HIGHLIGHT_OVERRIDES[era.genreKey]) {
            era.featureHighlightsOverride = FEATURE_HIGHLIGHT_OVERRIDES[era.genreKey];
        }
        const dist = bucketGenreDistributions.get(era.label);
        if (dist && dist.length) {
            era.genreDistribution = dist.slice(0, 5);
        } else {
            era.genreDistribution = [];
        }
    });

    function buildLegacyChart() {
        const margin = { top: 28, right: 28, bottom: 24, left: 140 };
        const width = 680;
        const height = 280;
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        chartSvg = d3
            .create("svg")
            .attr("class", "era-legacy-chart__svg")
            .attr("viewBox", `0 0 ${width} ${height}`);

        const root = chartSvg
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const rowGroup = root.append("g").attr("class", "legacy-rows");
        const placeholder = root
            .append("text")
            .attr("class", "legacy-placeholder")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#94a3b8")
            .style("font-size", "14px")
            .text("No feature data for this era.");

        const yScale = d3.scaleBand().padding(0.4);
        const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);

        updateGenreChart = (label, theme, genreKey) => {
            const labelMap = bucketFeatureAverages.get(label) || new Map();
            const genreAvg = labelMap.get(genreKey) || {};
            const baseAvg = labelMap.get(ALL_GENRE_KEY) || {};

            const data = FEATURE_KEYS.map(key => {
                const g = Number(genreAvg[key]);
                const b = Number(baseAvg[key]);
                const hasG = Number.isFinite(g);
                const hasB = Number.isFinite(b);
                if (!hasG && !hasB) return null;
                const genreVal = hasG ? g : b;
                const baseVal = hasB ? b : g;
                return {
                    key,
                    genreVal,
                    baseVal,
                    genreNorm: normalizeFeatureValue(key, genreVal, featureDomains),
                    baseNorm: normalizeFeatureValue(key, baseVal, featureDomains)
                };
            }).filter(Boolean);

            placeholder.style("display", data.length ? "none" : null);
            if (!data.length) return;

            yScale.domain(data.map(d => d.key)).range([0, innerHeight]);

            const rows = rowGroup
                .selectAll(".legacy-row")
                .data(data, d => d.key)
                .join(enter => {
                    const g = enter.append("g").attr("class", "legacy-row");
                    g.append("text")
                        .attr("class", "legacy-label")
                        .attr("x", -12)
                        .attr("y", 0)
                        .attr("text-anchor", "end")
                        .attr("dominant-baseline", "middle")
                        .style("fill", "#0f172a")
                        .style("font-weight", 600);
                    g.append("rect")
                        .attr("class", "legacy-bar baseline")
                        .attr("y", -8)
                        .attr("height", 16);
                    g.append("rect")
                        .attr("class", "legacy-bar genre")
                        .attr("y", -8)
                        .attr("height", 16);
                    g.append("text")
                        .attr("class", "legacy-value genre")
                        .attr("x", innerWidth + 8)
                        .attr("y", -2)
                        .attr("text-anchor", "start")
                        .attr("dominant-baseline", "middle")
                        .style("fill", "#0f172a");
                    g.append("text")
                        .attr("class", "legacy-value baseline")
                        .attr("x", innerWidth + 8)
                        .attr("y", 10)
                        .attr("text-anchor", "start")
                        .attr("dominant-baseline", "middle")
                        .style("fill", "#64748b");
                    return g;
                });

            rows.attr(
                "transform",
                d => `translate(0, ${yScale(d.key) + yScale.bandwidth() / 2})`
            );

            rows.select(".legacy-label").text(d => formatFeatureName(d.key));

            const baseColor = theme?.accentSoft || "#cbd5f5";
            const genreColor = theme?.accent || "#2563eb";

            rows
                .select("rect.baseline")
                .attr("width", d => xScale(Math.max(0, Math.min(1, d.baseNorm))))
                .attr("fill", baseColor)
                .attr("opacity", 0.45);

            rows
                .select("rect.genre")
                .attr("width", d => xScale(Math.max(0, Math.min(1, d.genreNorm))))
                .attr("fill", genreColor)
                .attr("opacity", 0.9)
                .attr("stroke", "none");

            rows
                .select("text.legacy-value.genre")
                .text(d => formatFeatureValue(d.key, d.genreVal));

            rows
                .select("text.legacy-value.baseline")
                .text(d => `Era avg ${formatFeatureValue(d.key, d.baseVal)}`);
        };
    }

    buildLegacyChart();

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
                .style("--panel-text", theme.text)
                .attr("data-genre-key", (d.genreKeyRaw || d.genreKey || "").toLowerCase());
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

    // const genreMixBlock = chartBlock.append("div").attr("class", "genre-mix");
    // genreMixBlock.append("h3").attr("class", "block-title").text("Top 5 Genre Mix in This Era");
    //
    // const genreChips = genreMixBlock
    //     .append("div")
    //     .attr("class", "genre-mix__chips")
    //     .selectAll(".genre-chip")
    //     .data(d => d.genreDistribution || [])
    //     .join("div")
    //     .attr("class", "genre-chip");
    //
    // genreChips
    //     .append("span")
    //     .attr("class", "genre-chip__name")
    //     .text(d => formatGenreDisplay(d.genre));
    //
    // const chipBars = genreChips
    //     .append("div")
    //     .attr("class", "genre-chip__bar");
    //
    // chipBars
    //     .append("div")
    //     .attr("class", "genre-chip__bar-fill")
    //     .style("width", d => `${Math.max(0, Math.min(100, d.pct || 0))}%`);
    //
    // genreChips
    //     .append("span")
    //     .attr("class", "genre-chip__value")
    //     .text(d => `${d.pct || 0}%`);

    chartBlock.append("h3").attr("class", "block-title").text("Feature Highlights");

    const featureCardsContainer = chartBlock
        .append("div")
        .attr("class", "era-feature-cards")
        .each(function (d) {
            const container = d3.select(this);
            container.html("");
            const cardsData =
                d.featureHighlightsOverride || d.featureComparisons || [];
            const isOverride = Array.isArray(d.featureHighlightsOverride);
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
                .attr("class", d =>
                    isOverride
                        ? "feature-card feature-card--override"
                        : "feature-card"
                )
                .style("border", d =>
                    isOverride ? "1px dashed var(--panel-accent, #2563eb)" : null
                )
                .style("background", d =>
                    isOverride
                        ? "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(37,99,235,0.02))"
                        : null
                );

            const headers = cards
                .append("div")
                .attr("class", "feature-card__header");

            headers
                .append("span")
                .attr("class", "feature-card__label")
                .text(item =>
                    isOverride
                        ? formatFeatureName(interpretOverride(item).label)
                        : formatFeatureName(item.key)
                );

            headers
                .append("span")
                .attr("class", "feature-card__delta")
                .style("color", item => {
                    if (!isOverride) return null;
                    const dir = interpretOverride(item).direction;
                    if (dir === "high") return "#16a34a";
                    if (dir === "low") return "#ff6b6b";
                    return "#0f172a";
                })
                .text(item => {
                    if (!isOverride) return formatDeltaText(item.key, item.delta);
                    const { direction } = interpretOverride(item);
                    if (direction === "high") return "↑ High";
                    if (direction === "low") return "↓ Low";
                    return "";
                });

            if (!isOverride) {
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
            }
        });


    // const legacyChartBlock = shell.append("div").attr("class", "era-legacy-chart");
    // legacyChartBlock
    //     .append("h3")
    //     .attr("class", "block-title")
    //     .text("Legacy Feature Profile");
    // legacyChartBlock.append("div").attr("class", "era-legacy-chart__viz");
    
    const tracksBlock = shell.append("div").attr("class", "era-tracks-block");

    tracksBlock
        .append("h3")
        .attr("class", "block-title")
        .text(d => `Most Popular Songs in This Era`);

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
