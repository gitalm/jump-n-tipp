(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Tiefen-Ebenen
const BG_CLOUDS_DEPTH = -10;
const BG_SEA_DEPTH = -5;
const GROUND_DEPTH = 100;
const OBJ_DEPTH = 150;      
const PLAYER_DEPTH = 500;   
const PIGEON_DEPTH = 600;   
const UI_DEPTH = 900;
const ACTIVE_WORD_DEPTH = 2000;
const OVERLAY_DEPTH = 3000;

const LevelPresets = {
  einfach: { initialSpeed: 50, accelPerMinute: 4,  obstacleDelayMs: 5500, enemyDelayMs: 9500, itemDelayMs: 12000, maxExtraSpeed: 70 },
  mittel:  { initialSpeed: 70, accelPerMinute: 7,  obstacleDelayMs: 4500, enemyDelayMs: 8000, itemDelayMs: 10000, maxExtraSpeed: 90 },
  schnell: { initialSpeed: 110, accelPerMinute: 12, obstacleDelayMs: 3500, enemyDelayMs: 6500, itemDelayMs: 8500, maxExtraSpeed: 140 }
};

const COLORS = { typed: '#0a7f3f', rest: '#083056', enemyRest: '#9b2c2c', itemRest: '#0b315a' };
const AUDIO = { bgmVol: 0.25, sfxVol: 0.6 };

const OBSTACLES = [
  { key: 'barrel', scale: 0.65 },
  { key: 'thorn_big', scale: 0.8 },
  { key: 'thorn_small', scale: 0.85 },
  { key: 'ship', scale: 0.7 } 
];

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  init() {
    this.sound.stopAll();
    this.levelName = localStorage.getItem('jnt_level') || 'mittel';
    this.level = LevelPresets[this.levelName] || LevelPresets.mittel;
    this.state = {
      words: [], worldSpeed: this.level.initialSpeed, score: 0,
      correctChars: 0, errors: 0, startTime: performance.now(),
      clears: 0, target: null, typedIndex: 0, 
      idCounter: 1, gameOver: false
    };
    this.groups = {}; this.sounds = {}; this.ui = {}; this.presenter = {};
  }

  preload() {
    this.load.text('woerter', 'woerter.txt');
    this.load.image('parrot1', 'assets/characters/parrot.png');
    this.load.image('parrot2', 'assets/characters/parrot2.png');
    this.load.image('parrot3', 'assets/characters/parrot3.png');
    this.load.image('pigeon1', 'assets/characters/pigeon.png'); 
    this.load.image('barrel', 'assets/obstacles/barrel.png');
    this.load.image('thorn_big', 'assets/obstacles/big_thorns.png');
    this.load.image('thorn_small', 'assets/obstacles/small_thorn.png');
    this.load.image('ship', 'assets/environment/ship.png');
    this.load.image('skull', 'assets/environment/skull.png');
    this.load.image('coin', 'assets/items/coin.png');
    this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
    this.load.audio('sfx_jump',  'assets/sounds/jump.mp3');
    this.load.audio('bgm',       'assets/sounds/bgm.mp3');

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x3fa34c).fillRect(0, 0, WIDTH, GROUND_H);
    g.generateTexture('groundVis', WIDTH, GROUND_H); g.clear();
    g.fillStyle(0x000000).fillRect(0, 0, WIDTH, GROUND_H);
    g.generateTexture('groundPhys', WIDTH, GROUND_H); g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, 6, 6);
    g.generateTexture('partikelPixel', 6, 6); g.destroy();
    
    // Hintergründe
    const g2 = this.make.graphics({ x: 0, y: 0, add: false });
    g2.fillStyle(0xffffff, 0.4); g2.fillCircle(40, 40, 25); g2.fillCircle(70, 45, 35); g2.fillCircle(110, 40, 25);
    g2.generateTexture('bg_clouds', 200, 100); g2.clear();
    g2.fillStyle(0x5ca0e6, 1); g2.fillRect(0, 0, 256, 128); g2.fillStyle(0xffffff, 0.2); g2.fillRect(20, 30, 60, 3);
    g2.generateTexture('bg_sea', 256, 128); g2.destroy();
  }

  create() {
    this.physics.world.resume();
    this.cameras.main.setBackgroundColor('#7ec4ff');
    
    this.clouds = this.add.tileSprite(0, 60, WIDTH, 100, 'bg_clouds').setOrigin(0,0).setAlpha(0.6).setDepth(BG_CLOUDS_DEPTH);
    this.seaBaseY = HEIGHT - GROUND_H - 150;
    this.sea = this.add.tileSprite(0, this.seaBaseY, WIDTH, 256, 'bg_sea').setOrigin(0,0).setDepth(BG_SEA_DEPTH);
    this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(GROUND_DEPTH);
    const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);

    // Spieler
    this.player = this.physics.add.sprite(140, HEIGHT - GROUND_H - 100, 'parrot1').setScale(0.95).setDepth(PLAYER_DEPTH);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, physGround);

    // Pigeon (Sanfte Taube)
    this.presenter.pigeon = this.add.sprite(WIDTH/2, 150, 'pigeon1').setScale(0.5).setDepth(PIGEON_DEPTH);

    this.anims.create({ key: 'parrot_run',  frames: [{key:'parrot1'}, {key:'parrot2'}, {key:'parrot3'}], frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'parrot_jump', frames: [{key:'parrot2'}], frameRate: 1, repeat: -1 });
    this.player.anims.play('parrot_run');

    const raw = this.cache.text.get('woerter') || '';
    this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
    Phaser.Utils.Array.Shuffle(this.state.words);

    this.groups.obstacles = this.physics.add.group({ allowGravity: false });
    this.groups.enemies   = this.physics.add.group({ allowGravity: false });
    this.groups.items     = this.physics.add.group({ allowGravity: false });

    this.physics.add.collider(this.player, this.groups.obstacles, (_, o) => { if(!o.cleared) this.gameOver('Hoppla!'); });
    this.physics.add.overlap(this.player, this.groups.enemies, (_, e) => { if(!e.destroyed) this.gameOver('Gegner!'); });
    this.physics.add.overlap(this.player, this.groups.items, (_, i) => { if(i.readyToCollect) this.collectItem(i); });

    this.sounds.kling = this.sound.add('sfx_kling', { volume: AUDIO.sfxVol });
    this.sounds.jump  = this.sound.add('sfx_jump',  { volume: AUDIO.sfxVol });
    this.sounds.bgm   = this.sound.add('bgm',       { volume: AUDIO.bgmVol, loop: true });
    this.sounds.bgm.play();

    this.ui.hud = this.add.text(20, 20, '', { fontSize: 22, color: '#083056', fontStyle: 'bold' }).setDepth(OVERLAY_DEPTH);
    this.input.keyboard.on('keydown', e => this.handleKey(e));

    this.time.addEvent({ delay: this.level.obstacleDelayMs, loop: true, callback: () => this.spawnObstacle() });
    this.time.delayedCall(6000, () => { this.time.addEvent({ delay: this.level.itemDelayMs, loop: true, callback: () => this.spawnItem() }); });
    this.time.delayedCall(12000, () => { this.time.addEvent({ delay: this.level.enemyDelayMs, loop: true, callback: () => this.spawnEnemy() }); });

    this.setupLevelButtons();
  }

  update() {
    if (this.state.gameOver) return;

    const elapsed = (performance.now() - this.state.startTime) / 60000;
    this.state.worldSpeed = this.level.initialSpeed + Math.min(this.level.maxExtraSpeed, this.level.accelPerMinute * elapsed);

    // Animationen
    const anim = this.player.anims.currentAnim ? this.player.anims.currentAnim.key : '';
    if (this.player.body.onFloor()) {
        if (anim !== 'parrot_run') this.player.anims.play('parrot_run');
    } else {
        if (anim !== 'parrot_jump') this.player.anims.play('parrot_jump');
    }

    this.clouds.tilePositionX += 0.1;
    this.sea.tilePositionX += (this.state.worldSpeed * 0.007);
    this.sea.y = this.seaBaseY + Math.sin(this.time.now / 1500) * 12;

    const stick = obj => {
      if (!obj.active || !obj.ui) return;
      this.updateWordUI(obj);
      if (obj.body) obj.body.setVelocityX(-this.state.worldSpeed * (obj.type === 'enemy' ? 1.1 : 1.0));
      obj.ui.cont.setDepth(obj === this.state.target ? ACTIVE_WORD_DEPTH : UI_DEPTH);
      
      // SPRUNG-LOGIK: Wenn Objekt fertig getippt UND nah genug am Spieler UND Spieler am Boden
      if (obj.readyToJump && this.player.body.onFloor() && obj.x > this.player.x && obj.x < this.player.x + 220) {
        this.player.setVelocityY(-820);
        this.sounds.jump.play();
        obj.readyToJump = false; // Nur einmal springen
      }

      if (obj.x < -180) { if(obj.ui) obj.ui.cont.destroy(); obj.destroy(); }
    };
    [...this.groups.obstacles.getChildren(), ...this.groups.enemies.getChildren(), ...this.groups.items.getChildren()].forEach(stick);

    // Pigeon geschmeidig fliegen lassen
    if (this.state.target) {
        const tx = this.state.target.x - 140;
        const ty = this.state.target.y - 120 + Math.sin(this.time.now / 400) * 15;
        this.presenter.pigeon.x += (tx - this.presenter.pigeon.x) * 0.03; // Geschmeidiger (0.03)
        this.presenter.pigeon.y += (ty - this.presenter.pigeon.y) * 0.03;
    }

    this.updateHUD();
  }

  handleKey(e) {
    if (this.state.gameOver || !this.state.target) return;
    const got = e.key.toLowerCase();
    const expected = this.state.target.word[this.state.typedIndex].toLowerCase();

    if (got === expected) {
      this.state.typedIndex++;
      this.state.correctChars++;
      if (this.state.typedIndex === this.state.target.word.length) this.onWordCompleted(this.state.target);
    } else if (e.key.length === 1) {
      this.state.errors++;
      this.cameras.main.shake(100, 0.004);
      this.cameras.main.flash(50, 200, 0, 0, false);
    }
  }

  onWordCompleted(t) {
    if (t.body) t.body.checkCollision.none = true; 

    // Visueller Effekt beim Beenden (Wortbox hüpft kurz)
    this.tweens.add({ targets: t.ui.cont, scale: 1.4, duration: 120, yoyo: true });

    if (t.type === 'obstacle') {
      t.cleared = true; this.state.score += 10;
      t.readyToJump = true; // Flag für den Sprung setzen
    } else if (t.type === 'enemy') {
      this.state.score += 25;
      this.createBurst(t.x, t.y, 0x9b2c2c, 25); 
      t.destroyed = true; if(t.ui) t.ui.cont.destroy(); t.destroy();
    } else if (t.type === 'item') {
      t.readyToCollect = true; 
      t.readyToJump = true; 
    }
    this.state.target = null;
    this.chooseTarget();
  }

  collectItem(it) {
    this.createBurst(it.x, it.y, 0xffd700, 30); // Goldene Explosion
    this.sounds.kling.play(); 
    this.state.score += 50; 
    if(it.ui) it.ui.cont.destroy(); it.destroy();
  }

  createBurst(x, y, color, count) {
    const p = this.add.particles(x, y, 'partikelPixel', {
      color: [color, 0xffffff, 0xffae00],
      speed: { min: 100, max: 300 },
      lifespan: 1000,
      gravityY: 500,
      scale: { start: 1.2, end: 0 },
      emitting: false
    });
    p.explode(count);
    this.time.delayedCall(1500, () => p.destroy());
  }

  spawnObstacle() {
    const d = Phaser.Utils.Array.GetRandom(OBSTACLES);
    const o = this.groups.obstacles.create(WIDTH + 150, 0, d.key).setImmovable(true).setDepth(OBJ_DEPTH);
    let s = d.key === 'ship' ? Phaser.Math.FloatBetween(0.5, 0.8) : d.scale;
    o.setScale(s).setDepth(OBJ_DEPTH);
    o.y = HEIGHT - GROUND_H - (o.displayHeight / 2) + 5; 
    o.id = this.state.idCounter++; o.type = 'obstacle'; o.word = this.nextWord();
    this.createWordUI(o, COLORS.rest);
  }

  spawnEnemy() {
    const y = Phaser.Math.Between(0, 1) ? HEIGHT - 220 : HEIGHT - GROUND_H - 35;
    const e = this.groups.enemies.create(WIDTH + 150, y, 'skull').setScale(0.9).setImmovable(true).setDepth(OBJ_DEPTH);
    e.type = 'enemy'; e.word = this.nextWord();
    this.createWordUI(e, COLORS.enemyRest);
  }

  spawnItem() {
    const i = this.groups.items.create(WIDTH + 150, HEIGHT - 200, 'coin').setScale(0.85).setImmovable(true).setDepth(OBJ_DEPTH);
    i.type = 'item'; i.word = 'gold'; i.id = this.state.idCounter++;
    this.createWordUI(i, COLORS.itemRest);
  }

  nextWord() { return this.state.words.shift() || 'ahoi'; }

  chooseTarget() {
    const pot = [...this.groups.obstacles.getChildren(), ...this.groups.enemies.getChildren(), ...this.groups.items.getChildren()]
      .filter(o => o.active && !o.cleared && !o.destroyed && !o.readyToCollect && o.x > 180)
      .sort((a,b) => a.x - b.x);
    this.state.target = pot[0] || null; this.state.typedIndex = 0;
  }

  createWordUI(obj, color) {
    const cont = this.add.container(0, 0); const g = this.add.graphics();
    const t1 = this.add.text(0, 0, '', { fontSize: 21, color: COLORS.typed, fontStyle: 'bold', fontFamily: 'monospace' }).setOrigin(0, 0.5);
    const t2 = this.add.text(0, 0, '', { fontSize: 21, color: color, fontFamily: 'monospace' }).setOrigin(0, 0.5);
    cont.add([g, t1, t2]); obj.ui = { cont, g, t1, t2 };
  }

  updateWordUI(obj) {
    const { cont, g, t1, t2 } = obj.ui; const isT = (obj === this.state.target);
    t1.setText(obj.word.slice(0, isT ? this.state.typedIndex : 0));
    t2.setText(obj.word.slice(isT ? this.state.typedIndex : 0));
    const tw = t1.width + t2.width; cont.setPosition(obj.x, obj.y - obj.displayHeight/2 - 40);
    t1.setX(-tw/2); t2.setX(-tw/2 + t1.width);
    g.clear().fillStyle(0xffffff, 0.95);
    if(isT) g.lineStyle(4, 0xffb300, 1); else g.lineStyle(2, 0xccd6e0, 1);
    g.fillRoundedRect(-tw/2 - 12, -20, tw + 24, 40, 12).strokeRoundedRect(-tw/2 - 12, -20, tw + 24, 40, 12);
  }

  updateHUD() {
    const acc = (this.state.correctChars + this.state.errors) > 0 ? Math.round(100 * this.state.correctChars / (this.state.correctChars + this.state.errors)) : 100;
    this.ui.hud.setText(`Punkte: ${this.state.score} | Genauigkeit: ${acc}%`);
  }

  setupLevelButtons() {
    ['einfach', 'mittel', 'schnell'].forEach(l => {
      const b = document.getElementById('level-' + l);
      if(b) { b.classList.toggle('active', this.levelName === l); b.onclick = () => { localStorage.setItem('jnt_level', l); this.scene.restart(); }; }
    });
  }

  gameOver(reason) {
    this.physics.world.pause(); this.state.gameOver = true;
    this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH, HEIGHT, 0x000000, 0.5).setDepth(OVERLAY_DEPTH);
    this.add.text(WIDTH/2, HEIGHT/2, `${reason}\nPunkte: ${this.state.score}\nKlicke zum Neustarten`, { fontSize: 36, color: '#fff', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(OVERLAY_DEPTH+1);
    this.input.once('pointerdown', () => this.scene.restart());
  }
}

const config = { type: Phaser.AUTO, width: WIDTH, height: HEIGHT, parent: 'game', physics: { default: 'arcade', arcade: { gravity: { y: 2000 } } }, scene: GameScene };
new Phaser.Game(config);
})();
