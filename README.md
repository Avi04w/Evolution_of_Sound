# The Evolution of Sound

## Overview
We believe that music trends reflect cultural, technological and social changes. Therefore, we want to reveal more about those trends by visualizing 7 features, including `acousticness`, `danceability`, `energy`, `loudness`, `speechiness`, `tempo`, and `valance`, throughout the past four decodes of time starting at 1980. Our data are primarily focused on the billboard 100s, sourced from Kaggle and Spotify.

## Links
Access the visualization here: https://avi04w.github.io/Evolution_of_Sound/

Learn how to walk through the visualization here: https://www.youtube.com/watch?v=R0h3fZqzYmc

## Technical overview

### Source Code
The entry point of the visualiztion is `index.html` and most of the JS source code is in the folder `js/`. The `js/` folder also includes some utility functions.

**Visualizations**
- `feature_timeline.js`
- `geographical.js`
- `vis_bubble.js`
- `vis_dna_yearly.js`
- `vis_dna.js`
- `vis_universe.js`
- `vis_universe_modules/` (helpers for `universe.js`)

Note that both the universe and geographical visualizations are connected with custom iframes in `universe.html` and `vis-globalization/`. Our stylesheets lives in `css/`.

**Utilities**
- `eras.js`
- `main.js`
- `page_navigation.js`
- `scroll_snap.js`
- `spotify_player.js`

**Deprecated**
- `treemap.js`
- `vinyl_record.js`

### Datasets
All of our datasets live in the `data/processed/` folder. We have processed multiple extensions from our original dataset as different visualizations have different needs.

### Libraries
There are two third party libraries used in this project: `d3.js` and `three.js`, where both are sourced from the library's CDN. All of the visulizations depends on D3, and the Universe visualization also uses Three.

### Assets
Our static assets (images and audio) are handled differently for different visualizations. For the Eras visualization, the background image assets are stored in `data/era_backgrounds/`. For the Feature Timeline visualization, the images are links hosted from public domains. For songs, the audios comes from Spotify.

### Other
Other files such as `storyboard.pdf` are not a part of the visualization, but are rather project configs or planning.

## Contributors
1. Avi Walia
2. Eric Liang
3. Ethan Liu
4. Kevin Hu
5. Taemin Kim
