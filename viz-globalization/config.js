const DEFAULT_FEATURE_KEY = "acousticness";

const FEATURE_COLOR_MAP = Object.freeze({
  acousticness: "#5b8ff9",
  danceability: "#ff7b72",
  energy: "#f4b13d",
  loudness: "#a15dd1",
  valence: "#26a269",
  instrumentalness: "#ffafcc",
  speechiness: "#f28482",
  liveness: "#00a8b5",
  tempo: "#6c757d",
});

const FEATURE_GRADIENT_MAP = Object.freeze({
  acousticness: ["#e4f1ff", "#00324e"],
  danceability: ["#e8dcff", "#1e0059"],
  energy: ["#bcffc4", "#1d4e00"],
  loudness: ["#9e9e9e", "#000000"],
  valence: ["#005283", "#ded700"],
  instrumentalness: ["#ffe6f2", "#8a0045"],
  speechiness: ["#ffe9b6", "#6a4c00"],
  liveness: ["#d7fbff", "#005e66"],
  tempo: ["#ffc8c8", "#770000"],
});

const SUPERGENRE_ORDER = Object.freeze([
  "Pop",
  "Hip-Hop/Rap",
  "Rock/Metal",
  "Electronic/Dance",
  "R&B/Soul/Funk",
  "Country/Folk/Americana",
  "Latin",
  "Reggae/Caribbean",
  "Jazz/Blues",
  "Other/Unknown",
]);

const SUPERGENRE_COLORS = Object.freeze({
  Pop: "#4c78a8",
  "Hip-Hop/Rap": "#f58518",
  "Rock/Metal": "#e45756",
  "Electronic/Dance": "#72b7b2",
  "R&B/Soul/Funk": "#54a24b",
  "Country/Folk/Americana": "#eeca3b",
  Latin: "#b279a2",
  "Reggae/Caribbean": "#ff9da7",
  "Jazz/Blues": "#9d755d",
  "Other/Unknown": "#bab0ac",
});

function toSuperGenre(genre) {
  const s = (genre || "Other").toLowerCase();
  if (
    s.includes("hip hop") ||
    s.includes("rap") ||
    s.includes("drill") ||
    s.includes("trap") ||
    s.includes("grime")
  ) {
    return "Hip-Hop/Rap";
  }
  if (
    s.includes("rock") ||
    s.includes("metal") ||
    s.includes("punk") ||
    s.includes("grunge") ||
    s.includes("emo")
  ) {
    return "Rock/Metal";
  }
  if (
    s.includes("edm") ||
    s.includes("electro") ||
    s.includes("house") ||
    s.includes("trance") ||
    s.includes("techno") ||
    s.includes("dance") ||
    s.includes("dubstep") ||
    s.includes("euro")
  ) {
    return "Electronic/Dance";
  }
  if (
    s.includes("r&b") ||
    s.includes("soul") ||
    s.includes("motown") ||
    s.includes("funk") ||
    s.includes("quiet storm")
  ) {
    return "R&B/Soul/Funk";
  }
  if (
    s.includes("country") ||
    s.includes("americana") ||
    s.includes("bluegrass") ||
    s.includes("folk")
  ) {
    return "Country/Folk/Americana";
  }
  if (
    s.includes("latin") ||
    s.includes("reggaeton") ||
    s.includes("bachata") ||
    s.includes("merengue") ||
    s.includes("cumbia") ||
    s.includes("vallenato") ||
    s.includes("español")
  ) {
    return "Latin";
  }
  if (
    s.includes("reggae") ||
    s.includes("dancehall") ||
    s.includes("soca") ||
    s.includes("calypso") ||
    s.includes("ragga")
  ) {
    return "Reggae/Caribbean";
  }
  if (s.includes("jazz") || s.includes("swing") || s.includes("bossa")) {
    return "Jazz/Blues";
  }
  if (
    s.includes("pop") ||
    s.includes("disco") ||
    s.includes("new wave") ||
    s.includes("synth")
  ) {
    return "Pop";
  }
  return "Other/Unknown";
}

const GlobalVizConfig = {
  DEFAULT_FEATURE_KEY,
  FEATURE_COLOR_MAP,
  FEATURE_GRADIENT_MAP,
  SUPERGENRE_ORDER,
  SUPERGENRE_COLORS,
  toSuperGenre,
};

if (typeof globalThis !== "undefined") {
  globalThis.GlobalVizConfig = GlobalVizConfig;
}

export {
  DEFAULT_FEATURE_KEY,
  FEATURE_COLOR_MAP,
  FEATURE_GRADIENT_MAP,
  SUPERGENRE_COLORS,
  SUPERGENRE_ORDER,
  GlobalVizConfig,
  toSuperGenre,
};
