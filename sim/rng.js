// Générateur aléatoire déterministe (mulberry32). Une graine → une bataille reproductible.
(function (root) {
  function RNG(seed) {
    this.seed = seed >>> 0;
    this.s = this.seed || 0x9e3779b9;
  }
  RNG.prototype.next = function () {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  // gaussienne approchée (somme de 3 uniformes), moyenne 0, écart-type ~0.58
  RNG.prototype.gauss = function () { return (this.next() + this.next() + this.next()) - 1.5; };

  root.RNG = RNG;
})(typeof module !== 'undefined' ? module.exports : (window.OT = window.OT || {}));
