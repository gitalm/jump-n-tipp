(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Level-Presets: behutsame Beschleunigung
const LevelPresets = {
einfach: { initialSpeed: 150, accelPerMinute: 8,  obstacleDelayMs: 2800, enemyDelayMs: 6000, itemDelayMs: 9000, maxExtraSpeed: 80 },
mittel:  { initialSpeed: 180, accelPerMinute: 12, obstacleDelayMs: 2400, enemyDelayMs: 5200, itemDelayMs: 8000, maxExtraSpeed: 100 },
schnell: { initialSpeed: 220, accelPerMinute: 16, obstacleDelayMs: 2000, enemyDelayMs: 4500, itemDelayMs: 7200, maxExtraSpeed: 120 }
};

const AudioCfg = { bgmVol: 0.25, sfxVol: 0.6 };
const PLAYER_SCALE = 0.95;

const PIRATE_OBSTACLES = [
{ key: 'pirate_barrel', path: 'assets/obstacles/barrel.png', scale: 0.62 },
{ key: 'pirate_thorn_big', path: 'assets/obstacles/big_thorns.png', scale: 0.78 },
{ key: 'pirate_thorn_small', path: 'assets/obstacles/small_thorn.png', scale: 0.86 }
];
const PIRATE_ENEMIES = [
{ key: 'pirate_crab', path: 'assets/environment/crab.png', scale: 0.95, type: 'ground' },
{ key: 'pirate_parrot_enemy', path: 'assets/characters/parrot.png', scale: 0.85, type: 'air' }
];
const BONUS_ITEMS = [
{ key: 'item_coin', path: 'assets/items/coin.png',     scale: 0.8,  word: 'muenze', points: 50 },
{ key: 'item_heart', path: 'assets/items/heart.png',   scale: 0.8,  word: 'herz',   points: 50 },
{ key: 'item_chest', path: 'assets/items/chest.png',   scale: 0.85, word: 'schatz', points: 75 },
{ key: 'item_compass', path: 'assets/items/compass.png', scale: 0.7, word: 'uhr',   points: 50 }
];

class GameScene extends Phaser.Scene {
constructor() {
super('game');

  // Level aus localStorage
  this.levelName = localStorage.getItem('jnt_level') || 'mittel';
  this.level = LevelPresets[this.levelName] || LevelPresets.mittel;

  this.state = {
    words: [],
    worldSpeed: this.level.initialSpeed,
    score: 0,
    correctChars: 0,
    errors: 0,
    startTime: performance.now(),
    clears: 0,
    target: null,
    typedIndex: 0,
    jumpTriggerX: {},
    idCounter: 1,
    gameOver: false,
    eventLog: []
  };

  this.groups = {};
  this.sounds = {};
  this.ui = {};
  this.presenter = {};
}

preload() {
  this.load.text('woerter', 'woerter.txt');

  // Animationsframes (Einzelbilder)
  this.load.image('parrot1', 'assets/characters/parrot.png');
  this.load.image('parrot2', 'assets/characters/parrot2.png');
  this.load.image('parrot3', 'assets/characters/parrot3.png');

  this.load.image('pigeon1', 'assets/characters/pigeon.png');
  this.load.image('pigeon2', 'assets/characters/pigeon2.png');
  this.load.image('pigeon3', 'assets/characters/pigeon3.png');
  // Hinweis: keine pigeons*.png mehr, wie gewünscht

  PIRATE_OBSTACLES.forEach(o => this.load.image(o.key, o.path));
  PIRATE_ENEMIES.forEach(e => this.load.image(e.key, e.path));
  BONUS_ITEMS.forEach(i => this.load.image(i.key, i.path));

  // Sounds (mp3)
  this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
  this.load.audio('sfx_jump',  'assets/sounds/jump.mp3');
  this.load.audio('bgm',       'assets/sounds/bgm.mp3');

  // Platzhalter + Sprechblase
  const g = this.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x3fa34c).fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundVis', WIDTH, GROUND_H); g.clear();
  g.fillStyle(0x000000).fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundPhys', WIDTH, GROUND_H); g.clear();
  g.fillStyle(0xffb300).fillRoundedRect(0, 0, 38, 38, 6);
  g.generateTexture('ph_player', 38, 38); g.clear();
  const bubbleW = 300, bubbleH = 68;
  g.fillStyle(0xffffff, 0.9);
  g.fillRoundedRect(0, 0, bubbleW, bubbleH, 12);
  g.fillStyle(0xffffff, 0.9);
  g.beginPath(); g.moveTo(40, bubbleH); g.lineTo(58, bubbleH); g.lineTo(52, bubbleH + 12);
  g.closePath(); g.fillPath();
  g.generateTexture('bubble', bubbleW, bubbleH + 12);
  g.destroy();
}

create() {
  // Bugfix: Welt sicher aktiv
  this.physics.world.resume();
  this.state.gameOver = false;

  this.cameras.main.setBackgroundColor('#7ec4ff');
  this.physics.world.gravity.y = 2000;

  // Wörter
  const raw = this.cache.text.get('woerter') || '';
  this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
  if (this.state.words.length === 0) this.state.words = ['muenze','herz','schatz','uhr','lauf','spring'];
  Phaser.Utils.Array.Shuffle(this.state.words);

  // Boden
  this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(-1);
  const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
  this.ground = physGround;

  // Animationen
  const parrotFrames = [
    { key: this.textures.exists('parrot1') ? 'parrot1' : 'ph_player' },
    { key: this.textures.exists('parrot2') ? 'parrot2' : (this.textures.exists('parrot1') ? 'parrot1' : 'ph_player') },
    { key: this.textures.exists('parrot3') ? 'parrot3' : (this.textures.exists('parrot2') ? 'parrot2' : (this.textures.exists('parrot1') ? 'parrot1' : 'ph_player')) }
  ];
  this.anims.create({ key: 'parrot_run',  frames: parrotFrames, frameRate: 6, repeat: -1 });
  this.anims.create({ key: 'parrot_jump', frames: [parrotFrames[1]], frameRate: 1, repeat: -1 });

  const p2Key = this.textures.exists('pigeon2') ? 'pigeon2' : 'pigeon1';
  const p3Key = this.textures.exists('pigeon3') ? 'pigeon3' : p2Key;
  const pigeonFrames = [
    { key: this.textures.exists('pigeon1') ? 'pigeon1' : 'ph_player' },
    { key: p2Key },
    { key: p3Key },
    { key: p2Key }
  ];
  this.anims.create({ key: 'pigeon_talk', frames: pigeonFrames, frameRate: 3, yoyo: true, repeat: -1 });

  // Spieler
  const playerStartKey = this.textures.exists('parrot1') ? 'parrot1' : 'ph_player';
  const playerY = HEIGHT - GROUND_H - 40;
  this.player = this.physics.add.sprite(140, playerY, playerStartKey);
  this.player.setScale(PLAYER_SCALE);
  this.player.setCollideWorldBounds(true);
  this.player.body.setSize(this.player.displayWidth * 0.6, this.player.displayHeight * 0.7);
  this.player.body.setOffset(this.player.displayWidth * 0.2, this.player.displayHeight * 0.15);
  this.player.body.setMaxVelocityY(1200);
  this.physics.add.collider(this.player, physGround);
  this.player.anims.play('parrot_run');

  // Sounds
  this.sounds.kling = this.sound.add('sfx_kling', { volume: AudioCfg.sfxVol });
  this.sounds.jump  = this.sound.add('sfx_jump',  { volume: AudioCfg.sfxVol });
  this.sounds.bgm   = this.sound.add('bgm',       { volume: AudioCfg.bgmVol, loop: true });
  const startAudio = () => { if (!this.sounds.bgm.isPlaying) this.sounds.bgm.play(); };
  if (this.sound.locked) this.sound.once('unlocked', startAudio); else startAudio();

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
  this.ui.hud = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: 18, color: '#083056' }).setDepth(50);
  this.ui.log = this.add.text(WIDTH - 12, 10, 'Punkte-Log:', { fontFamily: 'monospace', fontSize: 14, color: '#083056', align: 'right' })
    .setOrigin(1, 0).setDepth(50);
  this.ui.msg = this.add.text(WIDTH/2, HEIGHT/2, '', { fontFamily: 'system-ui', fontSize: 28, color: '#083056' })
    .setOrigin(0.5).setDepth(100).setAlpha(0);

  // Präsentations‑Vogel oben und seitlich, Sprechblase deutlich darüber
  const PigeonPos = { x: 110, y: HEIGHT - GROUND_H - 200 };
  const pigeonStartKey = this.textures.exists('pigeon1') ? 'pigeon1' : 'ph_player';
  this.presenter.pigeon = this.add.sprite(PigeonPos.x, PigeonPos.y, pigeonStartKey).setScale(0.9).setDepth(40);
  this.presenter.pigeon.anims.play('pigeon_talk');
  // Sprechblase höher und etwas rechts, damit der Vogel sichtbar bleibt
  this.presenter.bubble = this.add.image(PigeonPos.x + 170, PigeonPos.y - 80, 'bubble').setDepth(41);
  this.presenter.text = this.add.text(PigeonPos.x + 170, PigeonPos.y - 88, '', {
    fontFamily: 'monospace', fontSize: 20, color: '#083056'
  }).setOrigin(0.5).setDepth(42);

  // Eingabe: nur Shift+M zum Muten (kein Konflikt mit „m“ beim Tippen)
  this.input.keyboard.on('keydown', (e) => {
    if (e.shiftKey && (e.key || '').toLowerCase() === 'm') {
      const newMute = !this.sound.mute;
      this.sound.mute = newMute;
      if (this.sounds.bgm) this.sounds.bgm.mute = newMute; // zur Sicherheit auch Musik toggeln
      this.toast(newMute ? 'Alle Sounds aus' : 'Alle Sounds an');
      return; // nicht als Eingabe für das Wort verarbeiten
    }
    this.handleKey(e);
  });

  // Spawner mit Level-Werten
  this.spawnTimerObstacles = this.time.addEvent({
    delay: this.level.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle()
  });
  this.spawnTimerEnemies = this.time.addEvent({
    delay: this.level.enemyDelayMs, loop: true, callback: () => this.spawnEnemy()
  });
  this.spawnTimerItems = this.time.addEvent({
    delay: this.level.itemDelayMs, loop: true, callback: () => this.spawnItem()
  });

  // Direkt etwas spawnen
  this.spawnObstacle();
  this.spawnItem();

  this.state.startTime = performance.now();
  this.updateHUD();
  this.updatePointsLog();
  this.updatePresenterWord();

  // Level-Buttons anbinden (außerhalb des Spiels)
  this.setupLevelButtons();
}

