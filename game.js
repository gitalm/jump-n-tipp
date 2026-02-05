(() => {
const WIDTH = 960;
const HEIGHT = 540;

// Tuning
const Tuning = {
initialSpeed: 180,
speedStep: 10,
speedStepEvery: 30,

obstacleDelayMs: 2400,
enemyStartDelayMs: 20000,
enemyDelayMs: 5200,
enemySpeedFactor: 1.02,

itemDelayMs: 8000,
itemSpeedFactor: 1.0,

gravityY: 2000,
jumpStrength: 720,
preJumpDistancePx: 42

};

const AudioCfg = {
bgmVol: 0.25,
sfxVol: 0.6
};

const GROUND_H = 56;

// Spielfigur kleiner
const PLAYER_SCALE = 0.95;

// Hindernisse: Fässer etwas kleiner
const PIRATE_OBSTACLES = [
{ key: 'pirate_barrel', path: 'assets/obstacles/barrel.png', scale: 0.62 }, // kleiner
{ key: 'pirate_thorn_big', path: 'assets/obstacles/big_thorns.png', scale: 0.78 },
{ key: 'pirate_thorn_small', path: 'assets/obstacles/small_thorn.png', scale: 0.86 }
];

// Gegnerinnen/Gegner
const PIRATE_ENEMIES = [
{ key: 'pirate_crab', path: 'assets/environment/crab.png', scale: 0.95, type: 'ground' },
{ key: 'pirate_parrot_enemy', path: 'assets/characters/parrot.png', scale: 0.85, type: 'air' }
];

// Bonus-Items (Uhr/Kompass kleiner)
const BONUS_ITEMS = [
{ key: 'item_coin', path: 'assets/items/coin.png', scale: 0.8,  word: 'muenze', points: 50 },
{ key: 'item_heart', path: 'assets/items/heart.png', scale: 0.8, word: 'herz',   points: 50 },
{ key: 'item_chest', path: 'assets/items/chest.png', scale: 0.85, word: 'schatz', points: 75 },
{ key: 'item_compass', path: 'assets/items/compass.png', scale: 0.7, word: 'uhr', points: 50 } // Uhr kleiner
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
jumpTriggerX: {}, // id -> X vor Objekt (Hindernis/Item)
idCounter: 1,
gameOver: false,
eventLog: []
};
this.groups = {};
this.sounds = {};
}

preload() {
  // Wörter
  this.load.text('woerter', 'woerter.txt');

  // Spieler
  this.load.image('player_parrot', 'assets/characters/parrot.png');

  // Hindernisse, Gegner, Items
  PIRATE_OBSTACLES.forEach(o => this.load.image(o.key, o.path));
  PIRATE_ENEMIES.forEach(e => this.load.image(e.key, e.path));
  BONUS_ITEMS.forEach(i => this.load.image(i.key, i.path));

  // Sounds
  this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
  this.load.audio('sfx_jump',  'assets/sounds/jump.wav');
  this.load.audio('bgm',       'assets/sounds/bgm.mp3');

  // Physischer Boden + sichtbarer Bodenstreifen
  const g = this.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x000000); g.fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundPhys', WIDTH, GROUND_H); g.clear();
  g.fillStyle(0x3fa34c); g.fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundVis', WIDTH, GROUND_H);
  g.destroy();
}

