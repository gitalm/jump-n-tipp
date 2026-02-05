(() => {
const WIDTH = 960;
const HEIGHT = 540;

// Tuning: Tempo, Physik, Spawns
const Tuning = {
initialSpeed: 180,
speedStep: 10,
speedStepEvery: 30,

obstacleDelayMs: 2400,
enemyStartDelayMs: 20000,
enemyDelayMs: 5200,
enemySpeedFactor: 1.02,

itemDelayMs: 8000,       // Bonus-Items (Münze/Herz/Schatz/Uhr)
itemSpeedFactor: 1.0,

gravityY: 2000,
jumpStrength: 720,
preJumpDistancePx: 42,   // etwas früher springen als bisher

};

const GROUND_H = 56;

// Spieler: Piratenvogel (Einzelbild)
const PLAYER_SCALE = 1.2;

// Hindernisse: kleinere Fässer, Dornen
const PIRATE_OBSTACLES = [
{ key: 'pirate_barrel', path: 'assets/obstacles/barrel.png', scale: 0.68 }, // kleiner als vorher
{ key: 'pirate_thorn_big', path: 'assets/obstacles/big_thorns.png', scale: 0.78 },
{ key: 'pirate_thorn_small', path: 'assets/obstacles/small_thorn.png', scale: 0.86 }
];

// Gegnerinnen/Gegner (optional: Krabbe am Boden oder Papagei in der Luft)
const PIRATE_ENEMIES = [
{ key: 'pirate_crab', path: 'assets/environment/crab.png', scale: 0.95, type: 'ground' },
{ key: 'pirate_parrot_enemy', path: 'assets/characters/parrot.png', scale: 0.9, type: 'air' }
];

// Bonus-Items
const BONUS_ITEMS = [
{ key: 'item_coin', path: 'assets/items/coin.png', scale: 0.9, word: 'muenze', points: 50 },
{ key: 'item_heart', path: 'assets/items/heart.png', scale: 0.9, word: 'herz', points: 50 },
{ key: 'item_chest', path: 'assets/items/chest.png', scale: 0.9, word: 'schatz', points: 75 },
{ key: 'item_compass', path: 'assets/items/compass.png', scale: 0.9, word: 'uhr', points: 50 }
];

class GameScene extends Phaser.Scene {
constructor() {
super('game');
this.state = {
words: [],
worldSpeed: Tuning.initialSpeed,
score: 0,
correctChars: 0,
errors: 0,
startTime: 0,
clears: 0,
target: null,
typedIndex: 0,
// Auto-Sprung: Trigger‑X pro Hindernis
jumpTriggerX: {},    // id -> x, an der gesprungen wird
idCounter: 1
};
this.groups = {};
this.hudText = null;
this.wordText = null;
this.msgText = null;
this.runTween = null;
}

preload() {
  // Wortliste
  this.load.text('woerter', 'woerter.txt');

  // Spielerbild (Piratenvogel)
  this.load.image('player_parrot', 'assets/characters/parrot.png');

  // Hindernisse
  PIRATE_OBSTACLES.forEach(o => this.load.image(o.key, o.path));

  // Gegnerinnen/Gegner
  PIRATE_ENEMIES.forEach(e => this.load.image(e.key, e.path));

  // Bonus-Items
  BONUS_ITEMS.forEach(i => this.load.image(i.key, i.path));

  // Physischer Boden (unsichtbar) + sichtbarer Bodenstreifen
  const g = this.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x000000);
  g.fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundPhys', WIDTH, GROUND_H);
  g.clear();

  // Sichtbarer Bodenstreifen (einfaches Grün)
  g.fillStyle(0x3fa34c);
  g.fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundVis', WIDTH, GROUND_H);
  g.destroy();
}

create() {
  // Blau als Spielhintergrund
  this.cameras.main.setBackgroundColor('#7ec4ff');
  this.physics.world.gravity.y = Tuning.gravityY;

  // Wörter
  const raw = this.cache.text.get('woerter') || '';
  this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
  Phaser.Utils.Array.Shuffle(this.state.words);

  // Sichtbarer Boden
  this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(-1);

  // Physischer Boden
  const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
  this.ground = physGround;

  // Spieler (Piratenvogel)
  const playerY = HEIGHT - GROUND_H - 40;
  this.player = this.physics.add.image(140, playerY, 'player_parrot');
  this.player.setScale(PLAYER_SCALE);
  this.player.setCollideWorldBounds(true);
  // Kollisionsbox schlank
  this.player.body.setSize(this.player.width * 0.6, this.player.height * 0.7);
  this.player.body.setOffset(this.player.width * 0.2, this.player.height * 0.15);
  this.player.body.setMaxVelocityY(1200);
  this.physics.add.collider(this.player, physGround);

  // „Lauf“-Optik: sanftes Wippen am Boden (pausiert in der Luft)
  this.runTween = this.tweens.add({
    targets: this.player,
    y: '+=2',
    duration: 400,
    yoyo: true,
    repeat: -1,
    paused: false
  });

  // Gruppen
  this.groups.obstacles = this.physics.add.group({ allowGravity: false });
  this.groups.enemies = this.physics.add.group({ allowGravity: false });
  this.groups.items = this.physics.add.group({ allowGravity: false });

  // Kollisionen
  this.physics.add.collider(this.player, this.groups.obstacles, (player, obst) => {
    // Nur wenn NICHT „cleared“ (also Wort nicht korrekt getippt)
    if (!obst.cleared) this.gameOver('Mit Hindernis kollidiert');
  });
  this.physics.add.overlap(this.player, this.groups.enemies, (player, enemy) => {
    if (!enemy.destroyed) this.gameOver('Von Gegner getroffen');
  });
  // Items sind ungefährlich: Overlap = „einsammeln“, aber nur wenn bereits korrekt getippt
  this.physics.add.overlap(this.player, this.groups.items, (player, item) => {
    if (item.readyToCollect) this.collectItem(item);
  });

  // HUD
  this.hudText = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: 18, color: '#083056' })
    .setScrollFactor(0).setDepth(10);
  this.wordText = this.add.text(WIDTH/2, 10, '', { fontFamily: 'monospace', fontSize: 20, color: '#0b315a' })
    .setOrigin(0.5, 0).setDepth(10);
  this.msgText = this.add.text(WIDTH/2, HEIGHT/2, '', { fontFamily: 'system-ui', fontSize: 28, color: '#083056' })
    .setOrigin(0.5).setDepth(20).setAlpha(0);

  // Eingabe
  this.input.keyboard.on('keydown', (e) => this.handleKey(e));

  // Spawner
  this.spawnTimerObstacles = this.time.addEvent({
    delay: Tuning.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle()
  });
  this.time.delayedCall(Tuning.enemyStartDelayMs, () => {
    this.spawnTimerEnemies = this.time.addEvent({
      delay: Tuning.enemyDelayMs, loop: true, callback: () => this.spawnEnemy()
    });
  });
  this.spawnTimerItems = this.time.addEvent({
    delay: Tuning.itemDelayMs, loop: true, callback: () => this.spawnItem()
  });

  this.state.startTime = performance.now();
  this.updateHUD();
}

