(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Layer-Tiefen
const FG_LABEL_DEPTH = 900;   // Wortkästen + Texte
const OVERLAY_DEPTH = 995;    // Game-Over

// Level-Presets (behutsame Beschleunigung)
const LevelPresets = {
einfach: { initialSpeed: 150, accelPerMinute: 8,  obstacleDelayMs: 2800, enemyDelayMs: 6000, itemDelayMs: 9000, maxExtraSpeed: 80 },
mittel:  { initialSpeed: 180, accelPerMinute: 12, obstacleDelayMs: 2400, enemyDelayMs: 5200, itemDelayMs: 8000, maxExtraSpeed: 100 },
schnell: { initialSpeed: 220, accelPerMinute: 16, obstacleDelayMs: 2000, enemyDelayMs: 4500, itemDelayMs: 7200, maxExtraSpeed: 120 }
};

const COLORS = {
typed: '#0a7f3f',
rest: '#083056',
enemyLabel: '#9b2c2c',
itemLabel: '#0b315a'
};

const AUDIO = { bgmVol: 0.25, sfxVol: 0.6 };

// Größen/Verhalten
const PLAYER_SCALE = 0.95;
const PRESENTER_SCALE = 0.45;   // Vogel halb so groß
const BUBBLE_PAD_X = 12;
const BUBBLE_PAD_Y = 8;
const BUBBLE_RADIUS = 10;
const GAP_OBST = 20;
const GAP_ENEMY = 18;

// Sprung
const PRE_JUMP_PX = 56;
const SAFE_WINDOW = 14;
const GRAVITY_Y = 2000;
const JUMP_STRENGTH = 720;

const PIRATE_OBSTACLES = [
{ key: 'pirate_barrel', path: 'assets/obstacles/barrel.png', scale: 0.62 },
{ key: 'pirate_thorn_big', path: 'assets/obstacles/big_thorns.png', scale: 0.78 },
{ key: 'pirate_thorn_small', path: 'assets/obstacles/small_thorn.png', scale: 0.86 },
{ key: 'env_ship', path: 'assets/environment/ship.png', scale: 0.75 }
];
const PIRATE_ENEMIES = [
{ key: 'pirate_parrot_enemy', path: 'assets/characters/parrot.png', scale: 0.85, type: 'air' },
{ key: 'env_skull', path: 'assets/environment/skull.png', scale: 0.9, type: 'air' },
{ key: 'pirate_crab', path: 'assets/environment/crab.png', scale: 0.95, type: 'ground' }
];
const BONUS_ITEMS = [
{ key: 'item_coin', path: 'assets/items/coin.png', scale: 0.8, word: 'muenze', points: 50 },
{ key: 'item_heart', path: 'assets/items/heart.png', scale: 0.8, word: 'herz', points: 50 },
{ key: 'item_chest', path: 'assets/items/chest.png', scale: 0.85, word: 'schatz', points: 75 },
{ key: 'item_compass', path: 'assets/items/compass.png', scale: 0.7, word: 'uhr', points: 50 }
];

class GameScene extends Phaser.Scene {
constructor() {
super('game');
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
  this.presenter = {}; // {pigeon}
}

preload() {
  // Wörter
  this.load.text('woerter', 'woerter.txt');

  // Animationen: Parrot, Pigeon (Einzelbilder)
  this.load.image('parrot1', 'assets/characters/parrot.png');
  this.load.image('parrot2', 'assets/characters/parrot2.png');
  this.load.image('parrot3', 'assets/characters/parrot3.png');

  this.load.image('pigeon1', 'assets/characters/pigeon.png');
  this.load.image('pigeon2', 'assets/characters/pigeon2.png');
  this.load.image('pigeon3', 'assets/characters/pigeon3.png');

  // Spielobjekte
  PIRATE_OBSTACLES.forEach(o => this.load.image(o.key, o.path));
  PIRATE_ENEMIES.forEach(e => this.load.image(e.key, e.path));
  BONUS_ITEMS.forEach(i => this.load.image(i.key, i.path));

  // Sounds
  this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
  this.load.audio('sfx_jump',  'assets/sounds/jump.mp3');
  this.load.audio('bgm',       'assets/sounds/bgm.mp3');

  // Platzhalter + Boden + Bubble-Grund (wir zeichnen pro Objekt dynamisch via Graphics)
  const g = this.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x3fa34c).fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundVis', WIDTH, GROUND_H); g.clear();
  g.fillStyle(0x000000).fillRect(0, 0, WIDTH, GROUND_H);
  g.generateTexture('groundPhys', WIDTH, GROUND_H); g.clear();
  g.fillStyle(0xffb300).fillRoundedRect(0, 0, 38, 38, 6);
  g.generateTexture('ph_player', 38, 38);
  g.destroy();
}

create() {
  this.physics.world.resume();
  this.state.gameOver = false;

  this.cameras.main.setBackgroundColor('#7ec4ff');
  this.physics.world.gravity.y = GRAVITY_Y;

  // Wörter
  const raw = this.cache.text.get('woerter') || '';
  this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
  if (this.state.words.length === 0) this.state.words = ['muenze','herz','schatz','uhr','lauf','spring'];
  Phaser.Utils.Array.Shuffle(this.state.words);

  // Boden
  this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(100);
  const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
  this.ground = physGround;

  // Animationen
  const parrotFrames = [
    { key: this.textures.exists('parrot1') ? 'parrot1' : 'ph_player' },
    { key: this.textures.exists('parrot2') ? 'parrot2' : 'parrot1' },
    { key: this.textures.exists('parrot3') ? 'parrot3' : 'parrot2' }
  ];
  this.anims.create({ key: 'parrot_run',  frames: parrotFrames, frameRate: 6, repeat: -1 });
  this.anims.create({ key: 'parrot_jump', frames: [parrotFrames[1]], frameRate: 1, repeat: -1 });

  const p2Key = this.textures.exists('pigeon2') ? 'pigeon2' : 'pigeon1';
  const p3Key = this.textures.exists('pigeon3') ? 'pigeon3' : p2Key;
  const pigeonFrames = [
    { key: this.textures.exists('pigeon1') ? 'pigeon1' : 'ph_player' },
    { key: p2Key }, { key: p3Key }, { key: p2Key }
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
  this.sounds.kling = this.sound.add('sfx_kling', { volume: AUDIO.sfxVol });
  this.sounds.jump  = this.sound.add('sfx_jump',  { volume: AUDIO.sfxVol });
  this.sounds.bgm   = this.sound.add('bgm',       { volume: AUDIO.bgmVol, loop: true });
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
  this.ui.hud = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: 18, color: '#083056' }).setDepth(FG_LABEL_DEPTH);
  this.ui.log = this.add.text(WIDTH - 12, 10, 'Punkte-Log:', { fontFamily: 'monospace', fontSize: 14, color: '#083056', align: 'right' })
    .setOrigin(1, 0).setDepth(FG_LABEL_DEPTH);
  this.ui.msg = this.add.text(WIDTH/2, HEIGHT/2, '', { fontFamily: 'system-ui', fontSize: 28, color: '#083056' })
    .setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1).setAlpha(0);

  // Präsentations-Vogel (ohne Text), fliegt zu aktueller Wort-Blase
  const pigeonStartKey = this.textures.exists('pigeon1') ? 'pigeon1' : 'ph_player';
  this.presenter.pigeon = this.add.sprite(120, HEIGHT - GROUND_H - 220, pigeonStartKey)
    .setScale(PRESENTER_SCALE).setDepth(FG_LABEL_DEPTH - 1);
  this.presenter.pigeon.anims.play('pigeon_talk');

  // Eingabe: nur Shift+M mutet
  this.input.keyboard.on('keydown', (e) => {
    if (e.shiftKey && (e.key || '').toLowerCase() === 'm') {
      const newMute = !this.sound.mute;
      this.sound.mute = newMute;
      if (this.sounds.bgm) this.sounds.bgm.mute = newMute;
      this.toast(newMute ? 'Alle Sounds aus' : 'Alle Sounds an');
      return;
    }
    this.handleKey(e);
  });

  // Spawner
  this.spawnTimerObstacles = this.time.addEvent({ delay: this.level.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle() });
  this.spawnTimerEnemies   = this.time.addEvent({ delay: this.level.enemyDelayMs, loop: true, callback: () => this.spawnEnemy() });
  this.spawnTimerItems     = this.time.addEvent({ delay: this.level.itemDelayMs, loop: true, callback: () => this.spawnItem() });

  // Direkt Sichtbares
  this.spawnObstacle();
  this.spawnItem();

  this.state.startTime = performance.now();
  this.updateHUD();
  this.updatePointsLog();
  this.updatePresenterWord();

  this.setupLevelButtons();
}

