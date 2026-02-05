(() => {
const WIDTH = 960;
const HEIGHT = 540;

// Tuning: Tempo, Physik, Spawns, Parallax
const Tuning = {
initialSpeed: 180,
speedStep: 10,
speedStepEvery: 30,

obstacleDelayMs: 2400,
enemyStartDelayMs: 20000,
enemyDelayMs: 5200,
enemySpeedFactor: 1.02,

gravityY: 2000,
jumpStrength: 720,
preJumpDistancePx: 36,

runFrameRate: 6,

enemyPreferShortMaxLen: 6,

parallax: { sky: 0.08, far: 0.18, mid: 0.35, ground: 1.0 },

treeSpawnDelayMs: 5000,
treeSpeedFactor: 1.0

};

const GROUND_H = 56;

// Spieler-Spritesheet (wie zuvor)
const PLAYER_FRAME_W = 32;
const PLAYER_FRAME_H = 32;
const PLAYER_SCALE = 1.6;

// Piraten-Assets: Skalen pro Typ (optisch passend, Kollision fair)
const PIRATE_OBSTACLES = [
{ key: 'pirate_barrel', path: 'assets/obstacles/barrel.png', scale: 0.8 },
{ key: 'pirate_thorn_big', path: 'assets/obstacles/big_thorns.png', scale: 0.8 },
{ key: 'pirate_thorn_small', path: 'assets/obstacles/small_thorn.png', scale: 0.9 }
];
const PIRATE_ENEMIES = [
{ key: 'pirate_crab', path: 'assets/environment/crab.png', scale: 1.0, type: 'ground' },
{ key: 'pirate_parrot', path: 'assets/characters/parrot.png', scale: 0.9, type: 'air' }
];

const ENEMY_LABEL_COLOR = '#FFE4E6';
const OBST_LABEL_COLOR = '#ECEFF4';

class GameScene extends Phaser.Scene {
constructor() {
super('game');
this.state = {
words: [],
worldSpeed: Tuning.initialSpeed,
correctChars: 0,
errors: 0,
startTime: 0,
clears: 0,
target: null,
typedIndex: 0,
readyToJumpForId: null,
idCounter: 1
};
this.groups = {};
this.layers = {};
}

preload() {
  // Wortliste
  this.load.text('woerter', 'woerter.txt');

  // Spieler
  this.load.spritesheet('player', 'sprites/player.png', {
    frameWidth: PLAYER_FRAME_W,
    frameHeight: PLAYER_FRAME_H
  });

  // Hintergrund (wie zuvor, unverändert)
  this.load.image('bg_sky', 'sprites/bg_sky.png');
  this.load.image('bg_mountains_mid', 'sprites/bg_mountains_mid.png');
  this.load.image('bg_mountains_far', 'sprites/bg_mountains_far.png');
  this.load.image('bg_ground', 'sprites/bg_ground.png');

  // Piraten-Hindernisse
  PIRATE_OBSTACLES.forEach(o => this.load.image(o.key, o.path));

  // Piraten-Gegnerinnen/Gegner
  PIRATE_ENEMIES.forEach(e => this.load.image(e.key, e.path));

  // Physischer Boden (unsichtbar)
  const g = this.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x000000);
  g.fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundPhys', WIDTH, GROUND_H);
  g.destroy();
}

create() {
  this.physics.world.gravity.y = Tuning.gravityY;

  // Wörter
  const raw = this.cache.text.get('woerter') || '';
  this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
  Phaser.Utils.Array.Shuffle(this.state.words);

  // Parallax-Layer
  this.layers.sky = this.add.tileSprite(WIDTH/2, HEIGHT/2, WIDTH, HEIGHT, 'bg_sky').setDepth(-30);
  this.layers.far = this.add.tileSprite(WIDTH/2, HEIGHT*0.42, WIDTH, HEIGHT*0.5, 'bg_mountains_far').setDepth(-25);
  this.layers.mid = this.add.tileSprite(WIDTH/2, HEIGHT*0.60, WIDTH, HEIGHT*0.55, 'bg_mountains_mid').setDepth(-20);
  this.layers.ground = this.add.tileSprite(WIDTH/2, HEIGHT - GROUND_H/2, WIDTH, GROUND_H, 'bg_ground').setDepth(-10);

  // Physischer Boden
  const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
  this.ground = physGround;

  // Spieler
  const playerY = HEIGHT - GROUND_H - (PLAYER_FRAME_H * PLAYER_SCALE) / 2;
  this.player = this.physics.add.sprite(140, playerY, 'player', 0);
  this.player.setScale(PLAYER_SCALE);
  this.player.setCollideWorldBounds(true);
  this.player.body.setSize(PLAYER_FRAME_W * 0.62, PLAYER_FRAME_H * 0.88);
  this.player.body.setOffset(PLAYER_FRAME_W * 0.19, PLAYER_FRAME_H * 0.06);
  this.player.body.setMaxVelocityY(1200);
  this.physics.add.collider(this.player, physGround);

  // Animationen Spieler
  this.anims.create({ key: 'idle', frames: [{ key: 'player', frame: 0 }], frameRate: 1, repeat: -1 });
  this.anims.create({
    key: 'run',
    frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
    frameRate: Tuning.runFrameRate, repeat: -1
  });
  this.anims.create({ key: 'jump', frames: [{ key: 'player', frame: 1 }], frameRate: 1, repeat: -1 });
  this.player.anims.play('run', true);

  // Gruppen
  this.groups.obstacles = this.physics.add.group({ allowGravity: false });
  this.groups.enemies = this.physics.add.group({ allowGravity: false });

  // Kollisionen
  this.physics.add.collider(this.player, this.groups.obstacles, (player, obst) => {
    if (!obst.cleared) this.gameOver('Mit Hindernis kollidiert');
  });
  this.physics.add.overlap(this.player, this.groups.enemies, (player, enemy) => {
    if (!enemy.destroyed) this.gameOver('Von Gegner getroffen');
  });

  // HUD
  this.hudText = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: 18, color: '#ffffff' })
    .setScrollFactor(0).setDepth(10);
  this.wordText = this.add.text(WIDTH/2, 10, '', { fontFamily: 'monospace', fontSize: 20, color: '#E5E9F0' })
    .setOrigin(0.5, 0).setDepth(10);
  this.msgText = this.add.text(WIDTH/2, HEIGHT/2, '', { fontFamily: 'system-ui', fontSize: 28, color: '#ffffff' })
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

  this.state.startTime = performance.now();
  this.updateHUD();
}