// Spawner: Hindernis
spawnObstacle() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_OBSTACLES);
  const id = this.state.idCounter++;
  const x = WIDTH + 120;

  // Größe nach Skalierung bestimmen
  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const wPix = temp.displayWidth, hPix = temp.displayHeight;
  temp.destroy();

  const y = HEIGHT - GROUND_H - hPix / 2;
  const sprite = this.groups.obstacles.create(x, y, def.key);
  sprite.setScale(def.scale);
  sprite.setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed);
  // faire Kollisionsbox
  sprite.body.setSize(sprite.displayWidth * 0.8, sprite.displayHeight * 0.85);
  sprite.body.setOffset(sprite.displayWidth * 0.1, sprite.displayHeight * 0.1);

  sprite.cleared = false;
  sprite.type = 'obstacle';
  sprite.id = id;

  const word = this.nextWord();
  sprite.word = word;
  sprite.label = this.add.text(x, y - sprite.displayHeight / 2 - 20, word, {
    fontFamily: 'monospace', fontSize: 18, color: '#083056'
  }).setOrigin(0.5);

  if (!this.state.target) this.chooseTarget();
}

// Spawner: Gegnerinnen/Gegner
spawnEnemy() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_ENEMIES);
  const id = this.state.idCounter++;
  const x = WIDTH + 140;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const hPix = temp.displayHeight;
  temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude =
    def.type === 'ground'
      ? (groundY - hPix / 2)
      : (groundY - GROUND_H - Phaser.Math.Between(100, 160));

  const sprite = this.groups.enemies.create(x, altitude, def.key);
  sprite.setScale(def.scale);
  sprite.setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed * Tuning.enemySpeedFactor);
  sprite.destroyed = false;
  sprite.type = 'enemy';
  sprite.id = id;

  const word = this.nextWord({ preferShort: true });
  sprite.word = word;
  sprite.label = this.add.text(x, altitude - sprite.displayHeight / 2 - 18, word, {
    fontFamily: 'monospace', fontSize: 18, color: '#9b2c2c'
  }).setOrigin(0.5);

  if (!this.state.target) this.chooseTarget();
}

