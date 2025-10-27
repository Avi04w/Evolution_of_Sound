class VinylRecord {
  constructor() {
    this.imageEl = document.getElementById("record-player-image");
  }

  loadImage(imageUrl) {
    this.imageEl.src = imageUrl;
    console.log("hi")
  }
}
