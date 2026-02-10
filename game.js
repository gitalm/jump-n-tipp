(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Tiefen-Ebenen (Z-Index)
const BG_CLOUDS_DEPTH = -10;
const BG_SEA_DEPTH = -5;
const GROUND_DEPTH = 100;
const OBJ_DEPTH = 150;      
const PLAYER_DEPTH = 500;   // Vogel ganz weit vorne
const UI_DEPTH = 900;
const ACTIVE_WORD_DEPTH = 2000;
const OVERLAY_DEPTH = 3000;

const LevelPresets = {
  einfach: { initialSpeed: 80, accelPerMinute: 8,  obstacleDelayMs: 2800, enemyDelayMs: 6000, itemDelayMs: 9000, maxExtraSpeed: 100 },
  mittel:  { initialSpeed: 110, accelPerMinute: 12, obstacleDelayMs: 2400, enemyDelayMs: 5200, itemDelayMs: 8000, maxExtraSpeed: 100 },
  schnell: { initialSpeed: 200, accelPerMinute: 16, obstacleDelayMs: 2000, enemyDelayMs: 4500, itemDelayMs: 7200, maxExtraSpeed: 120 }
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
      clears: 0, target: null, typedIndex: 0, jumpTriggerX: {},
      idCounter: 1, gameOver: false
    };
    this.groups = {}; this.sounds = {}; this.ui = {};
  }

  preload() {
    this.load.text('woerter', 'woerter.txt');
    this.load.image('parrot1', 'assets/characters/parrot.png');
    this.load.image('parrot2', 'assets/characters/parrot2.png');
    this.load.image('parrot3', 'assets/characters/parrot3.png');
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
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
    g.generateTexture('partikelPixel', 4, 4); g.clear();
    g.fillStyle(0xffffff, 0.4); g.fillCircle(40, 40, 25); g.fillCircle(70, 45, 35); g.fillCircle(110, 40, 25);
    g.generateTexture('bg_clouds', 200, 100); g.clear();
    g.fillStyle(0x5ca0e6, 1); g.fillRect(0, 0, 256, 128); g.fillStyle(0xffffff, 0.2); g.fillRect(20, 30, 60, 3);
    g.generateTexture('bg_sea', 256, 128); g.destroy();
  }

  create() {
    this.physics.world.resume();
    this.cameras.main.setBackgroundColor('#7ec4ff');
    
    this.clouds = this.add.tileSprite(0, 60, WIDTH, 100, 'bg_clouds').setOrigin(0,0).setAlpha(0.6).setDepth(BG_CLOUDS_DEPTH);
    this.seaBaseY = HEIGHT - GROUND_H - 150;
    this.sea = this.add.tileSprite(0, this.seaBaseY, WIDTH, 256, 'bg_sea').setOrigin(0,0).setDepth(BG_SEA_DEPTH);

    this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(GROUND_DEPTH);
    const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);

    // Spieler Setup
    this.player = this.physics.add.sprite(140, HEIGHT - GROUND_H - 80, 'parrot1').setScale(0.95).setDepth(PLAYER_DEPTH);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, physGround);

    // Animationen sicher erstellen
    this.anims.create({ key: 'parrot_run',  frames: [{key:'parrot1'}, {key:'parrot2'}, {key:'parrot3'}], frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'parrot_jump', frames: [{key:'parrot2'}], frameRate: 1, repeat: -1 });
    this.player.anims.play('parrot_run');

    // Wörter
    const raw = this.cache.text.get('woerter') || '';
    this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
    if (!this.state.words.length) this.state.words = ['ahoi','pirat','boot','gold','schatz'];
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
    this.time.addEvent({ delay: this.level.enemyDelayMs,   loop: true, callback: () => this.spawnEnemy() });
    this.time.addEvent({ delay: this.level.itemDelayMs,    loop: true, callback: () => this.spawnItem() });
    this.setupLevelButtons();
  }

  update() {
    if (this.state.gameOver) return;

    // Animation wechseln (Sicherheits-Check für den Vogel)
    const currentKey = this.player.anims.currentAnim ? this.player.anims.currentAnim.key : null;
    if (this.player.body.onFloor()) {
        if (currentKey !== 'parrot_run') this.player.anims.play('parrot_run');
    } else {
        if (currentKey !== 'parrot_jump') this.player.anims.play('parrot_jump');
    }

    // Parallax & Sinus-Welle
    this.clouds.tilePositionX += 0.1;
    this.sea.tilePositionX += (this.state.worldSpeed * 0.008);
    this.sea.y = this.seaBaseY + Math.sin(this.time.now / 1200) * 12;

    const stick = obj => {
      if (!obj.active || !obj.ui) return;
      this.updateWordUI(obj);
      obj.ui.cont.setDepth(obj === this.state.target ? ACTIVE_WORD_DEPTH : UI_DEPTH);
      if (obj.x < -150) { if(obj.ui) obj.ui.cont.destroy(); obj.destroy(); }
    };
    [...this.groups.obstacles.getChildren(), ...this.groups.enemies.getChildren(), ...this.groups.items.getChildren()].forEach(stick);

    // Sprung
    const pX = this.player.body.x + this.player.body.width;
    Object.keys(this.state.jumpTriggerX).forEach(id => {
      if (pX >= this.state.jumpTriggerX[id] && this.player.body.onFloor()) {
        this.player.setVelocityY(-760); this.sounds.jump.play(); delete this.state.jumpTriggerX[id];
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
      if (this.state.typedIndex === this.state.target.word.length) this.onWordCompleted(this.state.target);
    } else if (e.key.length === 1) {
      this.state.errors++;
      this.cameras.main.shake(120, 0.006);
      this.cameras.main.flash(60, 200, 0, 0, false);
    }
  }

  onWordCompleted(t) {
    if (t.type === 'obstacle') {
      t.cleared = true; this.state.score += 10;
      this.state.jumpTriggerX[t.id] = (t.x - t.displayWidth/2) - 65;
    } else if (t.type === 'enemy') {
      this.state.score += 25;
      this.createBurst(t.x, t.y, [0x9b2c2c, 0xffffff], 20);
      t.destroyed = true; if(t.ui) t.ui.cont.destroy(); t.destroy();
    } else if (t.type === 'item') {
      t.readyToCollect = true; 
      this.state.jumpTriggerX[t.id] = (t.x - t.displayWidth/2) - 65;
    }
    this.state.target = null; this.chooseTarget();
  }

  collectItem(it) {
    this.createBurst(it.x, it.y, [0xffd700, 0xffff00], 25);
    this.sounds.kling.play(); 
    this.state.score += 50; 
    if(it.ui) it.ui.cont.destroy(); it.destroy();
  }

  createBurst(x, y, colors, count) {
    const p = this.add.particles(x, y, 'partikelPixel', {
      color: colors, speed: {min: 60, max: 220}, lifespan: 700, gravityY: 400, emitting: false
    });
    p.explode(count); this.time.delayedCall(1000, () => p.destroy());
  }

  spawnObstacle() {
    const d = Phaser.Utils.Array.GetRandom(OBSTACLES);
    const o = this.groups.obstacles.create(WIDTH + 150, 0, d.key).setImmovable(true).setDepth(OBJ_DEPTH);
    let s = d.key === 'ship' ? Phaser.Math.FloatBetween(0.5, 0.9) : d.scale;
    o.setScale(s);
    o.y = HEIGHT - GROUND_H - (o.displayHeight / 2) + 5; 
    o.body.setVelocityX(-this.state.worldSpeed);
    o.id = this.state.idCounter++; o.type = 'obstacle'; o.word = this.nextWord();
    this.createWordUI(o, COLORS.rest);
  }

  spawnEnemy() {
    const y = Phaser.Math.Between(0, 1) ? HEIGHT - 220 : HEIGHT - GROUND_H - 35;
    const e = this.groups.enemies.create(WIDTH + 150, y, 'skull').setScale(0.9).setImmovable(true).setDepth(OBJ_DEPTH);
    e.body.setVelocityX(-this.state.worldSpeed * 1.1); e.type = 'enemy'; e.word = this.nextWord();
    this.createWordUI(e, COLORS.enemyRest);
  }

  spawnItem() {
    const i = this.groups.items.create(WIDTH + 150, HEIGHT - 200, 'coin').setScale(0.8).setImmovable(true).setDepth(OBJ_DEPTH);
    i.body.setVelocityX(-this.state.worldSpeed); i.type = 'item'; i.word = 'gold'; i.id = this.state.idCounter++;
    this.createWordUI(i, COLORS.itemRest);
  }

  nextWord() { return this.state.words.shift() || 'pirat'; }

  chooseTarget() {
    const pot = [...this.groups.obstacles.getChildren(), ...this.groups.enemies.getChildren(), ...this.groups.items.getChildren()]
      .filter(o => o.active && !o.cleared && !o.destroyed && !o.readyToCollect && o.x > 180)
      .sort((a,b) => a.x - b.x);
    this.state.target = pot[0] || null; this.state.typedIndex = 0;
  }

  createWordUI(obj, color) {
    const cont = this.add.container(0, 0); const g = this.add.graphics();
    const t1 = this.add.text(0, 0, '', { fontSize: 19, color: COLORS.typed, fontStyle: 'bold' }).setOrigin(0, 0.5);
    const t2 = this.add.text(0, 0, '', { fontSize: 19, color: color }).setOrigin(0, 0.5);
    cont.add([g, t1, t2]); obj.ui = { cont, g, t1, t2 };
  }

  updateWordUI(obj) {
    const { cont, g, t1, t2 } = obj.ui; const isT = (obj === this.state.target);
    t1.setText(obj.word.slice(0, isT ? this.state.typedIndex : 0));
    t2.setText(obj.word.slice(isT ? this.state.typedIndex : 0));
    const tw = t1.width + t2.width; cont.setPosition(obj.x, obj.y - obj.displayHeight/2 - 30);
    t1.setX(-tw/2); t2.setX(-tw/2 + t1.width);
    g.clear().fillStyle(0xffffff, 0.9);
    if(isT) g.lineStyle(3, 0xffb300, 1); else g.lineStyle(2, 0xccd6e0, 1);
    g.fillRoundedRect(-tw/2 - 10, -18, tw + 20, 36, 10).strokeRoundedRect(-tw/2 - 10, -18, tw + 20, 36, 10);
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
    this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH, HEIGHT, 0x000000, 0.4).setDepth(OVERLAY_DEPTH);
    this.add.text(WIDTH/2, HEIGHT/2, `${reason}\nPunkte: ${this.state.score}\nKlicke zum Neustarten`, { fontSize: 32, color: '#fff', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(OVERLAY_DEPTH+1);
    this.input.once('pointerdown', () => this.scene.restart());
  }
}

const config = { type: Phaser.AUTO, width: WIDTH, height: HEIGHT, parent: 'game', physics: { default: 'arcade', arcade: { gravity: { y: 2000 } } }, scene: GameScene };
new Phaser.Game(config);
})();