setupLevelButtons() {
  const ids = { einfach: 'level-einfach', mittel: 'level-mittel', schnell: 'level-schnell' };
  Object.values(ids).forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(ids[this.levelName])?.classList.add('active');
  Object.entries(ids).forEach(([name, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => { localStorage.setItem('jnt_level', name); this.scene.restart(); };
  });
}

// Utilities
ensureTexture(key, fallback) { return this.textures.exists(key) ? key : fallback; }
clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Kasten + Texte pro Objekt
makeWordBoxFor(obj, colorRest) {
  // Texte
  obj.labelTyped = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: 18, color: COLORS.typed })
    .setOrigin(0, 0.5).setDepth(FG_LABEL_DEPTH + 1);
  obj.labelRest  = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: 18, color: colorRest })
    .setOrigin(0, 0.5).setDepth(FG_LABEL_DEPTH + 1);
  // Blase als Graphics (dynamisch skaliert)
  obj.bubble = this.add.graphics().setDepth(FG_LABEL_DEPTH);
  obj.bubbleW = 0; obj.bubbleH = 0; // gemerkte Maße
  this.layoutWordBox(obj);
}

setLabelTexts(obj, typed, rest) {
  if (!obj.labelTyped || !obj.labelRest) return;
  obj.labelTyped.setText(typed);
  obj.labelRest.setText(rest);
  this.layoutWordBox(obj);
}

