class FeatureTimeline {
    constructor(parent, feature, events) {
        this.parent = parent;
        this.feature = feature;
        this.margin = { top: 40, right: 40, bottom: 50, left: 60 };
        this.width = window.innerWidth * 0.8;
        this.height = window.innerHeight * 0.6;
        this.events = events;

        this.initVis();
    }

    initVis() {
        const vis = this;

        vis.svg = d3.select(vis.parent)
            .append("svg")
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

        vis.chart = vis.svg.append("g")
            .attr("transform", `translate(${vis.margin.left}, ${vis.margin.top})`);

        vis.xScale = d3.scaleLinear();
        vis.yScale = d3.scaleLinear();

        vis.xAxis = vis.chart.append("g")
            .attr("transform", `translate(0, ${vis.height})`);

        vis.yAxis = vis.chart.append("g");

        vis.linePath = vis.chart.append("path")
            .attr("fill", "none")
            .attr("stroke", "#007bff")
            .attr("stroke-width", 3);

        vis.eventTooltip = d3.select("body")
            .append("div")
            .attr("class", "event-tooltip")

        this.loadData();
    }

    loadData() {
        const vis = this;

        d3.text("data/processed/billboard_full.ndjson").then(raw => {

            // split by line and JSON-parse each line
            vis.rawData = raw
                .split("\n")
                .filter(l => l.trim().length > 0)
                .map(l => JSON.parse(l));

            vis.processData();
        });
    }

    processData() {
        const vis = this;

        // group by year
        const yearMap = d3.group(
            vis.rawData,
            d => new Date(d.date).getFullYear()
        );

        vis.timeline = Array.from(yearMap, ([year, songs]) => {
            const valid = songs.filter(s => s[vis.feature] != null && !isNaN(s[vis.feature]));
            const avg = d3.mean(valid, d => d[vis.feature]);
            return { year: +year, value: avg };
        }).filter(d => d.value != null && d.year >= 1980);

        vis.timeline.sort((a, b) => a.year - b.year);

        vis.updateVis();
    }