// Spawner: Bonus-Items (gefährden nicht, geben Punkte)
spawnItem() {
  const def = Phaser.Utils.Array.GetRandom(BONUS_ITEMS);
  const id = this.state.idCounter++;
  const x = WIDTH + 160;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const hPix = temp.displayHeight;
  temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude = Phaser.Math.Between(0, 1)
    ? (groundY - hPix / 2)             // Boden
    : (groundY - GROUND_H - Phaser.Math.Between(90, 150)); // Luft

  const sprite = this.groups.items.create(x, altitude, def.key);
  sprite.setScale(def.scale);
  sprite.setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed * Tuning.itemSpeedFactor);
  sprite.type = 'item';
  sprite.id = id;
  sprite.word = def.word;
  sprite.points = def.points;
  sprite.readyToCollect = false;

  sprite.label = this.add.text(x, altitude - sprite.displayHeight / 2 - 18, def.word, {
    fontFamily: 'monospace', fontSize: 18, color: '#0b315a'
  }).setOrigin(0.5);

  if (!this.state.target) this.chooseTarget();
}

// Wortauswahl
nextWord(opts = {}) {
  if (this.state.words.length === 0) {
    const raw = this.cache.text.get('woerter') || '';
    this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
    Phaser.Utils.Array.Shuffle(this.state.words);
  }
  if (opts.preferShort) {
    const idx = this.state.words.findIndex(w => w.length <= 6);
    if (idx > -1) return this.state.words.splice(idx, 1)[0];
  }
  return this.state.words.shift();
}

// Ziel wählen
chooseTarget() {
  const candidates = [];
  this.groups.obstacles.getChildren().forEach(o => {
    if (o.active && !o.cleared && o.x > this.player.x - 10) candidates.push(o);
  });
  this.groups.enemies.getChildren().forEach(e => {
    if (e.active && !e.destroyed && e.x > this.player.x - 10) candidates.push(e);
  });
  this.groups.items.getChildren().forEach(i => {
    if (i.active && !i.readyToCollect && i.x > this.player.x - 10) candidates.push(i);
  });

  if (candidates.length === 0) {
    this.state.target = null;
    this.state.typedIndex = 0;
    this.wordText.setText('');
    return;
  }
  candidates.sort((a, b) => a.x - b.x);
  const target = candidates[0];
  this.state.target = target;
  this.state.typedIndex = 0;
  this.wordText.setText(target.word);
  this.updateTargetLabelProgress();
}

// Eingabe-Logik
handleKey(e) {
  if (!this.state.target) return;
  const key = e.key;
  if (!key || key.length !== 1) return;

  const expected = this.normalize(this.state.target.word[this.state.typedIndex] || '');
  const got = this.normalize(key);

  if (got === expected) {
    this.state.typedIndex++;
    this.state.correctChars++;
    this.updateTargetLabelProgress();
    if (this.state.typedIndex === this.state.target.word.length) {
      this.onWordCompleted(this.state.target);
    }
  } else {
    this.state.errors++;
    this.flashWord();
  }
  this.updateHUD();
}

normalize(ch) { return ch.toLowerCase(); }

updateTargetLabelProgress() {
  const t = this.state.target;
  if (!t || !t.label) return;
  const typed = t.word.slice(0, this.state.typedIndex);
  const rest = t.word.slice(this.state.typedIndex);
  t.label.setText(typed + rest);
}

