class VinylRecord {
  constructor() {
    this.outerShell = document.getElementById("record-player-shell-out");
    this.imageEl = document.getElementById("record-player-image");
  }

  loadSong(imageUrl) {
    this.imageEl.style.removeProperty("display");
    this.imageEl.src = imageUrl;
    this.outerShell.classList.add("rotate-infinite");
    this.outerShell.style.animationPlayState = "running";
  }

  stopSong() {
    this.outerShell.style.animationPlayState = "paused";
  }
}