layoutWordBox(obj) {
  if (!obj.active) return;
  const gap = (obj.type === 'enemy') ? GAP_ENEMY : GAP_OBST;
  const centerX = obj.x;
  const y = obj.y - (obj.displayHeight || 0) / 2 - gap;

  const typedW = obj.labelTyped.width;
  const restW  = obj.labelRest.width;
  const totalW = typedW + restW;

  const leftX = centerX - totalW / 2;
  obj.labelTyped.setPosition(leftX, y);
  obj.labelRest.setPosition(leftX + typedW, y);

  // Blase berechnen
  const textH = Math.max(obj.labelTyped.height, obj.labelRest.height);
  const bw = Math.max(44, totalW + BUBBLE_PAD_X * 2);
  const bh = Math.max(24, textH + BUBBLE_PAD_Y * 2);

  obj.bubble.clear();
  obj.bubble.fillStyle(0xffffff, 0.95);
  obj.bubble.lineStyle(2, 0xe5e9f0, 1);
  obj.bubble.fillRoundedRect(centerX - bw / 2, y - bh / 2, bw, bh, BUBBLE_RADIUS);
  obj.bubble.strokeRoundedRect(centerX - bw / 2, y - bh / 2, bw, bh, BUBBLE_RADIUS);

  obj.bubbleW = bw; obj.bubbleH = bh;
}

bubbleCenter(obj) {
  const gap = (obj.type === 'enemy') ? GAP_ENEMY : GAP_OBST;
  const centerX = obj.x;
  const y = obj.y - (obj.displayHeight || 0) / 2 - gap;
  return { x: centerX, y: y };
}

// Pigeon zur aktuellen Blase fliegen lassen
flyPresenterTo(obj) {
  if (!obj || !this.presenter.pigeon) return;
  const c = this.bubbleCenter(obj);
  const targetX = this.clamp(c.x - 160, 60, WIDTH - 60);
  const targetY = this.clamp(c.y - 40, 40, HEIGHT - GROUND_H - 120);
  const d = Phaser.Math.Distance.Between(this.presenter.pigeon.x, this.presenter.pigeon.y, targetX, targetY);
  const dur = Phaser.Math.Clamp(200 + d * 1.2, 200, 900);
  this.tweens.add({ targets: this.presenter.pigeon, x: targetX, y: targetY, duration: dur, ease: 'Sine.easeInOut' });
}

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

  sprite.word = this.nextWord();
  this.makeWordBoxFor(sprite, COLORS.rest);
  this.setLabelTexts(sprite, '', sprite.word);

  if (!this.state.target) this.chooseTarget();
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

  sprite.word = this.nextWord({ preferShort: true });
  this.makeWordBoxFor(sprite, COLORS.enemyLabel);
  this.setLabelTexts(sprite, '', sprite.word);

  if (!this.state.target) this.chooseTarget();
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

  this.makeWordBoxFor(sprite, COLORS.itemLabel);
  this.setLabelTexts(sprite, '', def.word);

  if (!this.state.target) this.chooseTarget();
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
  const c = [];
  this.groups.obstacles.getChildren().forEach(o => { if (o.active && !o.cleared && o.x > this.player.x - 10) c.push(o); });
  this.groups.enemies.getChildren().forEach(e   => { if (e.active && !e.destroyed && e.x > this.player.x - 10) c.push(e); });
  this.groups.items.getChildren().forEach(i     => { if (i.active && !i.readyToCollect && i.x > this.player.x - 10) c.push(i); });

  if (c.length === 0) {
    this.state.target = null;
    this.state.typedIndex = 0;
    return;
  }
  c.sort((a, b) => a.x - b.x);
  const target = c[0];
  this.state.target = target;
  this.state.typedIndex = 0;
  this.updateTargetLabelProgress();
  this.flyPresenterTo(target);
}