onWordCompleted(target) {
  if (target.type === 'obstacle') {
    // Hindernis „clearen“ und Sprung zuverlässig einplanen
    target.cleared = true;
    target.body.checkCollision.none = true;
    // exakte Trigger‑X: linke Kante des Hindernisses minus PreJump
    const triggerX = (target.x - target.displayWidth / 2) - Tuning.preJumpDistancePx;
    this.state.jumpTriggerX[target.id] = triggerX;

    // Sofort springen, wenn wir schon sehr nahe dran sind und am Boden sind
    const playerFront = this.player.body.x + this.player.body.width;
    if (playerFront >= triggerX - 6 && this.player.body.onFloor()) {
      this.player.setVelocityY(-Tuning.jumpStrength);
      delete this.state.jumpTriggerX[target.id];
    }

    // Punkte für korrekt getipptes Hindernis
    this.state.score += 10;
  } else if (target.type === 'enemy') {
    this.destroyEnemy(target);
    this.state.score += 20;
  } else if (target.type === 'item') {
    // Item freischalten und sofort einsammeln, falls wir überlappen
    target.readyToCollect = true;
    this.collectItem(target);
  }

  this.state.clears++;
  if (this.state.clears % Tuning.speedStepEvery === 0) {
    this.state.worldSpeed += Tuning.speedStep;
    this.adjustWorldSpeed();
    this.toast(`Schneller! Speed ${Math.round(this.state.worldSpeed)}px/s`);
  }

  this.state.target = null;
  this.wordText.setText('');
  this.chooseTarget();
}

collectItem(item) {
  if (!item.active) return;
  this.state.score += (item.points || 25);
  item.label && item.label.destroy();
  item.destroy();
  this.toast('+ ' + (item.points || 25));
}

destroyEnemy(enemy) {
  enemy.destroyed = true;
  enemy.body.checkCollision.none = true;
  this.tweens.add({
    targets: [enemy],
    scale: 0.2,
    alpha: 0,
    duration: 180,
    onComplete: () => {
      enemy.label && enemy.label.destroy();
      enemy.destroy();
    }
  });
}

adjustWorldSpeed() {
  this.groups.obstacles.getChildren().forEach(o => {
    if (o.active) o.body.setVelocityX(-this.state.worldSpeed);
  });
  this.groups.enemies.getChildren().forEach(e => {
    if (e.active) e.body.setVelocityX(-this.state.worldSpeed * Tuning.enemySpeedFactor);
  });
  this.groups.items.getChildren().forEach(i => {
    if (i.active) i.body.setVelocityX(-this.state.worldSpeed * Tuning.itemSpeedFactor);
  });
}

flashWord() { this.cameras.main.flash(80, 247, 118, 142, false); }

update(time, delta) {
  // Lauf‑Wippen nur am Boden
  if (this.player.body.onFloor()) {
    this.runTween && (this.runTween.paused = false);
  } else {
    this.runTween && (this.runTween.paused = true);
  }

  // Labels folgen + Offscreen aufräumen
  this.groups.obstacles.getChildren().forEach(o => {
    if (!o.active) return;
    if (o.label) { o.label.x = o.x; o.label.y = o.y - o.displayHeight / 2 - 20; }
    if (o.x < -100) { o.label && o.label.destroy(); o.destroy(); delete this.state.jumpTriggerX[o.id]; }
  });
  this.groups.enemies.getChildren().forEach(e => {
    if (!e.active) return;
    if (e.label) { e.label.x = e.x; e.label.y = e.y - e.displayHeight / 2 - 18; }
    if (e.x < -100) { e.label && e.label.destroy(); e.destroy(); }
  });
  this.groups.items.getChildren().forEach(i => {
    if (!i.active) return;
    if (i.label) { i.label.x = i.x; i.label.y = i.y - i.displayHeight / 2 - 18; }
    if (i.x < -100) { i.label && i.label.destroy(); i.destroy(); }
  });

  // Zuverlässiger Auto‑Sprung:
  // Springe, sobald die Front des Players die Trigger‑X des cleared Hindernisses erreicht und am Boden ist.
  const playerFront = this.player.body.x + this.player.body.width;
  Object.keys(this.state.jumpTriggerX).forEach(idStr => {
    const id = +idStr;
    const triggerX = this.state.jumpTriggerX[id];
    // Suche das Hindernis, zu dem der Trigger gehört (nur aktiv)
    const obst = this.groups.obstacles.getChildren().find(o => o.id === id && o.active);
    if (!obst) { delete this.state.jumpTriggerX[id]; return; }

    // Sicherheitsfenster: springe in einem kleinen Bereich vor der Hinderniskante
    const safeWindow = 10;
    if (playerFront >= triggerX - safeWindow && this.player.body.onFloor()) {
      this.player.setVelocityY(-Tuning.jumpStrength);
      delete this.state.jumpTriggerX[id];
    }

    // Falls wir (durch Timing) bereits an/über der Hinderniskante sind und noch nicht gesprungen:
    const leftEdge = obst.x - obst.displayWidth / 2;
    if (playerFront > leftEdge + 6 && this.player.body.onFloor() && this.state.jumpTriggerX[id]) {
      this.player.setVelocityY(-Tuning.jumpStrength);
      delete this.state.jumpTriggerX[id];
    }
  });

  // Ziel ggf. neu wählen
  if (!this.state.target || !this.state.target.active ||
      (this.state.target.type === 'obstacle' && this.state.target.cleared) ||
      (this.state.target.type === 'enemy' && this.state.target.destroyed) ||
      (this.state.target.type === 'item' && this.state.target.readyToCollect) ||
      (this.state.target.x < this.player.x - 20)) {
    this.chooseTarget();
  }

  this.updateHUD();
}

