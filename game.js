(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Tiefen
const FG_LABEL_DEPTH = 900;
const OVERLAY_DEPTH = 995;

// Level-Presets (behutsam)
const LevelPresets = {
einfach: { initialSpeed: 80, accelPerMinute: 8,  obstacleDelayMs: 2800, enemyDelayMs: 6000, itemDelayMs: 9000, maxExtraSpeed: 100 },
mittel:  { initialSpeed: 110, accelPerMinute: 12, obstacleDelayMs: 2400, enemyDelayMs: 5200, itemDelayMs: 8000, maxExtraSpeed: 100 },
schnell: { initialSpeed: 200, accelPerMinute: 16, obstacleDelayMs: 2000, enemyDelayMs: 4500, itemDelayMs: 7200, maxExtraSpeed: 120 }
};

const COLORS = { typed: '#0a7f3f', rest: '#083056', enemyRest: '#9b2c2c', itemRest: '#0b315a' };
const AUDIO = { bgmVol: 0.25, sfxVol: 0.6 };

// Physik/Timing
const GRAVITY_Y = 2000;
const JUMP_STRENGTH = 720;
const PRE_JUMP_PX = 56;
const SAFE_WINDOW = 14;

// Größen
const PLAYER_SCALE = 0.95;
const PIGEON_SCALE = 0.45; // halb so groß
const GAP_OBST = 20;
const GAP_ENEMY = 18;
const PAD_X = 12;
const PAD_Y = 8;
const RADIUS = 10;

// Assets
const OBSTACLES = [
{ key: 'barrel', path: 'assets/obstacles/barrel.png', scale: 0.62 },
{ key: 'thorn_big', path: 'assets/obstacles/big_thorns.png', scale: 0.78 },
{ key: 'thorn_small', path: 'assets/obstacles/small_thorn.png', scale: 0.86 },
{ key: 'ship', path: 'assets/environment/ship.png', scale: 0.75 }
];
const ENEMIES = [
{ key: 'skull', path: 'assets/environment/skull.png', scale: 0.9, type: 'air' },
{ key: 'parrot_enemy', path: 'assets/characters/parrot.png', scale: 0.85, type: 'air' },
{ key: 'crab', path: 'assets/environment/crab.png', scale: 0.95, type: 'ground' }
];
const ITEMS = [
{ key: 'coin', path: 'assets/items/coin.png', scale: 0.8, word: 'muenze', points: 50 },
{ key: 'heart', path: 'assets/items/heart.png', scale: 0.8, word: 'herz', points: 50 },
{ key: 'chest', path: 'assets/items/chest.png', scale: 0.85, word: 'schatz', points: 75 },
{ key: 'compass', path: 'assets/items/compass.png', scale: 0.7, word: 'uhr', points: 50 }
];

class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
    // Hier nichts mehr mit localStorage laden!
  }

init() {
  // 1. Level-Daten laden
  this.levelName = localStorage.getItem('jnt_level') || 'mittel';
  this.level = LevelPresets[this.levelName] || LevelPresets.mittel;
  // WICHTIG: Stoppt alle Sounds der vorherigen Runde
  this.sound.stopAll(); 

  // 2. State-Objekt initialisieren
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

  // 3. WICHTIG: Diese leeren Objekte müssen hier definiert werden!
  this.groups = {};
  this.sounds = {};
  this.ui = {};
  this.presenter = {};
}