create() {
  this.cameras.main.setBackgroundColor('#7ec4ff');
  this.physics.world.gravity.y = Tuning.gravityY;

  // Wörter
  const raw = this.cache.text.get('woerter') || '';
  this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
  Phaser.Utils.Array.Shuffle(this.state.words);

  // Boden
  this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(-1);
  const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
  this.ground = physGround;

  // Spieler (Piratenvogel), kleinere Kollisionsbox bezogen auf Anzeigegröße
  const playerY = HEIGHT - GROUND_H - 40;
  this.player = this.physics.add.image(140, playerY, 'player_parrot');
  this.player.setScale(PLAYER_SCALE);
  this.player.setCollideWorldBounds(true);
  this.player.body.setSize(this.player.displayWidth * 0.6, this.player.displayHeight * 0.7);
  this.player.body.setOffset(this.player.displayWidth * 0.2, this.player.displayHeight * 0.15);
  this.player.body.setMaxVelocityY(1200);
  this.physics.add.collider(this.player, physGround);

  // Sounds vorbereiten
  this.sounds.kling = this.sound.add('sfx_kling', { volume: AudioCfg.sfxVol });
  this.sounds.jump  = this.sound.add('sfx_jump',  { volume: AudioCfg.sfxVol });
  this.sounds.bgm   = this.sound.add('bgm',       { volume: AudioCfg.bgmVol, loop: true });
  this.sounds.bgm.play();

  // Gruppen
  this.groups.obstacles = this.physics.add.group({ allowGravity: false });
  this.groups.enemies   = this.physics.add.group({ allowGravity: false });
  this.groups.items     = this.physics.add.group({ allowGravity: false });

  // Kollisionen
  this.physics.add.collider(this.player, this.groups.obstacles, (player, obst) => {
    if (!obst.cleared) this.gameOver('Mit Hindernis kollidiert');
  });
  this.physics.add.overlap(this.player, this.groups.enemies, (player, enemy) => {
    if (!enemy.destroyed) this.gameOver('Von Gegner getroffen');
  });
  this.physics.add.overlap(this.player, this.groups.items, (player, item) => {
    if (item.readyToCollect) this.collectItem(item);
  });

  // HUD
  this.hudText = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: 18, color: '#083056' }).setDepth(10);
  this.wordText = this.add.text(WIDTH/2, 10, '', { fontFamily: 'monospace', fontSize: 20, color: '#0b315a' })
    .setOrigin(0.5, 0).setDepth(10);
  this.pointsLogText = this.add.text(WIDTH - 12, 10, '', { fontFamily: 'monospace', fontSize: 14, color: '#083056', align: 'right' })
    .setOrigin(1, 0).setDepth(10);
  this.msgText = this.add.text(WIDTH/2, HEIGHT/2, '', { fontFamily: 'system-ui', fontSize: 28, color: '#083056' })
    .setOrigin(0.5).setDepth(20).setAlpha(0);

  // Eingabe
  this.input.keyboard.on('keydown', (e) => this.handleKey(e));
  // Mute-Toggle
  this.input.keyboard.on('keydown-M', () => { this.sound.mute = !this.sound.mute; this.toast(this.sound.mute ? 'Sound aus' : 'Sound an'); });

  // Spawner
  this.spawnTimerObstacles = this.time.addEvent({ delay: Tuning.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle() });
  this.time.delayedCall(Tuning.enemyStartDelayMs, () => {
    this.spawnTimerEnemies = this.time.addEvent({ delay: Tuning.enemyDelayMs, loop: true, callback: () => this.spawnEnemy() });
  });
  this.spawnTimerItems = this.time.addEvent({ delay: Tuning.itemDelayMs, loop: true, callback: () => this.spawnItem() });

  this.state.startTime = performance.now();
  this.updateHUD();
  this.updatePointsLog();
}

// Spawns
spawnObstacle() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_OBSTACLES);
  const id = this.state.idCounter++;
  const x = WIDTH + 120;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const hPix = temp.displayHeight; temp.destroy();
  const y = HEIGHT - GROUND_H - hPix / 2;

  const sprite = this.groups.obstacles.create(x, y, def.key);
  sprite.setScale(def.scale).setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed);
  sprite.body.setSize(sprite.displayWidth * 0.8, sprite.displayHeight * 0.85);
  sprite.body.setOffset(sprite.displayWidth * 0.1, sprite.displayHeight * 0.1);
  sprite.cleared = false; sprite.type = 'obstacle'; sprite.id = id;

  const word = this.nextWord();
  sprite.word = word;
  sprite.label = this.add.text(x, y - sprite.displayHeight / 2 - 20, word, {
    fontFamily: 'monospace', fontSize: 18, color: '#083056'
  }).setOrigin(0.5);
  if (!this.state.target) this.chooseTarget();
}

spawnEnemy() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_ENEMIES);
  const id = this.state.idCounter++; const x = WIDTH + 140;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const hPix = temp.displayHeight; temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude = def.type === 'ground' ? (groundY - hPix / 2) : (groundY - GROUND_H - Phaser.Math.Between(100, 160));

  const sprite = this.groups.enemies.create(x, altitude, def.key);
  sprite.setScale(def.scale).setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed * Tuning.enemySpeedFactor);
  sprite.destroyed = false; sprite.type = 'enemy'; sprite.id = id;