updateHUD() {
  const minutes = Math.max(0.0001, (performance.now() - this.state.startTime) / 60000);
  const wpm = Math.round((this.state.correctChars / 5) / minutes);
  const acc = (this.state.correctChars + this.state.errors) > 0
    ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors))
    : 100;
  this.hudText.setText(`Score: ${this.state.score}   WPM: ${wpm}   Genauigkeit: ${acc}%   Clears: ${this.state.clears}`);

  if (this.state.target) {
    const typed = this.state.target.word.slice(0, this.state.typedIndex);
    const rest = this.state.target.word.slice(this.state.typedIndex);
    this.wordText.setText(typed + rest);
  }
}

toast(msg) {
  this.msgText.setText(msg);
  this.tweens.killTweensOf(this.msgText);
  this.msgText.setAlpha(1);
  this.tweens.add({ targets: this.msgText, alpha: 0, duration: 1200, ease: 'Sine.easeOut', delay: 300 });
}

gameOver(reason) {
  this.spawnTimerObstacles && this.spawnTimerObstacles.remove();
  this.spawnTimerEnemies && this.spawnTimerEnemies.remove();
  this.spawnTimerItems && this.spawnTimerItems.remove();

  const minutes = Math.max(0.0001, (performance.now() - this.state.startTime) / 60000);
  const wpm = Math.round((this.state.correctChars / 5) / minutes);
  const acc = (this.state.correctChars + this.state.errors) > 0
    ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors))
    : 100;

  // lokal speichern
  const entry = { ts: Date.now(), wpm, acc, clears: this.state.clears, score: this.state.score };
  const hist = JSON.parse(localStorage.getItem('jnt_history') || '[]');
  hist.push(entry);
  localStorage.setItem('jnt_history', JSON.stringify(hist));

  this.scene.pause();
  const center = this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH*0.76, 220, 0x000000, 0.35).setDepth(30);
  const text = this.add.text(WIDTH/2, HEIGHT/2,
    `Game Over\n${reason}\nScore: ${this.state.score} | WPM: ${wpm} | Genauigkeit: ${acc}% | Clears: ${this.state.clears}\nDrücke R für Neustart`,
    { fontFamily: 'system-ui', fontSize: 20, color: '#083056', align: 'center' }
  ).setOrigin(0.5).setDepth(31);

  this.input.keyboard.once('keydown-R', () => {
    center.destroy(); text.destroy();
    this.scene.restart();
  });
}

}

const config = {
type: Phaser.AUTO,
width: WIDTH,
height: HEIGHT,
parent: 'game',
backgroundColor: '#7ec4ff',
render: { pixelArt: true, antialias: false },
physics: { default: 'arcade', arcade: { gravity: { y: Tuning.gravityY }, debug: false } },
scene: [GameScene]
};

new Phaser.Game(config);
})();