setupLevelButtons() {
  const ids = { einfach: 'level-einfach', mittel: 'level-mittel', schnell: 'level-schnell' };
  Object.values(ids).forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(ids[this.levelName])?.classList.add('active');

  Object.entries(ids).forEach(([name, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => {
      localStorage.setItem('jnt_level', name);
      this.scene.restart(); // Level wird im constructor neu eingelesen
    };
  });
}

ensureTexture(key, fallback) { return this.textures.exists(key) ? key : fallback; }

// Spawns
spawnObstacle() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_OBSTACLES);
  const id = this.state.idCounter++;
  const x = WIDTH + 120;

  const temp = this.add.image(0, 0, this.ensureTexture(def.key, 'ph_player')).setScale(def.scale);
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
  }).setOrigin(0.5).setDepth(30);

  if (!this.state.target) this.chooseTarget(); else this.updatePresenterWord();
}

spawnEnemy() {
  const def = Phaser.Utils.Array.GetRandom(PIRATE_ENEMIES);
  const id = this.state.idCounter++;
  const x = WIDTH + 140;

  const temp = this.add.image(0, 0, this.ensureTexture(def.key, 'ph_player')).setScale(def.scale);
  const hPix = temp.displayHeight; temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude = def.type === 'ground' ? (groundY - hPix / 2) : (groundY - GROUND_H - Phaser.Math.Between(100, 160));

  const sprite = this.groups.enemies.create(x, altitude, def.key);
  sprite.setScale(def.scale).setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed * 1.02);
  sprite.destroyed = false; sprite.type = 'enemy'; sprite.id = id;

  const word = this.nextWord({ preferShort: true });
  sprite.word = word;
  sprite.label = this.add.text(x, altitude - sprite.displayHeight / 2 - 18, word, {
    fontFamily: 'monospace', fontSize: 18, color: '#9b2c2c'
  }).setOrigin(0.5).setDepth(30);

  if (!this.state.target) this.chooseTarget(); else this.updatePresenterWord();
}