// Hindernisse: Piraten-Fässer/Spikes
spawnObstacle() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_OBSTACLES);
  const id = this.state.idCounter++;
  const x = WIDTH + 120;

  // temporär anlegen, um Größe nach Skalierung zu kennen
  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const hPix = temp.displayHeight;
  temp.destroy();

  const y = HEIGHT - GROUND_H - hPix / 2;
  const sprite = this.groups.obstacles.create(x, y, def.key);
  sprite.setScale(def.scale);
  sprite.setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed);
  // Kollision etwas schlanker
  sprite.body.setSize(sprite.displayWidth * 0.8, sprite.displayHeight * 0.85);
  sprite.body.setOffset(sprite.displayWidth * 0.1, sprite.displayHeight * 0.1);

  sprite.cleared = false;
  sprite.type = 'obstacle';
  sprite.id = id;
  sprite.setDepth(0);

  const word = this.nextWord();
  sprite.word = word;
  sprite.label = this.add.text(x, y - sprite.displayHeight / 2 - 20, word, {
    fontFamily: 'monospace', fontSize: 18, color: OBST_LABEL_COLOR
  }).setOrigin(0.5).setDepth(0);

  if (!this.state.target) this.chooseTarget();
}

// Gegnerinnen/Gegner: Krabbe (Boden) oder Papagei (Luft)
spawnEnemy() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_ENEMIES);
  const id = this.state.idCounter++;
  const x = WIDTH + 140;

  // Vorab Größe
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
  sprite.setDepth(0);

  const word = this.nextWord({ preferShort: true });
  sprite.word = word;
  sprite.label = this.add.text(x, altitude - sprite.displayHeight / 2 - 18, word, {
    fontFamily: 'monospace', fontSize: 18, color: ENEMY_LABEL_COLOR
  }).setOrigin(0.5).setDepth(0);

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
    const idx = this.state.words.findIndex(w => w.length <= Tuning.enemyPreferShortMaxLen);
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
    target.cleared = true;
    target.setAlpha(0.85);
    target.body.checkCollision.none = true;
    this.state.readyToJumpForId = target.id;
  } else if (target.type === 'enemy') {
    this.destroyEnemy(target);
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

destroyEnemy(enemy) {
  enemy.destroyed = true;
  enemy.body.checkCollision.none = true;
  enemy.setTint(0xffffff);
  this.tweens.add({
    targets: [enemy],
    scale: 0.2,
    alpha: 0,
    duration: 180,
    onComplete: () => enemy.destroy()
  });
  if (enemy.label) enemy.label.destroy();
}

adjustWorldSpeed() {
  this.groups.obstacles.getChildren().forEach(o => {
    if (o.active) o.body.setVelocityX(-this.state.worldSpeed);
  });
  this.groups.enemies.getChildren().forEach(e => {
    if (e.active) e.body.setVelocityX(-this.state.worldSpeed * Tuning.enemySpeedFactor);
  });
}

flashWord() { this.cameras.main.flash(80, 247, 118, 142, false); }

update(time, delta) {
  const dx = (this.state.worldSpeed * delta) / 1000;

  // Parallax
  this.layers.sky.tilePositionX += dx * Tuning.parallax.sky;
  this.layers.far.tilePositionX += dx * Tuning.parallax.far;
  this.layers.mid.tilePositionX += dx * Tuning.parallax.mid;
  this.layers.ground.tilePositionX += dx * Tuning.parallax.ground;

  // Labels + Offscreen-Reinigung
  this.groups.obstacles.getChildren().forEach(o => {
    if (!o.active) return;
    if (o.label) { o.label.x = o.x; o.label.y = o.y - o.displayHeight / 2 - 20; }
    if (o.x < -100) { o.label && o.label.destroy(); o.destroy(); }
  });
  this.groups.enemies.getChildren().forEach(e => {
    if (!e.active) return;
    if (e.label) { e.label.x = e.x; e.label.y = e.y - e.displayHeight / 2 - 18; }
    if (e.x < -100) { e.label && e.label.destroy(); e.destroy(); }
  });

  // Auto-Sprung
  if (this.state.readyToJumpForId) {
    const target = this.groups.obstacles.getChildren().find(o => o.id === this.state.readyToJumpForId);
    if (target && target.active) {
      const playerFront = this.player.x + (PLAYER_FRAME_W * PLAYER_SCALE) / 2;
      if (playerFront >= target.x - Tuning.preJumpDistancePx && this.player.body.onFloor()) {
        this.player.setVelocityY(-Tuning.jumpStrength);
        if (this.player.anims.currentAnim?.key !== 'jump') this.player.anims.play('jump', true);
        this.state.readyToJumpForId = null;
      }
    } else {
      this.state.readyToJumpForId = null;
    }
  }

  // Animationen: Boden vs. Luft
  const onFloor = this.player.body.onFloor();
  if (!onFloor) {
    if (this.player.anims.currentAnim?.key !== 'jump') this.player.anims.play('jump', true);
  } else {
    if (this.player.anims.currentAnim?.key !== 'run') this.player.anims.play('run', true);
  }

  // Ziel ggf. neu wählen
  if (!this.state.target || !this.state.target.active ||
      (this.state.target.type === 'obstacle' && this.state.target.cleared) ||
      (this.state.target.type === 'enemy' && this.state.target.destroyed) ||
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
  this.hudText.setText(`WPM: ${wpm}   Genauigkeit: ${acc}%   Clears: ${this.state.clears}`);

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

  const minutes = Math.max(0.0001, (performance.now() - this.state.startTime) / 60000);
  const wpm = Math.round((this.state.correctChars / 5) / minutes);
  const acc = (this.state.correctChars + this.state.errors) > 0
    ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors))
    : 100;

  const entry = { ts: Date.now(), wpm, acc, clears: this.state.clears };
  const hist = JSON.parse(localStorage.getItem('jnt_history') || '[]');
  hist.push(entry);
  localStorage.setItem('jnt_history', JSON.stringify(hist));

  this.scene.pause();
  const center = this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH*0.72, 200, 0x000000, 0.6).setDepth(30);
  const text = this.add.text(WIDTH/2, HEIGHT/2, `Game Over\n${reason}\nWPM: ${wpm} | Genauigkeit: ${acc}% | Clears: ${this.state.clears}\nDrücke R für Neustart`, {
    fontFamily: 'system-ui', fontSize: 22, color: '#ffffff', align: 'center'
  }).setOrigin(0.5).setDepth(31);

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
backgroundColor: '#87b3e8',
render: { pixelArt: true, antialias: false },
physics: { default: 'arcade', arcade: { gravity: { y: Tuning.gravityY }, debug: false } },
scene: [GameScene]
};

new Phaser.Game(config);
})();