// Eingabe
handleKey(e) {
  if (this.state.gameOver) return;
  if (!this.state.target) return;
  const key = e.key;
  if (!key || key.length !== 1) return;

  const expected = this.normalize(this.state.target.word[this.state.typedIndex] || '');
  const got = this.normalize(key);

  if (got === expected) {
    this.state.typedIndex++; this.state.correctChars++;
    this.updateTargetLabelProgress();
    if (this.state.typedIndex === this.state.target.word.length) this.onWordCompleted(this.state.target);
  } else {
    this.state.errors++; this.flashWord();
  }
  this.updateHUD();
}

normalize(ch) { return ch.toLowerCase(); }

updateTargetLabelProgress() {
  const t = this.state.target;
  if (!t) return;
  const typed = t.word.slice(0, this.state.typedIndex);
  const rest  = t.word.slice(this.state.typedIndex);
  this.setLabelTexts(t, typed, rest);
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
    const triggerX = (target.x - target.displayWidth / 2) - PRE_JUMP_PX;
    this.state.jumpTriggerX[target.id] = triggerX;
    this.addPoints('Hindernis', 10);
  } else if (target.type === 'enemy') {
    this.destroyEnemy(target);
    this.addPoints('Gegner', 20);
  } else if (target.type === 'item') {
    target.readyToCollect = true;
    const triggerX = (target.x - target.displayWidth / 2) - PRE_JUMP_PX;
    this.state.jumpTriggerX[target.id] = triggerX;
    this.collectItem(target);
  }

  this.state.clears++;
  this.state.target = null;
  this.chooseTarget();
}

collectItem(item) {
  if (!item.active) return;
  this.sounds.kling && this.sounds.kling.play();
  const pts = item.points || 25;
  const name = item.word || 'Item';
  item.labelTyped?.destroy(); item.labelRest?.destroy(); item.bubble?.destroy();
  item.destroy();
  this.addPoints(name, pts);
}

destroyEnemy(enemy) {
  enemy.destroyed = true;
  enemy.body.checkCollision.none = true;
  this.tweens.add({
    targets: [enemy],
    scale: 0.2, alpha: 0, duration: 180,
    onComplete: () => {
      enemy.labelTyped?.destroy(); enemy.labelRest?.destroy(); enemy.bubble?.destroy();
      enemy.destroy();
    }
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

  // Animation
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

  // Word-Boxen mit Objekten bewegen, im Vordergrund halten
  const relayout = (obj, gap) => {
    if (!obj.active) return;
    this.layoutWordBox(obj);
    obj.labelTyped?.setDepth(FG_LABEL_DEPTH);
    obj.labelRest?.setDepth(FG_LABEL_DEPTH);
  };
  this.groups.obstacles.getChildren().forEach(o => { relayout(o, GAP_OBST); if (o.x < -100) { o.labelTyped?.destroy(); o.labelRest?.destroy(); o.bubble?.destroy(); o.destroy(); delete this.state.jumpTriggerX[o.id]; } });
  this.groups.enemies.getChildren().forEach(e => { relayout(e, GAP_ENEMY); if (e.x < -100) { e.labelTyped?.destroy(); e.labelRest?.destroy(); e.bubble?.destroy(); e.destroy(); } });
  this.groups.items.getChildren().forEach(i => { relayout(i, GAP_ENEMY); if (i.x < -100) { i.labelTyped?.destroy(); i.labelRest?.destroy(); i.bubble?.destroy(); i.destroy(); } });

  // Auto-Sprung
  const playerFront = this.player.body.x + this.player.body.width;
  Object.keys(this.state.jumpTriggerX).forEach(idStr => {
    const id = +idStr; const triggerX = this.state.jumpTriggerX[id];
    const obj = this.groups.obstacles.getChildren().find(o => o.id === id && o.active)
             || this.groups.items.getChildren().find(i => i.id === id && i.active);
    if (!obj) { delete this.state.jumpTriggerX[id]; return; }
    const leftEdge = obj.x - obj.displayWidth / 2;

    if (playerFront >= triggerX - SAFE_WINDOW && this.player.body.onFloor()) {
      this.player.setVelocityY(-JUMP_STRENGTH);
      this.sounds.jump && this.sounds.jump.play();
      delete this.state.jumpTriggerX[id];
    }
    if (playerFront > leftEdge + 6 && this.player.body.onFloor() && this.state.jumpTriggerX[id]) {
      this.player.setVelocityY(-JUMP_STRENGTH);
      this.sounds.jump && this.sounds.jump.play();
      delete this.state.jumpTriggerX[id];
    }
  });

  // Ziel prüfen/wechseln
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
  this.spawnTimerObstacles?.remove();
  this.spawnTimerEnemies?.remove();
  this.spawnTimerItems?.remove();

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

  const center = this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH*0.80, 260, 0x000000, 0.35).setDepth(OVERLAY_DEPTH);
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
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);

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
physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY_Y }, debug: false } },
scene: [GameScene]
};

new Phaser.Game(config);
})();