spawnItem() {
  const def = Phaser.Utils.Array.GetRandom(BONUS_ITEMS);
  const id = this.state.idCounter++;
  const x = WIDTH + 160;

  const temp = this.add.image(0, 0, this.ensureTexture(def.key, 'ph_player')).setScale(def.scale);
  const hPix = temp.displayHeight; temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude = Phaser.Math.Between(0, 1) ? (groundY - hPix / 2) : (groundY - GROUND_H - Phaser.Math.Between(90, 150));

  const sprite = this.groups.items.create(x, altitude, def.key);
  sprite.setScale(def.scale).setImmovable(true);
  sprite.body.setVelocityX(-this.state.worldSpeed);
  sprite.type = 'item'; sprite.id = id; sprite.word = def.word; sprite.points = def.points;
  sprite.readyToCollect = false;

  sprite.label = this.add.text(x, altitude - sprite.displayHeight / 2 - 18, def.word, {
    fontFamily: 'monospace', fontSize: 18, color: '#0b315a'
  }).setOrigin(0.5).setDepth(30);

  if (!this.state.target) this.chooseTarget(); else this.updatePresenterWord();
}

// Wörter
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
  this.groups.obstacles.getChildren().forEach(o => { if (o.active && !o.cleared && o.x > this.player.x - 10) candidates.push(o); });
  this.groups.enemies.getChildren().forEach(e => { if (e.active && !e.destroyed && e.x > this.player.x - 10) candidates.push(e); });
  this.groups.items.getChildren().forEach(i => { if (i.active && !i.readyToCollect && i.x > this.player.x - 10) candidates.push(i); });

  if (candidates.length === 0) {
    this.state.target = null; this.state.typedIndex = 0;
    this.updatePresenterWord();
    return;
  }
  candidates.sort((a, b) => a.x - b.x);
  const target = candidates[0];
  this.state.target = target; this.state.typedIndex = 0;
  this.updateTargetLabelProgress();
  this.updatePresenterWord();
}