    updateVis() {
        const vis = this;
        console.log(`Average ${this.feature} per year: `, vis.timeline)

        vis.xScale
            .domain(d3.extent(vis.timeline, d => d.year))
            .range([0, vis.width]);

        vis.yScale
            .domain([d3.min(vis.timeline, d => d.value), d3.max(vis.timeline, d => d.value)])
            .nice()
            .range([vis.height, 0]);

        const lineGen = d3.line()
            .x(d => vis.xScale(d.year))
            .y(d => vis.yScale(d.value))
            .curve(d3.curveMonotoneX);

        const color = window.dnaVis?.colorScales?.[vis.feature]
            || d3.scaleSequential(d3.interpolateBlues); // fallback just in case

        const maxVal = d3.max(vis.timeline, d => d.value);
        color.domain([0, maxVal]);
        const [yMin, yMax] = vis.yScale.domain();
        const midFeatureVal = (yMin + yMax) / 2

        vis.linePath
            .datum(vis.timeline)
            .transition()
            .duration(800)
            .attr("d", lineGen)
            .attr("stroke", color(maxVal));

        vis.xAxis
            .transition()
            .duration(600)
            .call(d3.axisBottom(vis.xScale).tickFormat(d3.format("d")).tickPadding(10))

        vis.xAxis
            .selectAll(".domain")
            .transition()
            .duration(600)
            .style("opacity", 0);

        vis.xAxis
            .selectAll("line")
            .style("opacity", 0);

        vis.yAxis
            .transition()
            .duration(600)
            .call(d3.axisLeft(vis.yScale))
            .transition()
            .duration(600)
            .call(d3.axisLeft(vis.yScale).tickSize(-vis.width).tickPadding(12))

        vis.yAxis
            .selectAll(".domain")
            .transition()
            .duration(600)
            .style("opacity", 0);

        vis.yAxis
            .selectAll("line")
            .attr("stroke", "#ccc")
            .attr("stroke-dasharray", "3 3");

        vis.svg.selectAll(".axis-label").remove();

        // x axis label
        this.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", (this.width + this.margin.left + this.margin.right) / 2)
            .attr("y", this.height + this.margin.bottom + this.margin.top)
            .attr("text-anchor", "middle")
            .attr("font-size", 16)
            .attr("fill", "#333")
            .text("Year")

        // y axis label
        this.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", -(this.height / 2))
            .attr("y", this.margin.left - 50)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .attr("font-size", 16)
            .attr("fill", "#333")
            .style("opacity", 0)
            .text(this.feature)
            .transition()
            .duration(1000)
            .style("opacity", 1)

        // --- Draw area ---
        const areaGen = d3.area()
            .x(d => vis.xScale(d.year))
            .y0(vis.height)
            .y1(d => vis.yScale(d.value))
            .curve(d3.curveMonotoneX);

        const areaPath = vis.chart.selectAll(".line-area").data([vis.timeline]);
        areaPath.enter()
            .append("path")
            .attr("class", "line-area")
            .attr("fill", "url(#line-gradient)")
            .merge(areaPath)
            .transition()
            .duration(800)
            .attr("d", areaGen);


        // --- Squares on line for each year tick ---
        const squareSize = 6;
        const points = vis.chart.selectAll(".year-square")
            .data(vis.timeline, d => d.year);

        points.exit().remove();
        points.enter()
            .append("rect")
            .attr("class", "year-square")
            .attr("width", squareSize)
            .attr("height", squareSize)
            .attr("x", d => vis.xScale(d.year) - squareSize / 2)
            .attr("y", d => vis.yScale(d.value) - squareSize / 2)
            .attr("fill", color(maxVal))
            .merge(points)
            .transition()
            .duration(800)
            .attr("x", d => vis.xScale(d.year) - squareSize / 2)
            .attr("y", d => vis.yScale(d.value) - squareSize / 2)
            .attr("fill", color(maxVal));

        // --- Gradient under the line ---
        let defs = vis.svg.select("defs");
        if (defs.empty()) defs = vis.svg.append("defs");
        let gradient = defs.selectAll("#line-gradient").data([1]);
        const gradientEnter = gradient.enter()
            .append("linearGradient")
            .attr("id", "line-gradient")
            .attr("x1", "0%")
            .attr("x2", "0%")
            .attr("y1", "0%")
            .attr("y2", "100%");

        gradient = gradientEnter.merge(gradient);
        const stopsData = [
            { offset: "0%", color: color(maxVal), opacity: 0.4 },
            { offset: "100%", color: color(maxVal), opacity: 0 }
        ];

        let stops = gradient.selectAll("stop").data(stopsData);
        stops.enter()
            .append("stop")
            .merge(stops) // update existing stops
            .attr("offset", d => d.offset)
            .attr("stop-color", d => d.color)
            .attr("stop-opacity", d => d.opacity);

        stops.exit().remove();

        // --- Filter events for the current feature ---
        const featureEvents = this.events[this.feature] || [];
        const markers = this.chart.selectAll(".event-marker")
            .data(featureEvents, d => d.year);
        const markersEnter = markers.enter()
            .append("circle")
            .attr("class", "event-marker")
            .attr("r", 0)
            .attr("fill", "#ff4136")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .attr("cx", d => this.xScale(d.year))
            .attr("cy", d => {
                const point = this.timeline.find(t => t.year === d.year);
                return point ? this.yScale(point.value) : this.height;
            })
            .style("opacity", 0)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .ease(d3.easeCubicOut)
                    .attr("r", 10);

                this.eventTooltip
                    .style("opacity", 1)
                    .html(this.eventTooltipHTML(d));

                this.updateEventTooltipPos(event, d, midFeatureVal);
            })
            .on("mousemove", (event, d) => {
                this.updateEventTooltipPos(event, d, midFeatureVal);
            })
            .on("mouseleave", (event) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .ease(d3.easeCubicOut)
                    .attr("r", 8);

                this.eventTooltip.style("opacity", 0);
            });

        markersEnter.transition()
            .delay((_, i) => 1300 + i * 200) // staggers
            .duration(800)
            .ease(d3.easeElasticOut)
            .attr("r", 8)
            .style("opacity", 1);

        markers.transition()
            .duration(800)
            .attr("cx", d => this.xScale(d.year))
            .attr("cy", d => {
                const point = this.timeline.find(t => t.year === d.year);
                return point ? this.yScale(point.value) : this.height;
            });

        markers.exit()
            .transition()
            .duration(400)
            .style("opacity", 0)
            .remove();
    }

    setFeature(feature) {
        this.feature = feature;
        this.processData();
    }

    updateEventTooltipPos(event, d, midFeatureVal) {
        let x, y;
        const featureValue = this.timeline.find(data => data.year === d.year).value
        const tooltipWidth = this.eventTooltip.node().offsetWidth;
        const tooltipHeight = this.eventTooltip.node().offsetHeight;

        if (featureValue <= midFeatureVal) {
            x = event.pageX - tooltipWidth / 2;
            y = event.pageY - tooltipHeight - 20;
        } else {
            y = event.pageY - tooltipHeight / 2;

            if (d.year <= 1985) {
                x = event.pageX + 30;
            } else {
                x = event.pageX - tooltipWidth - 30;
            }
        }

        this.eventTooltip
            .style("left", `${x}px`)
            .style("top", `${y}px`);
    }

    eventTooltipHTML(d) {
        return `
            <img src=${d.image}>
            <div id="event-title"><strong>${d.event}</strong> (${d.year})</div>
            <div id="event-content-container">
                ${d.contents.map((text) => {
                    return `<div>• ${text}</div>`;
                }).join(" ")}
            </div>
        `;
    }
}