preload() {
  // Wörter
  this.load.text('woerter', 'woerter.txt');
  
	// Ein kleiner weißer Pixel für Partikel
	g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
	g.generateTexture('partikelPixel', 4, 4);

  // Spieler & Pigeon (Frames)
  this.load.image('parrot1', 'assets/characters/parrot.png');
  this.load.image('parrot2', 'assets/characters/parrot2.png');
  this.load.image('parrot3', 'assets/characters/parrot3.png');
  this.load.image('pigeon1', 'assets/characters/pigeon.png');
  this.load.image('pigeon2', 'assets/characters/pigeon2.png');
  this.load.image('pigeon3', 'assets/characters/pigeon3.png');

  // Objekte
  OBSTACLES.forEach(a => this.load.image(a.key, a.path));
  ENEMIES.forEach(a => this.load.image(a.key, a.path));
  ITEMS.forEach(a => this.load.image(a.key, a.path));

  // Sounds
  this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
  this.load.audio('sfx_jump',  'assets/sounds/jump.mp3');
  this.load.audio('bgm',       'assets/sounds/bgm.mp3');

  // Boden + Platzhalter
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
  if (!this.state.words.length) this.state.words = ['muenze','herz','schatz','uhr','lauf','spring'];
  Phaser.Utils.Array.Shuffle(this.state.words);

  // Boden
  this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(100);
  const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
  this.ground = physGround;

  // Animationen
  const parrotFrames = [{ key: 'parrot1' }, { key: 'parrot2' }, { key: 'parrot3' }];
  this.anims.create({ key: 'parrot_run',  frames: parrotFrames, frameRate: 6, repeat: -1 });
  this.anims.create({ key: 'parrot_jump', frames: [{ key: 'parrot2' }], frameRate: 1, repeat: -1 });

  const pigeonFrames = [{ key: 'pigeon1' }, { key: 'pigeon2' }, { key: 'pigeon3' }, { key: 'pigeon2' }];
  this.anims.create({ key: 'pigeon_talk', frames: pigeonFrames, frameRate: 3, yoyo: true, repeat: -1 });

  // Spieler
  this.player = this.physics.add.sprite(140, HEIGHT - GROUND_H - 40, 'parrot1').setScale(PLAYER_SCALE);
  this.player.setCollideWorldBounds(true);
  this.player.body.setSize(this.player.displayWidth * 0.6, this.player.displayHeight * 0.7);
  this.player.body.setOffset(this.player.displayWidth * 0.2, this.player.displayHeight * 0.15);
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
  this.physics.add.collider(this.player, this.groups.obstacles, (_, obst) => { if (!obst.cleared) this.gameOver('Mit Hindernis kollidiert'); });
  this.physics.add.overlap(this.player, this.groups.enemies,  (_, enemy) => { if (!enemy.destroyed) this.gameOver('Von Gegner getroffen'); });
  this.physics.add.overlap(this.player, this.groups.items,    (_, item)  => { if (item.readyToCollect) this.collectItem(item); });

  // HUD
  this.ui.hud = this.add.text(12, 10, '', { fontFamily: 'monospace', fontSize: 18, color: '#083056' }).setDepth(FG_LABEL_DEPTH);
  this.ui.log = this.add.text(WIDTH - 12, 10, 'Punkte-Log:', { fontFamily: 'monospace', fontSize: 14, color: '#083056', align: 'right' })
    .setOrigin(1, 0).setDepth(FG_LABEL_DEPTH);
  this.ui.msg = this.add.text(WIDTH/2, HEIGHT/2, '', { fontFamily: 'system-ui', fontSize: 28, color: '#083056' })
    .setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1).setAlpha(0);

  // Pigeon (ohne Text) – folgt der aktiven Wort-Blase
  this.presenter.pigeon = this.add.sprite(120, HEIGHT - GROUND_H - 220, 'pigeon1').setScale(PIGEON_SCALE).setDepth(FG_LABEL_DEPTH - 1);
  this.presenter.pigeon.anims.play('pigeon_talk');

  // Eingabe: nur Shift+M mutet; sonst normal tippen
  this.input.keyboard.on('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if (e.shiftKey && k === 'm') {
      const muted = !this.sound.mute;
      this.sound.mute = muted; if (this.sounds.bgm) this.sounds.bgm.mute = muted;
      this.toast(muted ? 'Alle Sounds aus' : 'Alle Sounds an');
      return;
    }
    this.handleKey(e);
  });

  // Spawner
  this.spawnTimerObstacles = this.time.addEvent({ delay: this.level.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle() });
  this.spawnTimerEnemies   = this.time.addEvent({ delay: this.level.enemyDelayMs,   loop: true, callback: () => this.spawnEnemy() });
  this.spawnTimerItems     = this.time.addEvent({ delay: this.level.itemDelayMs,    loop: true, callback: () => this.spawnItem() });

  // Direkt etwas sichtbar
  this.spawnObstacle();
  this.spawnItem();

  this.state.startTime = performance.now();
  this.updateHUD(); this.updatePointsLog();

  // Level-Buttons
  this.setupLevelButtons();
}

