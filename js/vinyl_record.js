class VinylRecord {
  constructor() {
    this.outerShell = document.getElementById("record-player-shell-out");
    this.imageEl = document.getElementById("record-player-image");
    this.audioEl = document.getElementById("player");
    this.pauseEl = document.getElementById("record-player-pause");
    this.playerArmEl = document.getElementById("record-player-arm");
    this.playing = false;

    this.outerShell.addEventListener("mouseenter", () => this.showPausePanel());
    this.outerShell.addEventListener("mouseleave", () => this.hidePausePanel());
    this.outerShell.addEventListener("click", () => this.playing ? this.pause() : this.play());
    this.audioEl.addEventListener("ended", () => {
      this.audioEl.currentTime = 0;
      this.play();
    })
  }

  async load(songUrl, imageUrl) {
    this.outerShell.style.animationPlayState = "paused";
    this.pauseEl.style.animationPlayState = "paused";
    this.audioEl.src = songUrl;
    this.imageEl.style.removeProperty("display");
    this.imageEl.src = imageUrl;
    this.outerShell.classList.add("rotate-infinite");
    await new Promise(r => setTimeout(r, 200));
  }

  play() {
    this.playing = true;
    this.audioEl.play().catch(err => console.error("Audio error:", err));
    this.outerShell.style.animationPlayState = "running";
    this.pauseEl.style.animationPlayState = "running";
    this.pauseEl.querySelector("span").textContent = "❚❚";
    this.playerArmEl.classList.remove("arm-animate-out");
    this.playerArmEl.classList.add("arm-animate-in");
  }

  pause() {
    this.playing = false;
    this.outerShell.style.animationPlayState = "paused";
    this.pauseEl.style.animationPlayState = "paused";
    this.audioEl.pause();
    this.pauseEl.querySelector("span").textContent = "▶";
    this.playerArmEl.classList.remove("arm-animate-in");
    this.playerArmEl.classList.add("arm-animate-out");
  }

  isPaused() {
    return this.audioEl.paused;
  }

  showPausePanel() {
    if (this.audioEl.src) this.pauseEl.style.opacity = 1;
  }

  hidePausePanel() {
    this.pauseEl.style.opacity = 0;
  }
}
