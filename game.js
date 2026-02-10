(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Tiefen-Ebenen
const BG_DEPTH = -10;
const FG_LABEL_DEPTH = 900;
const ACTIVE_WORD_DEPTH = 2000; // Immer ganz oben
const OVERLAY_DEPTH = 3000;

// Level-Presets
const LevelPresets = {
  einfach: { initialSpeed: 80, accelPerMinute: 8,  obstacleDelayMs: 2800, enemyDelayMs: 6000, itemDelayMs: 9000, maxExtraSpeed: 100 },
  mittel:  { initialSpeed: 110, accelPerMinute: 12, obstacleDelayMs: 2400, enemyDelayMs: 5200, itemDelayMs: 8000, maxExtraSpeed: 100 },
  schnell: { initialSpeed: 200, accelPerMinute: 16, obstacleDelayMs: 2000, enemyDelayMs: 4500, itemDelayMs: 7200, maxExtraSpeed: 120 }
};

const COLORS = { typed: '#0a7f3f', rest: '#083056', enemyRest: '#9b2c2c', itemRest: '#0b315a' };
const AUDIO = { bgmVol: 0.25, sfxVol: 0.6 };

// Physik
const GRAVITY_Y = 2000;
const JUMP_STRENGTH = 720;
const PRE_JUMP_PX = 56;
const SAFE_WINDOW = 14;

// Assets Definition
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
  }

  init() {
    // Verhindert Sound-Überlagerung beim Neustart
    this.sound.stopAll();

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
    
    // Bilder laden
    this.load.image('parrot1', 'assets/characters/parrot.png');
    this.load.image('parrot2', 'assets/characters/parrot2.png');
    this.load.image('parrot3', 'assets/characters/parrot3.png');
    this.load.image('pigeon1', 'assets/characters/pigeon.png');
    this.load.image('pigeon2', 'assets/characters/pigeon2.png');
    this.load.image('pigeon3', 'assets/characters/pigeon3.png');

    OBSTACLES.forEach(o => this.load.image(o.key, o.path));
    ENEMIES.forEach(e => this.load.image(e.key, e.path));
    ITEMS.forEach(i => this.load.image(i.key, i.path));

    this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
    this.load.audio('sfx_jump',  'assets/sounds/jump.mp3');
    this.load.audio('bgm',       'assets/sounds/bgm.mp3');

    // Dynamische Texturen erstellen
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Boden
    g.fillStyle(0x3fa34c).fillRect(0, 0, WIDTH, GROUND_H);
    g.generateTexture('groundVis', WIDTH, GROUND_H); g.clear();
    g.fillStyle(0x000000).fillRect(0, 0, WIDTH, GROUND_H);
    g.generateTexture('groundPhys', WIDTH, GROUND_H); g.clear();

    // Partikel Pixel
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
    g.generateTexture('partikelPixel', 4, 4); g.clear();

    // Wolken für Parallax
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(20, 20, 15); g.fillCircle(40, 25, 20);
    g.generateTexture('bg_clouds', 64, 64); g.clear();

    // Meer für Parallax
    g.fillStyle(0x5ca0e6, 1); g.fillRect(0, 0, 128, 64);
    g.fillStyle(0xffffff, 0.3); g.fillRect(10, 10, 40, 2); g.fillRect(60, 30, 50, 2);
    g.generateTexture('bg_sea', 128, 64);

    g.destroy();
  }

  create() {
    this.physics.world.resume();
    this.cameras.main.setBackgroundColor('#7ec4ff');

    // Hintergrund Ebenen (Parallax)
    this.clouds = this.add.tileSprite(0, 100, WIDTH, 128, 'bg_clouds').setOrigin(0,0).setAlpha(0.5).setDepth(BG_DEPTH);
    this.sea = this.add.tileSprite(0, HEIGHT - GROUND_H - 120, WIDTH, 120, 'bg_sea').setOrigin(0,0).setDepth(BG_DEPTH + 1);

    // Wörter initialisieren
    const raw = this.cache.text.get('woerter') || '';
    this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
    if (!this.state.words.length) this.state.words = ['pirat','schiff','gold','insel','meer'];
    Phaser.Utils.Array.Shuffle(this.state.words);

    // Boden Physik
    this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(100);
    const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);

    // Spieler Setup
    this.player = this.physics.add.sprite(140, HEIGHT - GROUND_H - 40, 'parrot1').setScale(0.95);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, physGround);

    // Animationen
    this.anims.create({ key: 'parrot_run',  frames: [{key:'parrot1'}, {key:'parrot2'}, {key:'parrot3'}], frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'parrot_jump', frames: [{key:'parrot2'}], frameRate: 1, repeat: -1 });
    this.player.anims.play('parrot_run');

    // Gruppen
    this.groups.obstacles = this.physics.add.group({ allowGravity: false });
    this.groups.enemies   = this.physics.add.group({ allowGravity: false });
    this.groups.items     = this.physics.add.group({ allowGravity: false });

    // Kollisionen
    this.physics.add.collider(this.player, this.groups.obstacles, (_, o) => { if(!o.cleared) this.gameOver('Kollision!'); });
    this.physics.add.overlap(this.player, this.groups.enemies, (_, e) => { if(!e.destroyed) this.gameOver('Gegner-Treffer!'); });
    this.physics.add.overlap(this.player, this.groups.items, (_, i) => { if(i.readyToCollect) this.collectItem(i); });

    // Audio
    this.sounds.kling = this.sound.add('sfx_kling', { volume: AUDIO.sfxVol });
    this.sounds.jump  = this.sound.add('sfx_jump',  { volume: AUDIO.sfxVol });
    this.sounds.bgm   = this.sound.add('bgm',       { volume: AUDIO.bgmVol, loop: true });
    if (!this.sound.locked) this.sounds.bgm.play(); else this.sound.once('unlocked', () => this.sounds.bgm.play());

    // UI & HUD
    this.ui.hud = this.add.text(12, 10, '', { fontSize: 18, color: '#083056' }).setDepth(OVERLAY_DEPTH);
    this.ui.msg = this.add.text(WIDTH/2, HEIGHT/2, '', { fontSize: 32, color: '#083056' }).setOrigin(0.5).setAlpha(0).setDepth(OVERLAY_DEPTH);

    // Eingabe
    this.input.keyboard.on('keydown', e => this.handleKey(e));

    // Spawner
    this.time.addEvent({ delay: this.level.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle() });
    this.time.addEvent({ delay: this.level.enemyDelayMs,   loop: true, callback: () => this.spawnEnemy() });
    this.time.addEvent({ delay: this.level.itemDelayMs,    loop: true, callback: () => this.spawnItem() });

    this.setupLevelButtons();
  }

  update() {
    if (this.state.gameOver) return;

    // Parallax
    this.clouds.tilePositionX += 0.15;
    this.sea.tilePositionX += (this.state.worldSpeed * 0.05);

    // Animationen steuern
    if (this.player.body.onFloor()) {
        if (this.player.anims.currentAnim.key !== 'parrot_run') this.player.anims.play('parrot_run');
    } else {
        if (this.player.anims.currentAnim.key !== 'parrot_jump') this.player.anims.play('parrot_jump');
    }

    // UI an Objekte binden & Vordergrund-Logik
    const stick = obj => {
      if (!obj.active || !obj.ui) return;
      this.updateWordUI(obj);
      obj.ui.cont.setDepth(obj === this.state.target ? ACTIVE_WORD_DEPTH : FG_LABEL_DEPTH);
      if (obj.x < -100) { this.destroyWordUI(obj); obj.destroy(); }
    };
    this.groups.obstacles.getChildren().forEach(stick);
    this.groups.enemies.getChildren().forEach(stick);
    this.groups.items.getChildren().forEach(stick);

    // Automatischer Sprung
    const pX = this.player.body.x + this.player.body.width;
    Object.keys(this.state.jumpTriggerX).forEach(id => {
      if (pX >= this.state.jumpTriggerX[id] && this.player.body.onFloor()) {
        this.player.setVelocityY(-JUMP_STRENGTH);
        this.sounds.jump.play();
        delete this.state.jumpTriggerX[id];
      }
    });

    if (!this.state.target) this.chooseTarget();
    this.updateHUD();
  }

  handleKey(e) {
    if (this.state.gameOver || !this.state.target) return;
    const got = e.key.toLowerCase();
    const expected = this.state.target.word[this.state.typedIndex].toLowerCase();

    if (got === expected) {
      this.state.typedIndex++;
      this.state.correctChars++;
      if (this.state.typedIndex === this.state.target.word.length) {
        this.onWordCompleted(this.state.target);
      }
    } else if (e.key.length === 1) {
      this.state.errors++;
      this.cameras.main.flash(80, 255, 0, 0, false);
      this.cameras.main.shake(150, 0.005); // SCREEN SHAKE bei Fehler
    }
  }

  onWordCompleted(t) {
    if (t.type === 'obstacle') {
      t.cleared = true;
      this.state.jumpTriggerX[t.id] = (t.x - t.displayWidth/2) - PRE_JUMP_PX;
    } else if (t.type === 'enemy') {
      this.createBurst(t.x, t.y, [0x9b2c2c, 0xffffff], 20);
      t.destroyed = true;
      this.destroyWordUI(t); t.destroy();
    } else if (t.type === 'item') {
      t.readyToCollect = true;
      this.state.jumpTriggerX[t.id] = (t.x - t.displayWidth/2) - PRE_JUMP_PX;
    }
    this.state.clears++;
    this.state.target = null;
    this.chooseTarget();
  }

  collectItem(it) {
    this.createBurst(it.x, it.y, [0xffd700, 0xffff00], 25);
    this.sounds.kling.play();
    this.state.score += (it.points || 50);
    this.destroyWordUI(it); it.destroy();
  }

  createBurst(x, y, colors, count) {
    const p = this.add.particles(x, y, 'partikelPixel', {
      color: colors, speed: {min: 50, max: 200}, lifespan: 600, gravityY: 300, emitting: false
    });
    p.explode(count);
    this.time.delayedCall(1000, () => p.destroy());
  }

  // Hilfsmethoden für UI
  createWordUI(obj, restColor) {
    const cont = this.add.container(0, 0);
    const g = this.add.graphics();
    const t1 = this.add.text(0, 0, '', { fontSize: 18, color: COLORS.typed }).setOrigin(0, 0.5);
    const t2 = this.add.text(0, 0, '', { fontSize: 18, color: restColor }).setOrigin(0, 0.5);
    cont.add([g, t1, t2]);
    obj.ui = { cont, g, t1, t2, restColor };
  }

  updateWordUI(obj) {
    const { cont, g, t1, t2 } = obj.ui;
    t1.setText(obj.word.slice(0, (obj === this.state.target ? this.state.typedIndex : 0)));
    t2.setText(obj.word.slice((obj === this.state.target ? this.state.typedIndex : 0)));
    
    const tw = t1.width + t2.width;
    cont.setPosition(obj.x, obj.y - obj.displayHeight/2 - 25);
    t1.setX(-tw/2); t2.setX(-tw/2 + t1.width);

    g.clear().fillStyle(0xffffff, 0.9);
    if (obj === this.state.target) g.lineStyle(3, 0xffb300, 1); else g.lineStyle(2, 0xe5e9f0, 1);
    g.fillRoundedRect(-tw/2 - 8, -15, tw + 16, 30, 8).strokeRoundedRect(-tw/2 - 8, -15, tw + 16, 30, 8);
  }

  destroyWordUI(obj) { if(obj.ui) obj.ui.cont.destroy(); }

  spawnObstacle() {
    const d = Phaser.Utils.Array.GetRandom(OBSTACLES);
    const o = this.groups.obstacles.create(WIDTH + 100, HEIGHT - GROUND_H - 30, d.key).setScale(d.scale).setImmovable(true);
    o.body.setVelocityX(-this.state.worldSpeed);
    o.id = this.state.idCounter++; o.type = 'obstacle'; o.word = this.nextWord();
    this.createWordUI(o, COLORS.rest);
  }

  spawnEnemy() {
    const d = Phaser.Utils.Array.GetRandom(ENEMIES);
    const y = d.type === 'air' ? HEIGHT - 200 : HEIGHT - GROUND_H - 25;
    const e = this.groups.enemies.create(WIDTH + 100, y, d.key).setScale(d.scale).setImmovable(true);
    e.body.setVelocityX(-this.state.worldSpeed * 1.1);
    e.type = 'enemy'; e.word = this.nextWord();
    this.createWordUI(e, COLORS.enemyRest);
  }

  spawnItem() {
    const d = Phaser.Utils.Array.GetRandom(ITEMS);
    const i = this.groups.items.create(WIDTH + 100, HEIGHT - 180, d.key).setScale(d.scale).setImmovable(true);
    i.body.setVelocityX(-this.state.worldSpeed);
    i.type = 'item'; i.word = d.word; i.points = d.points; i.id = this.state.idCounter++;
    this.createWordUI(i, COLORS.itemRest);
  }

  nextWord() { return this.state.words.shift() || 'pirat'; }

  chooseTarget() {
    const potential = [...this.groups.obstacles.getChildren(), ...this.groups.enemies.getChildren(), ...this.groups.items.getChildren()]
      .filter(o => o.active && !o.cleared && !o.destroyed && !o.readyToCollect && o.x > 150)
      .sort((a,b) => a.x - b.x);
    this.state.target = potential[0] || null;
    this.state.typedIndex = 0;
  }

  updateHUD() {
    const acc = (this.state.correctChars + this.state.errors) > 0 ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors)) : 100;
    this.ui.hud.setText(`Score: ${this.state.score} | Genauigkeit: ${acc}% | Clears: ${this.state.clears}`);
  }

  setupLevelButtons() {
    ['einfach', 'mittel', 'schnell'].forEach(lvl => {
      const btn = document.getElementById('level-' + lvl);
      if (btn) {
        btn.classList.toggle('active', this.levelName === lvl);
        btn.onclick = () => { localStorage.setItem('jnt_level', lvl); this.scene.restart(); };
      }
    });
  }

  gameOver(reason) {
    this.physics.world.pause();
    this.state.gameOver = true;
    this.add.rectangle(WIDTH/2, HEIGHT/2, 400, 200, 0x000000, 0.7).setDepth(OVERLAY_DEPTH);
    this.add.text(WIDTH/2, HEIGHT/2 - 40, `GAME OVER\n${reason}\nScore: ${this.state.score}`, { align: 'center', fontSize: 24, color: '#fff' }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
    this.add.text(WIDTH/2, HEIGHT/2 + 60, "Klicke zum Neustarten", { fontSize: 18, color: '#ffb300' }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
    this.input.once('pointerdown', () => this.scene.restart());
  }
}

const config = {
  type: Phaser.AUTO,
  width: WIDTH, height: HEIGHT,
  parent: 'game',
  physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY_Y } } },
  scene: GameScene
};
new Phaser.Game(config);
})();