setupLevelButtons() {
  const ids = { einfach: 'level-einfach', mittel: 'level-mittel', schnell: 'level-schnell' };
  Object.values(ids).forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(ids[this.levelName])?.classList.add('active');
  Object.entries(ids).forEach(([name, id]) => {
    const el = document.getElementById(id); if (!el) return;
    el.onclick = () => { localStorage.setItem('jnt_level', name); this.scene.restart(); };
  });
}

// Hilfsfunktionen: Wortbox als Container (Graphics + 2 Texte)
createWordUI(obj, restColor) {
  const cont = this.add.container(0, 0).setDepth(FG_LABEL_DEPTH);
  const g = this.add.graphics(); cont.add(g);
  const tTyped = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: 18, color: COLORS.typed }).setOrigin(0, 0.5);
  const tRest  = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: 18, color: restColor }).setOrigin(0, 0.5);
  cont.add([tTyped, tRest]);

  obj.ui = { cont, g, tTyped, tRest, restColor };
  this.updateWordUI(obj, '', obj.word);
}

updateWordUI(obj, typed = null, rest = null) {
  if (!obj.ui) return;
  const { cont, g, tTyped, tRest } = obj.ui;

  if (typed !== null) tTyped.setText(typed);
  if (rest !== null)  tRest.setText(rest);

  // Größe bestimmen
  const totalW = tTyped.width + tRest.width;
  const textH  = Math.max(tTyped.height, tRest.height);
  const bw = Math.max(44, totalW + PAD_X * 2);
  const bh = Math.max(24, textH + PAD_Y * 2);

  // Position über Objekt
  const gap = obj.type === 'enemy' ? GAP_ENEMY : GAP_OBST;
  const cx = obj.x;
  const cy = obj.y - (obj.displayHeight || 0) / 2 - gap;

  cont.setPosition(cx, cy);

  // Texte mittig im Kasten
  const leftX = -totalW / 2;
  tTyped.setPosition(leftX, 0);
  tRest.setPosition(leftX + tTyped.width, 0);

  // Kasten zeichnen
	// Kasten zeichnen
	g.clear();
	g.fillStyle(0xffffff, 0.95);

	if (obj === this.state.target) {
	  g.lineStyle(3, 0xffb300, 1); // Goldener, dickerer Rahmen für das aktive Wort
	} else {
	  g.lineStyle(2, 0xe5e9f0, 1); // Normaler Rahmen
	}
  g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, RADIUS);
  g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, RADIUS);

  // Tiefen absichern
  cont.setDepth(FG_LABEL_DEPTH);
  tTyped.setDepth(FG_LABEL_DEPTH + 1);
  tRest.setDepth(FG_LABEL_DEPTH + 1);
}

destroyWordUI(obj) {
  if (!obj.ui) return;
  obj.ui.cont.destroy(); obj.ui = null;
}