// Eingabe
handleKey(e) {
  if (this.state.gameOver) return;
  if (!this.state.target) return;
  const key = e.key;
  if (!key || key.length !== 1) return; // nur echte Zeichen

  const expected = this.normalize(this.state.target.word[this.state.typedIndex] || '');
  const got = this.normalize(key);

  if (got === expected) {
    this.state.typedIndex++; this.state.correctChars++;
    this.updateTargetLabelProgress();
    this.updatePresenterWord();
    if (this.state.typedIndex === this.state.target.word.length) this.onWordCompleted(this.state.target);
  } else {
    this.state.errors++; this.flashWord();
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

updatePresenterWord() {
  const t = this.state.target;
  if (t) {
    const typed = t.word.slice(0, this.state.typedIndex);
    const rest = t.word.slice(this.state.typedIndex);
    this.presenter.text.setText(typed + rest);
  } else {
    this.presenter.text.setText('…');
  }
}

addPoints(reason, pts) {
  this.state.score += pts;
  this.state.eventLog.push({ t: Date.now(), reason, pts });
  if (this.state.eventLog.length > 10) this.state.eventLog.shift();
  this.updatePointsLog();
  this.toast(`+${pts} ${reason}`);
}

updatePointsLog() {
  const lines = ['Punkte-Log:'];
  for (let i = this.state.eventLog.length - 1; i >= 0; i--) {
    const e = this.state.eventLog[i];
    lines.push(`+${e.pts} ${e.reason}`);
    if (lines.length > 8) break;
  }
  this.ui.log.setText(lines.join('\n'));
}

onWordCompleted(target) {
  if (target.type === 'obstacle') {
    target.cleared = true;
    target.body.checkCollision.none = true;
    const triggerX = (target.x - target.displayWidth / 2) - 56; // früherer Sprung
    this.state.jumpTriggerX[target.id] = triggerX;
    this.addPoints('Hindernis', 10);
  } else if (target.type === 'enemy') {
    this.destroyEnemy(target);
    this.addPoints('Gegner', 20);
  } else if (target.type === 'item') {
    target.readyToCollect = true;
    const triggerX = (target.x - target.displayWidth / 2) - 56;
    this.state.jumpTriggerX[target.id] = triggerX;
    this.collectItem(target);
  }

  this.state.clears++;
  this.state.target = null;
  this.updatePresenterWord();
  this.chooseTarget();
}

collectItem(item) {
  if (!item.active) return;
  this.sounds.kling && this.sounds.kling.play();
  const pts = item.points || 25;
  const name = item.word || 'Item';
  item.label && item.label.destroy();
  item.destroy();
  this.addPoints(name, pts);
}

destroyEnemy(enemy) {
  enemy.destroyed = true;
  enemy.body.checkCollision.none = true;
  this.tweens.add({
    targets: [enemy],
    scale: 0.2, alpha: 0, duration: 180,
    onComplete: () => { enemy.label && enemy.label.destroy(); enemy.destroy(); }
  });
}

adjustWorldSpeed() {
  const v = -this.state.worldSpeed;
  this.groups.obstacles.getChildren().forEach(o => { if (o.active) o.body.setVelocityX(v); });
  this.groups.enemies.getChildren().forEach(e => { if (e.active) e.body.setVelocityX(v * 1.02); });
  this.groups.items.getChildren().forEach(i => { if (i.active) i.body.setVelocityX(v); });
}

flashWord() { this.cameras.main.flash(80, 247, 118, 142, false); }

update() {
  if (this.state.gameOver) return;

  // Lauf-/Sprunganimation
  if (this.player.body.onFloor()) {
    if (this.player.anims.currentAnim?.key !== 'parrot_run') this.player.anims.play('parrot_run', true);
  } else {
    if (this.player.anims.currentAnim?.key !== 'parrot_jump') this.player.anims.play('parrot_jump', true);
  }

  // Sanfte Beschleunigung
  const minutes = (performance.now() - this.state.startTime) / 60000;
  const targetSpeed = this.level.initialSpeed + Math.min(this.level.maxExtraSpeed, this.level.accelPerMinute * minutes);
  if (Math.abs(targetSpeed - this.state.worldSpeed) > 0.5) {
    this.state.worldSpeed = targetSpeed;
    this.adjustWorldSpeed();
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

  // Auto-Sprung (Sicherheitsfenster)
  const playerFront = this.player.body.x + this.player.body.width;
  const safeWindow = 14;
  Object.keys(this.state.jumpTriggerX).forEach(idStr => {
    const id = +idStr; const triggerX = this.state.jumpTriggerX[id];
    const obj = this.groups.obstacles.getChildren().find(o => o.id === id && o.active)
             || this.groups.items.getChildren().find(i => i.id === id && i.active);
    if (!obj) { delete this.state.jumpTriggerX[id]; return; }
    const leftEdge = obj.x - obj.displayWidth / 2;

    if (playerFront >= triggerX - safeWindow && this.player.body.onFloor()) {
      this.player.setVelocityY(-720);
      this.sounds.jump && this.sounds.jump.play();
      delete this.state.jumpTriggerX[id];
    }
    if (playerFront > leftEdge + 6 && this.player.body.onFloor() && this.state.jumpTriggerX[id]) {
      this.player.setVelocityY(-720);
      this.sounds.jump && this.sounds.jump.play();
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
  const speed = Math.round(this.state.worldSpeed);
  this.ui.hud.setText(`Score: ${this.state.score}   WPM: ${wpm}   Genauigkeit: ${acc}%   Clears: ${this.state.clears}   Speed: ${speed}`);
}

toast(msg) {
  this.ui.msg.setText(msg);
  this.tweens.killTweensOf(this.ui.msg);
  this.ui.msg.setAlpha(1);
  this.tweens.add({ targets: this.ui.msg, alpha: 0, duration: 1200, ease: 'Sine.easeOut', delay: 300 });
}

gameOver(reason) {
  this.spawnTimerObstacles && this.spawnTimerObstacles.remove();
  this.spawnTimerEnemies && this.spawnTimerEnemies.remove();
  this.spawnTimerItems && this.spawnTimerItems.remove();

  this.physics.world.pause();
  this.state.gameOver = true;

  const minutes = Math.max(0.0001, (performance.now() - this.state.startTime) / 60000);
  const wpm = Math.round((this.state.correctChars / 5) / minutes);
  const acc = (this.state.correctChars + this.state.errors) > 0
    ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors))
    : 100;

  const entry = { ts: Date.now(), score: this.state.score, wpm, acc, clears: this.state.clears, log: this.state.eventLog, level: this.levelName };
  const hist = JSON.parse(localStorage.getItem('jnt_history') || '[]');
  hist.push(entry);
  localStorage.setItem('jnt_history', JSON.stringify(hist));

  const center = this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH*0.80, 260, 0x000000, 0.35).setDepth(30);
  const lines = [
    `Game Over`,
    `${reason}`,
    `Score: ${this.state.score} | WPM: ${wpm} | Genauigkeit: ${acc}% | Clears: ${this.state.clears} | Level: ${this.levelName}`,
    `Letzte Punkte:`,
    ...this.state.eventLog.slice(-6).map(e => `+${e.pts} ${e.reason}`),
    `Drücke R oder Enter, oder klicke, um neu zu starten`
  ];
  const text = this.add.text(WIDTH/2, HEIGHT/2, lines.join('\n'), {
    fontFamily: 'system-ui', fontSize: 18, color: '#083056', align: 'center'
  }).setOrigin(0.5).setDepth(31);

  const restart = () => { center.destroy(); text.destroy(); this.scene.restart(); };
  const rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  rKey.once('down', restart);
  enterKey.once('down', restart);
  this.input.once('pointerdown', restart);
}

}

const config = {
type: Phaser.AUTO,
width: WIDTH,
height: HEIGHT,
parent: 'game',
backgroundColor: '#7ec4ff',
render: { pixelArt: true, antialias: false },
physics: { default: 'arcade', arcade: { gravity: { y: 2000 }, debug: false } },
scene: [GameScene]
};

new Phaser.Game(config);
})();