FEATURE_EVENTS = {
    acousticness: [
        {
            year: 1984,
            event: "Synth-pop and drum machines take over pop music",
            contents: [
                "Affordable drum machines and synthesizers exploded in popularity.",
                "Electronic pop groups dominated the charts.",
                "This drove a major decline in acoustic instrumentation in Billboard hits."
            ],
            image: "https://media.sweetwater.com/m/insync/2022/11/Must-see-Drum-Machines-and-Sequencers-2022-Featured-Image.jpg"
        },
        {
            year: 1991,
            event: "MTV Unplugged sparks acoustic revival",
            contents: [
                "Acoustic performances became culturally influential.",
                "Artists embraced more organic arrangements.",
                "Billboard charts saw a rise in acoustic-driven songs."
            ],
            image: "https://ew.com/thmb/AfL5Y11qtqyS7joq9gBns9Rtr8o=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/kurt-cobain-eca1479b11b64710a464b2580aa33fba.jpg"
        },
        {
            year: 2006,
            event: "Digital production fully replaces traditional studio methods",
            contents: [
                "Pro Tools setups became the industry default.",
                "Reliance on synthetic instruments increased.",
                "Overall acousticness dipped sharply."
            ],
            image: "https://media.sweetwater.com/m/insync/import/Live6-large.jpg"
        },
        {
            year: 2012,
            event: "EDM boom drives historic low in acousticness",
            contents: [
                "Calvin Harris, Avicii, and David Guetta defined the chart sound.",
                "Synthetic leads and electronic drops dominated pop.",
                "Billboard acousticness reached an all-time low."
            ],
            image: "https://res.cloudinary.com/jerrick/image/upload/d_642250b563292b35f27461a7.png,f_jpg,fl_progressive,q_auto,w_1024/64b39ae7edf3c6001d7b2239.jpg"
        },
        {
            year: 2020,
            event: "Indie & bedroom pop reintroduce acoustic textures",
            contents: [
                "Lo-fi and intimate production gained mainstream traction.",
                "Acoustic guitars returned to streaming-era pop.",
                "This reversed years of low acousticness."
            ],
            image: "https://images2.alphacoders.com/137/1372963.png"
        },
        {
            year: 2021,
            event: "Organic, raw songwriting hits the mainstream",
            contents: [
                "Artists embraced stripped-down, emotionally honest production.",
                "Acoustic and semi-acoustic tracks topped charts.",
                "Acousticness reached its highest point in over a decade."
            ],
            image: "https://cdn.mos.cms.futurecdn.net/v6wtvNm6y9mCVFKwcmMBQC-1920-80.jpg"
        },
    ],
    danceability: [
        {
            year: 1983,
            event: "MTV era boosts synth-pop and dance-oriented production",
            contents: [
                "Visual pop stars drove rhythmic, high-energy music.",
                "Synth-pop and post-disco acts rose rapidly.",
                "Danceability increased across Billboard hits."
            ],
            image: "https://wallpapers.com/images/hd/synthwave-sun-and-mountains-chcmtnilfpwcy3xh.jpg"
        },
        {
            year: 1993,
            event: "Hip-hop and R&B become dominant chart genres",
            contents: [
                "Groove-focused production replaced rock-centered styles.",
                "R&B groups and rap artists shaped the Billboard sound.",
                "Danceability surged through the mid-90s."
            ],
            image: "https://wallpapers.com/images/hd/rap-aesthetic-qmuqgblb28exk3kx.jpg"
        },
        {
            year: 1997,
            event: "Eurodance and house music influence U.S. mainstream pop",
            contents: [
                "Club rhythms and four-on-the-floor beats gained traction.",
                "Global dance acts impacted U.S. production trends.",
                "Danceability reached one of its decade highs."
            ],
            image: "https://c4.wallpaperflare.com/wallpaper/686/788/901/mixing-console-dj-controller-hd-wallpaper-preview.jpg"
        },
        {
            year: 2002,
            event: "Rock revival and ballads reduce dance-oriented production",
            contents: [
                "Alternative rock bands topped the charts.",
                "Pop leaned toward slower emotional ballads.",
                "Danceability dropped in the early 2000s."
            ],
            image: "https://t3.ftcdn.net/jpg/03/12/73/64/360_F_312736429_mlLxNx88hL9oEiKac874meeab2xE3ONf.jpg"
        },
        {
            year: 2015,
            event: "Streaming era ushers in a dance-pop renaissance",
            contents: [
                "Playlists elevated rhythmic, upbeat tracks.",
                "Dance-pop ruled the Hot 100.",
                "Producers emphasized grooves and bounce."
            ],
            image: "https://i.pinimg.com/736x/5f/f0/1f/5ff01fc2656b02e07f00d4e401061b02.jpg"
        },
        {
            year: 2017,
            event: "Reggaeton and afrobeats reshape U.S. pop",
            contents: [
                "Global rhythmic styles became mainstream.",
                "Syncopated grooves defined hit songs.",
                "Danceability rose sharply."
            ],
            image: "https://i8.amplience.net/i/naras/women-behind-the-scenes-African-Music.jpg"
        },
        {
            year: 2019,
            event: "TikTok era rewards highly danceable music",
            contents: [
                "Viral dances propelled songs up the charts.",
                "Producers optimized for beat clarity and bounce.",
                "Danceability reached modern-era highs."
            ],
            image: "https://wallpapers.com/images/featured/tiktok-8ylayzyh1shrzytz.jpg"
        }
    ],
    energy: [
        {
            year: 1983,
            event: "Synth-driven pop and rock boost overall intensity",
            contents: [
                "Artists like Michael Jackson, Prince, and Eurythmics pushed highly energetic, electronic production.",
                "Gated drums, bright synths, and aggressive mixing increased sonic intensity across Billboard hits.",
                "This period marks one of the clearest energy jumps in the dataset."
            ],
            image: "https://res.cloudinary.com/jerrick/image/upload/d_642250b563292b35f27461a7.png,f_jpg,fl_progressive,q_auto,w_1024/qi4ixoilw0wxexg2rdjb.jpg"
        },
        {
            year: 1993,
            event: "Rise of R&B and laid-back hip-hop lowers average energy",
            contents: [
                "Smooth R&B acts (TLC, Boyz II Men, Janet Jackson) dominated charts with softer production.",
                "West Coast hip-hop emphasized relaxed grooves rather than high-energy instrumentation.",
                "Billboard shifts away from 80s bombast into more chill production styles."
            ],
            image: "https://www.billboard.com/wp-content/uploads/stylus/501740-r-and-b-list-617-409.jpg?w=617"
        },
        {
            year: 2000,
            event: "Pop-rock and club-influenced production bring energy to new highs",
            contents: [
                "The late 90s-early 2000s saw high-energy releases from Britney Spears, NSYNC, and Destiny's Child.",
                "Pop punk and alternative rock (Blink-182, Linkin Park, Green Day) pushed intensity upward.",
                "Club-oriented electronic production began influencing mainstream pop, boosting loudness and energy."
            ],
            image: "https://creativereview.imgix.net/uploads/2021/05/SoSolid165.jpg?auto=compress,format&crop=faces,entropy,edges&fit=crop&q=60&w=1940&h=1230"
        },
        {
            year: 2007,
            event: "EDM influence and the Loudness War peak mainstream energy",
            contents: [
                "Electronic producers (Timbaland, Calvin Harris, David Guetta) brought explosive, high-loudness mixes.",
                "The industry intentionally mastered songs louder for competitive advantage—raising perceived energy.",
                "Billboard tracks from 2007-2012 represent the highest sustained energy levels in modern history."
            ],
            image: "https://theriseofedm.wordpress.com/wp-content/uploads/2013/10/dj-with-turntable.jpg"
        },
        {
            year: 2013,
            event: "Shift toward minimalist, mellow pop reduces overall energy",
            contents: [
                "Artists like Drake, The Weeknd, and Lorde popularized darker, slower, atmosphere-heavy production.",
                "Streaming rewarded relaxed, low-energy listening habits.",
                "This begins a long-term decline in Billboard track intensity from 2013 onward."
            ],
            image: "https://media.soundoflife.com/34/resources/wHHQMYPLAx1WT4mC3pEH9zbq3jJAySK0BJR2lBls.jpg"
        },
        {
            year: 2017,
            event: "Hip-hop dominance and trap production push energy downward",
            contents: [
                "Trap's signature sparse drums and deep 808s replaced the high-energy EDM and pop of the early 2010s.",
                "Hip-hop took over the Hot 100, becoming the most consumed genre in the U.S.",
                "The chart's sound shifted toward mood-driven, mid-tempo production."
            ],
            image: "https://opinionatedopinionsite.wordpress.com/wp-content/uploads/2022/01/image_editor_output_image1861738765-1641747875093-e1641747993432.jpg?w=600"
        }
    ],
    loudness: [
        {
            year: 1994,
            event: "The Rise of the Loudness War",
            contents: [
                "During the mid-1990s, labels and engineers began aggressively maximizing volume to make songs stand out on radio.",
                "This era marks the start of a sharp increase in average loudness as dynamic range was heavily reduced for perceived impact."
            ],
            image: "https://producelikeapro.com/blog/wp-content/uploads/2022/03/How-the-%E2%80%98Loudness-Wars-Made-Music-Sound-Worse-And-What-We-Should-Learn-from-It-1080x689.jpg"
        },
        {
            year: 1999,
            event: "Peak CD Mastering Compression",
            contents: [
                "By the late '90s, CD mastering techniques pushed loudness levels to new extremes, with heavy limiting and clipping becoming common.",
                "This period is often cited as the height of the loudness war, where many albums prioritized sheer volume over clarity."
            ],
            image: "https://storage.googleapis.com/stateless-blog-g4m-co-uk/2024/03/Clipped-waveform.jpg"
        },
        {
            year: 2007,
            event: "Public Backlash After the 'Death Magnetic' Controversy",
            contents: [
                "Metallica's *Death Magnetic* sparked widespread criticism due to severe distortion caused by excessive compression.",
                "The backlash brought mainstream attention to the issues caused by ultra-loud mastering and helped push the industry toward change."
            ],
            image: "https://cdn.mos.cms.futurecdn.net/9303cbd0419e5815d96538229fb17b21.jpg"
        },
        {
            year: 2015,
            event: "Streaming Platforms Normalize Loudness",
            contents: [
                "Services like Spotify, Apple Music, and YouTube began applying loudness normalization, reducing the advantage of overly hot masters.",
                "Producers gradually shifted back toward more dynamic, less distorted mixes since louder tracks no longer sounded louder during playback."
            ],
            image: "https://viberate-upload.ams3.cdn.digitaloceanspaces.com/prod/com/article/top-5-streaming-platforms-for-talent-discovery-ranked-by-aandrs-music-industry-survey-YHPM9"
        }
    ],
    speechiness: [
        {
            year: 1993,
            event: "Rap and Hip-Hop Enter Mainstream Pop",
            contents: [
                "The early 1990s saw rap and hip-hop cross fully into mainstream charts, bringing more spoken-word elements into popular music.",
                "This shift is reflected in the noticeable rise in speechiness beginning in the early 90s."
            ],
            image: "https://i8.amplience.net/i/naras/wu-tang-clan_MI0003661639-MN0000959876"
        },
        {
            year: 2004,
            event: "Pop Embraces Rhythmic, Talk-Driven Hooks",
            contents: [
                "Mid-2000s pop leaned heavily on rhythmic vocal delivery—think R&B-inspired verses, talk-sung hooks, and ad-libs.",
                "Songs increasingly blurred the line between singing and speaking, contributing to speechiness levels peaking around this period."
            ],
            image: "https://www.rollingstone.com/wp-content/uploads/2025/05/one-hit-wonders-50-list-lead.jpg?w=1581&h=1054&crop=1"
        },
        {
            year: 2016,
            event: "Trap Dominates the Charts",
            contents: [
                "The rise of trap brought talk-like rap flows, sparse beats, and heavy ad-lib culture to mainstream music.",
                "This led to the largest spike in speechiness across the entire timeline as trap artists topped global charts."
            ],
            image: "https://promusicianhub.com/wp-content/uploads/2022/01/best-trap-songs.jpg"
        },
        {
            year: 2019,
            event: "Streaming Playlists Boost Spoken-Word Vocal Styles",
            contents: [
                "Spotify and Apple Music playlists favored punchy, conversational vocal delivery that grabbed attention instantly.",
                "Shorter song formats and more talk-based verses helped push speechiness to sustained high levels in the late 2010s."
            ],
            image: "https://storage.googleapis.com/pr-newsroom-wp/1/2024/05/CLASSICS-Hip-Hop-FTR-Header-1-1440x1440.jpg"
        }
    ],
    tempo: [
        {
            year: 1983,
            event: "Dance-Pop and New Wave Increase Tempo",
            contents: [
                "Early 1980s pop was driven by upbeat dance rhythms and electronic production.",
                "New Wave bands and synth-driven hits kept tempos high, reflected in the elevated BPM levels of this era."
            ],
            image: "https://d3nxoulyw7bc8u.cloudfront.net/images/events/109c6155-d816-4ac6-af19-8545b66fe01e.jpg"
        },
        {
            year: 2007,
            event: "Electronic Dance Music Peaks in Popularity",
            contents: [
                "The mid-2000s saw EDM and electro-pop rise globally, with faster, high-energy beats becoming mainstream.",
                "This period marks the highest tempo spike across the dataset as club-driven production dominated the charts."
            ],
            image: "https://www.electronic-festivals.com/sites/default/files/tomorrowland_4.jpg"
        },
        {
            year: 2017,
            event: "Streaming Era Pushes Pop Toward Slower Tempos",
            contents: [
                "The late 2010s saw a major shift toward mid-tempo and slower music influenced by trap, R&B, and atmospheric pop.",
                "This brings a noticeable tempo dip despite high-energy genres still existing in the charts."
            ],
            image: "https://imageio.forbes.com/blogs-images/ogdenpayne/files/2017/02/Daniel-Caesar-NEw-by-Keith-Henry.jpg?format=jpg&height=600&width=1200&fit=bounds"
        },
        {
            year: 2020,
            event: "A Subtle Rebound in Tempo",
            contents: [
                "The early 2020s introduce a slight tempo recovery due to hybrid genres like dance-pop revival, K-pop, and upbeat indie.",
                "While not returning to 2000s levels, tempos rise modestly after the mid-2010s slowdown."
            ],
            image: "https://media.voguearabia.com/photos/67dd0d999fb0e0ee5f979157/4:3/w_2560%2Cc_limit/02-175_fn.jpg"
        }
    ],
    valence: [
        {
            year: 1984,
            event: "The Peak of Cheerful, Upbeat Pop",
            contents: [
                "The early 1980s reached peak musical brightness, fueled by synth-pop, dance-pop, and major-key production.",
                "Valence levels during this period were among the highest across the entire dataset."
            ],
            image: "https://www.rollingstone.com/wp-content/uploads/2023/11/sheffs-80s-REAL-FINALv2.jpg?w=1581&h=1054&crop=1"
        },
        {
            year: 1992,
            event: "A Shift Toward Darker, Moodier Music",
            contents: [
                "The early 1990s marked a notable emotional dip as grunge, alternative rock, and darker forms of hip-hop rose in popularity.",
                "This era represents one of the steepest multi-year declines in valence."
            ],
            image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTe4iMuPJ4ALrWTj7IvCq_9UU5u0Fc-i5oGqw&s"
        },
        {
            year: 2005,
            event: "The Fall of High-Valence Pop in the 2000s",
            contents: [
                "Mid-2000s mainstream music leaned more introspective with emo-pop, R&B ballads, and moodier electronic sounds.",
                "Valence reached one of its lowest points since the early 1980s, reflecting a tonal shift in the charts."
            ],
            image: "https://www.brooklynvegan.com/wp-content/uploads/2022/05/21/attachment-2002-pop-punk-singles.jpeg"
        },
        {
            year: 2018,
            event: "The Lowest Emotional Tone in Modern Pop",
            contents: [
                "Late-2010s music hit the lowest valence values in the entire dataset, coinciding with atmospheric trap, sad pop, and downtempo hip-hop dominating streaming charts.",
                "Artists like Billie Eilish, Drake, and Post Malone defined a softer, moodier era."
            ],
            image: "https://i.ytimg.com/vi/emly-yxenmo/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLDpXRA4ywg88OLzSAsLWmHNmKnJWQ"
        }
    ]
};

// --------------------------
// Instantiate after load
// --------------------------
document.addEventListener("DOMContentLoaded", function () {
    window.featureTimeline = new FeatureTimeline("#feature-timeline-vis", feature, FEATURE_EVENTS);

    const selector = document.getElementById("feature-select");

    selector.addEventListener("change", () => {
        featureTimeline.setFeature(selector.value);

        const title = document.querySelector("#feature-timeline-section .chart-title");
        title.textContent =
            "A Final Look at " +
            selector.value.charAt(0).toUpperCase() +
            selector.value.slice(1);
    });
});

document.addEventListener("DOMContentLoaded", function () {

    const mainSelect = document.getElementById("feature-select");
    const titleSelect = document.getElementById("feature-title-select");

    // initialize title dropdown to match global `feature`
    titleSelect.value = feature;

    // === when main dropdown changes ===
    mainSelect.addEventListener("change", () => {
        const f = mainSelect.value;

        feature = f;                       // update global
        titleSelect.value = f;             // sync title dropdown
        featureTimeline.setFeature(f);     // update timeline
    });

    // === when title dropdown changes ===
    titleSelect.addEventListener("change", (e) => {
        setGlobalFeature(e.target.value);
    });

});