// Pigeon fliegt zur Wortbox (wenn im Bild sichtbar)
flyPigeonTo(obj) {
  if (!obj || !obj.ui) return;
  const targetX = Phaser.Math.Clamp(obj.ui.cont.x - 140, 60, WIDTH - 60);
  const targetY = Phaser.Math.Clamp(obj.ui.cont.y - 30, 40, HEIGHT - GROUND_H - 120);
  const d = Phaser.Math.Distance.Between(this.presenter.pigeon.x, this.presenter.pigeon.y, targetX, targetY);
  const dur = Phaser.Math.Clamp(200 + d * 1.2, 200, 900);
  this.tweens.add({ targets: this.presenter.pigeon, x: targetX, y: targetY, duration: dur, ease: 'Sine.easeInOut' });
}

// Spawns
spawnObstacle() {
  const def = Phaser.Utils.Array.GetRandom(OBSTACLES);
  const id = this.state.idCounter++;
  const x = WIDTH + 120;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const h = temp.displayHeight; temp.destroy();

  const y = HEIGHT - GROUND_H - h / 2;
  const o = this.groups.obstacles.create(x, y, def.key);
  o.setScale(def.scale).setImmovable(true);
  o.body.setVelocityX(-this.state.worldSpeed);
  o.body.setSize(o.displayWidth * 0.8, o.displayHeight * 0.85);
  o.body.setOffset(o.displayWidth * 0.1, o.displayHeight * 0.1);
  o.cleared = false; o.type = 'obstacle'; o.id = id;
  o.word = this.nextWord();

  this.createWordUI(o, COLORS.rest);
  if (!this.state.target) this.chooseTarget();
}

spawnEnemy() {
  const def = Phaser.Utils.Array.GetRandom(ENEMIES);
  const id = this.state.idCounter++;
  const x = WIDTH + 140;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const h = temp.displayHeight; temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude = def.type === 'ground' ? (groundY - h / 2) : (groundY - GROUND_H - Phaser.Math.Between(100, 160));
  const e = this.groups.enemies.create(x, altitude, def.key);
  e.setScale(def.scale).setImmovable(true);
  e.body.setVelocityX(-this.state.worldSpeed * 1.02);
  e.destroyed = false; e.type = 'enemy'; e.id = id;
  e.word = this.nextWord({ preferShort: true });

  this.createWordUI(e, COLORS.enemyRest);
  if (!this.state.target) this.chooseTarget();
}

spawnItem() {
  const def = Phaser.Utils.Array.GetRandom(ITEMS);
  const id = this.state.idCounter++;
  const x = WIDTH + 160;

  const temp = this.add.image(0, 0, def.key).setScale(def.scale);
  const h = temp.displayHeight; temp.destroy();

  const groundY = HEIGHT - GROUND_H;
  const altitude = Phaser.Math.Between(0, 1) ? (groundY - h / 2) : (groundY - GROUND_H - Phaser.Math.Between(90, 150));
  const it = this.groups.items.create(x, altitude, def.key);
  it.setScale(def.scale).setImmovable(true);
  it.body.setVelocityX(-this.state.worldSpeed);
  it.type = 'item'; it.id = id; it.word = def.word; it.points = def.points;
  it.readyToCollect = false;

  this.createWordUI(it, COLORS.itemRest);
  if (!this.state.target) this.chooseTarget();
}

// Wörter
nextWord(opts = {}) {
  if (!this.state.words.length) {
    const raw = this.cache.text.get('woerter') || '';
    this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
    Phaser.Utils.Array.Shuffle(this.state.words);
  }
  if (opts.preferShort) {
    const i = this.state.words.findIndex(w => w.length <= 6);
    if (i > -1) return this.state.words.splice(i, 1)[0];
  }
  return this.state.words.shift();
}

// Ziel wählen (bevorzugt, wenn im Bild)
chooseTarget() {
  const c = [];
  const push = obj => { if (obj.active && !(obj.type === 'obstacle' && obj.cleared) && !(obj.type === 'enemy' && obj.destroyed)) c.push(obj); };
  this.groups.obstacles.getChildren().forEach(push);
  this.groups.enemies.getChildren().forEach(push);
  this.groups.items.getChildren().forEach(i => { if (i.active && !i.readyToCollect) c.push(i); });

  if (!c.length) { this.state.target = null; this.state.typedIndex = 0; return; }

  c.sort((a, b) => a.x - b.x);
  // Nächstes Objekt im sichtbaren Bereich, sonst das nächste insgesamt
  const visible = c.find(o => o.x < WIDTH - 60);
  const t = visible || c[0];

  this.state.target = t;
  this.state.typedIndex = 0;
  this.updateTargetLabelProgress();
  // Nur fliegen, wenn die Box bereits im Bild ist
  if (t.x < WIDTH - 60) this.flyPigeonTo(t);
}

// Eingabe
handleKey(e) {
  if (this.state.gameOver) return;
  if (!this.state.target) return;
  const k = e.key;
  if (!k || k.length !== 1) return;

  const expected = this.normalize(this.state.target.word[this.state.typedIndex] || '');
  const got = this.normalize(k);

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
  if (!t || !t.ui) return;
  const typed = t.word.slice(0, this.state.typedIndex);
  const rest  = t.word.slice(this.state.typedIndex);
  this.updateWordUI(t, typed, rest);
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

onWordCompleted(t) {
  if (t.type === 'obstacle') {
    t.cleared = true; t.body.checkCollision.none = true;
    this.state.jumpTriggerX[t.id] = (t.x - t.displayWidth / 2) - PRE_JUMP_PX;
    this.addPoints('Hindernis', 10);
  } else if (t.type === 'enemy') {
    this.destroyEnemy(t); this.addPoints('Gegner', 20);
  } else if (t.type === 'item') {
    t.readyToCollect = true;
    this.state.jumpTriggerX[t.id] = (t.x - t.displayWidth / 2) - PRE_JUMP_PX;
    this.collectItem(t);
  }
  this.state.clears++;
  this.state.target = null;
  this.chooseTarget();
}

collectItem(it) {
  if (!it.active) return;
  
  // NEU: Goldener Partikel-Burst
  this.createBurst(it.x, it.y, [0xffd700, 0xffff00, 0xffa500], 20);
  
  this.sounds.kling?.play();
  const pts = it.points || 25;
  const name = it.word || 'Item';
  this.destroyWordUI(it); it.destroy();
  this.addPoints(name, pts);
}
destroyEnemy(e) {
  e.destroyed = true; 
    // NEU: Roter/Grauer Partikel-Burst (Gegner-Farbe)
  this.createBurst(e.x, e.y, [0x9b2c2c, 0x4a5568, 0xffffff], 25);
  e.body.checkCollision.none = true;
  this.tweens.add({
    targets: [e], scale: 0.2, alpha: 0, duration: 180,
    onComplete: () => { this.destroyWordUI(e); e.destroy(); }
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
  if (Math.abs(targetSpeed - this.state.worldSpeed) > 0.5) { this.state.worldSpeed = targetSpeed; this.adjustWorldSpeed(); }

  // Wort-UI an Objekte koppeln und Vordergrund sichern
	const stickUI = obj => { 
	  if (!obj.active || !obj.ui) return; 
	  this.updateWordUI(obj); 

	  // Wenn das Objekt das aktuelle Ziel ist, setze die Tiefe extrem hoch (z.B. 2000)
	  // Alle anderen bleiben auf dem Standard-Level (900)
	  if (obj === this.state.target) {
		obj.ui.cont.setDepth(2000); 
	  } else {
		obj.ui.cont.setDepth(FG_LABEL_DEPTH);
	  }
	};
  this.groups.obstacles.getChildren().forEach(o => { stickUI(o); if (o.x < -100) { this.destroyWordUI(o); o.destroy(); delete this.state.jumpTriggerX[o.id]; } });
  this.groups.enemies.getChildren().forEach(e => { stickUI(e); if (e.x < -100) { this.destroyWordUI(e); e.destroy(); } });
  this.groups.items.getChildren().forEach(i => { stickUI(i); if (i.x < -100) { this.destroyWordUI(i); i.destroy(); } });

  // Auto-Sprung
  const playerFront = this.player.body.x + this.player.body.width;
  Object.keys(this.state.jumpTriggerX).forEach(idStr => {
    const id = +idStr; const triggerX = this.state.jumpTriggerX[id];
    const obj = this.groups.obstacles.getChildren().find(o => o.id === id && o.active)
             || this.groups.items.getChildren().find(i => i.id === id && i.active);
    if (!obj) { delete this.state.jumpTriggerX[id]; return; }
    const leftEdge = obj.x - obj.displayWidth / 2;

    if (playerFront >= triggerX - SAFE_WINDOW && this.player.body.onFloor()) {
      this.player.setVelocityY(-JUMP_STRENGTH); this.sounds.jump?.play(); delete this.state.jumpTriggerX[id];
    }
    if (playerFront > leftEdge + 6 && this.player.body.onFloor() && this.state.jumpTriggerX[id]) {
      this.player.setVelocityY(-JUMP_STRENGTH); this.sounds.jump?.play(); delete this.state.jumpTriggerX[id];
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
  const acc = (this.state.correctChars + this.state.errors) > 0 ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors)) : 100;
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
  // Spawner stoppen
  this.spawnTimerObstacles?.remove();
  this.spawnTimerEnemies?.remove();
  this.spawnTimerItems?.remove();

  // Physik pausieren, Eingabe aktiv lassen
  this.physics.world.pause();
  this.state.gameOver = true;

  const minutes = Math.max(0.0001, (performance.now() - this.state.startTime) / 60000);
  const wpm = Math.round((this.state.correctChars / 5) / minutes);
  const acc = (this.state.correctChars + this.state.errors) > 0 ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors)) : 100;

  const entry = { ts: Date.now(), score: this.state.score, wpm, acc, clears: this.state.clears, log: this.state.eventLog, level: this.levelName };
  const hist = JSON.parse(localStorage.getItem('jnt_history') || '[]'); hist.push(entry);
  localStorage.setItem('jnt_history', JSON.stringify(hist));

  const center = this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH*0.80, 260, 0x000000, 0.35).setDepth(OVERLAY_DEPTH);
  const lines = [
    `Game Over`, `${reason}`,
    `Score: ${this.state.score} | WPM: ${wpm} | Genauigkeit: ${acc}% | Clears: ${this.state.clears} | Level: ${this.levelName}`,
    `Letzte Punkte:`, ...this.state.eventLog.slice(-6).map(e => `+${e.pts} ${e.reason}`),
    `Drücke R oder Enter, oder klicke, um neu zu starten`
  ];
  const text = this.add.text(WIDTH/2, HEIGHT/2, lines.join('\n'), { fontFamily: 'system-ui', fontSize: 18, color: '#083056', align: 'center' })
    .setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);

  const restart = () => { center.destroy(); text.destroy(); this.scene.restart(); };
  // Zuverlässige Listener
  const rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R, false);
  const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false);
  rKey.once('down', restart);
  enterKey.once('down', restart);
  this.input.once('pointerdown', restart);
}

createBurst(x, y, color, count = 15) {
  const particles = this.add.particles(x, y, 'partikelPixel', {
    color: color,
    speed: { min: 50, max: 200 },
    angle: { min: 0, max: 360 },
    scale: { start: 1.5, end: 0 },
    lifespan: 600,
    gravityY: 300, // Partikel fallen physikalisch nach unten
    
    emitting: false // Nicht dauerhaft sprühen
  });

  // Einmalig die Partikel herausschießen
  particles.explode(count);

  // Nach 1 Sekunde das Partikel-System wieder löschen, um RAM zu sparen
  this.time.delayedCall(1000, () => particles.destroy());
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
