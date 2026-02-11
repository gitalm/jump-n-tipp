(() => {
const WIDTH = 960;
const HEIGHT = 540;
const GROUND_H = 56;

// Tiefen-Ebenen
const BG_DEPTH = -10;
const GROUND_DEPTH = 100;
const OBJ_DEPTH = 150;      
const PLAYER_DEPTH = 500;   
const UI_DEPTH = 1000;
const ACTIVE_WORD_DEPTH = 5000; // Absolute Spitze

const LevelPresets = {
  einfach: { initialSpeed: 60, accelPerMinute: 4,  obsDelay: 5000, itemDelay: 10000 },
  mittel:  { initialSpeed: 90, accelPerMinute: 7,  obsDelay: 4000, itemDelay: 8000 },
  schnell: { initialSpeed: 140, accelPerMinute: 12, obsDelay: 3000, itemDelay: 6000 }
};

const COLORS = { typed: '#0a7f3f', rest: '#083056', enemyRest: '#9b2c2c', itemRest: '#0b315a' };

// Definitionen
const OBSTACLES = [
  { key: 'barrel', scale: 0.65 },
  { key: 'ship', scale: 0.8 },
  { key: 'big_thorns', scale: 0.8 },
  { key: 'small_thorn', scale: 0.85 }
];
const ITEMS = [
  { key: 'coin', word: 'gold', pts: 50 },
  { key: 'heart', word: 'herz', pts: 100 },
  { key: 'chest', word: 'schatz', pts: 200 },
  { key: 'bomb', word: 'bombe', pts: 75 },
  { key: 'compass', word: 'uhr', pts: 60 }
];
const ENEMIES = [
  { key: 'skull', scale: 0.85, air: true },
  { key: 'crab', scale: 0.9, air: false }
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
      target: null, typedIndex: 0, gameOver: false
    };
    this.groups = {}; this.sounds = {}; this.ui = {};
  }

  preload() {
    this.load.text('woerter', 'woerter.txt');
    this.load.image('parrot1', 'assets/characters/parrot.png');
    this.load.image('parrot2', 'assets/characters/parrot2.png');
    this.load.image('parrot3', 'assets/characters/parrot3.png');
    this.load.image('pigeon1', 'assets/characters/pigeon.png');
    
    OBSTACLES.forEach(d => this.load.image(d.key, `assets/obstacles/${d.key}.png` || `assets/environment/${d.key}.png`));
    this.load.image('ship', 'assets/environment/ship.png'); // Extra Pfad-Check
    this.load.image('skull', 'assets/environment/skull.png');
    this.load.image('crab', 'assets/environment/crab.png');
    ITEMS.forEach(d => this.load.image(d.key, `assets/items/${d.key}.png`));

    this.load.audio('sfx_kling', 'assets/sounds/kling.mp3');
    this.load.audio('sfx_jump',  'assets/sounds/jump.mp3');
    this.load.audio('bgm',       'assets/sounds/bgm.mp3');

    // Texturen generieren
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
    g.generateTexture('confetti', 8, 8); g.clear();
    g.fillStyle(0x3fa34c).fillRect(0, 0, WIDTH, GROUND_H);
    g.generateTexture('groundVis', WIDTH, GROUND_H); g.clear();
    g.fillStyle(0x000000).fillRect(0, 0, WIDTH, GROUND_H);
    g.generateTexture('groundPhys', WIDTH, GROUND_H); g.clear();
    g.fillStyle(0xffffff, 0.4); g.fillCircle(40, 40, 25); g.fillCircle(70, 45, 35);
    g.generateTexture('bg_clouds', 200, 100); g.clear();
    g.fillStyle(0x5ca0e6, 1); g.fillRect(0, 0, 256, 128); g.fillStyle(0xffffff, 0.2); g.fillRect(20, 30, 60, 3);
    g.generateTexture('bg_sea', 256, 128); g.destroy();
  }

  create() {
    this.physics.world.resume();
    this.cameras.main.setBackgroundColor('#7ec4ff');
    this.clouds = this.add.tileSprite(0, 60, WIDTH, 100, 'bg_clouds').setOrigin(0,0).setAlpha(0.6).setDepth(BG_DEPTH);
    this.sea = this.add.tileSprite(0, HEIGHT - GROUND_H - 150, WIDTH, 256, 'bg_sea').setOrigin(0,0).setDepth(BG_DEPTH + 1);
    
    const physGround = this.physics.add.staticImage(WIDTH/2, HEIGHT - GROUND_H/2, 'groundPhys').setAlpha(0);
    this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'groundVis').setDepth(GROUND_DEPTH);

    // Pirat
    this.player = this.physics.add.sprite(140, HEIGHT - GROUND_H - 100, 'parrot1').setScale(0.95).setDepth(PLAYER_DEPTH);
    this.player.setCollideWorldBounds(true);
    this.player.body.setGravityY(2500);
    this.physics.add.collider(this.player, physGround);

    // Taube
    this.pigeon = this.add.sprite(WIDTH/2, 100, 'pigeon1').setScale(0.5).setDepth(UI_DEPTH);

    this.anims.create({ key: 'run', frames: [{key:'parrot1'}, {key:'parrot2'}, {key:'parrot3'}], frameRate: 8, repeat: -1 });
    this.player.anims.play('run');

    // Wörter
    const raw = this.cache.text.get('woerter') || 'pirat gold ahoi';
    this.state.words = raw.split(/\s+/).filter(w => w.length > 2);
    Phaser.Utils.Array.Shuffle(this.state.words);

    this.groups.obs = this.physics.add.group({ allowGravity: false });
    this.groups.items = this.physics.add.group({ allowGravity: false });

    // Kollision (Nur wenn NICHT cleared)
    this.physics.add.overlap(this.player, this.groups.obs, (_, o) => { if(!o.cleared) this.gameOver('Hoppla!'); });
    this.physics.add.overlap(this.player, this.groups.items, (_, i) => { if(i.ready) this.collectItem(i); });

    this.sounds.kling = this.sound.add('sfx_kling');
    this.sounds.jump = this.sound.add('sfx_jump');
    this.sounds.bgm = this.sound.add('bgm', { volume: 0.3, loop: true });
    this.sounds.bgm.play();

    this.ui.hud = this.add.text(20, 20, '', { fontSize: 24, color: '#083056', fontStyle: 'bold' }).setDepth(ACTIVE_WORD_DEPTH);
    this.input.keyboard.on('keydown', e => this.handleKey(e));

    this.spawnObstacle();
    this.time.addEvent({ delay: this.level.obsDelay, loop: true, callback: () => this.spawnObstacle() });
    this.time.addEvent({ delay: this.level.itemDelay, loop: true, callback: () => this.spawnItem() });

    this.setupLevelButtons();
  }

  update() {
    if (this.state.gameOver) return;

    // Beschleunigung
    this.state.worldSpeed += 0.01;
    
    this.clouds.tilePositionX += 0.2;
    this.sea.tilePositionX += (this.state.worldSpeed * 0.005);
    this.sea.y = (HEIGHT - GROUND_H - 150) + Math.sin(this.time.now / 1000) * 10;

    const proc = obj => {
      if (!obj.active) return;
      obj.x -= (this.state.worldSpeed / 60);
      if (obj.ui) {
        this.updateWordUI(obj);
        obj.ui.cont.setDepth(obj === this.state.target ? ACTIVE_WORD_DEPTH : UI_DEPTH);
      }
      // Auto-Sprung Logik
      if (obj.readyToJump && this.player.body.onFloor() && obj.x < this.player.x + 120 && obj.x > this.player.x) {
        this.player.setVelocityY(-950);
        this.player.setVelocityX(150); // Kleiner Schubs nach vorne
        this.time.delayedCall(400, () => this.player.setVelocityX(0)); // Zurück auf Position
        this.sounds.jump.play();
        obj.readyToJump = false;
      }
      if (obj.x < -200) { if(obj.ui) obj.ui.cont.destroy(); obj.destroy(); }
    };
    this.groups.obs.getChildren().forEach(proc);
    this.groups.items.getChildren().forEach(proc);

    if (!this.state.target) this.chooseTarget();

    if (this.state.target) {
      const tx = this.state.target.x - 120;
      const ty = this.state.target.y - 100 + Math.sin(this.time.now / 500) * 20;
      this.pigeon.x += (tx - this.pigeon.x) * 0.04;
      this.pigeon.y += (ty - this.pigeon.y) * 0.04;
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
      this.cameras.main.shake(100, 0.005);
    }
  }

  onWordCompleted(t) {
    this.tweens.add({ targets: t.ui.cont, scale: 1.5, alpha: 0, duration: 200 });
    
    if (t.type === 'obs') {
      t.cleared = true; t.readyToJump = true; this.state.score += 10;
    } else {
      t.ready = true; t.readyToJump = true; // Items auch überspringen wenn gewollt
    }
    this.state.target = null;
    this.chooseTarget();
  }

  collectItem(it) {
    this.confettiRain(it.x, it.y);
    this.sounds.kling.play();
    this.state.score += 100;
    if(it.ui) it.ui.cont.destroy();
    it.destroy();
  }

  confettiRain(x, y) {
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffa500];
    for (let i = 0; i < 30; i++) {
      const p = this.add.image(x, y, 'confetti').setDepth(ACTIVE_WORD_DEPTH);
      p.setTint(Phaser.Utils.Array.GetRandom(colors));
      this.physics.add.existing(p);
      p.body.setVelocity(Phaser.Math.Between(-200, 200), Phaser.Math.Between(-400, -100));
      p.body.setGravityY(600);
      p.body.setAngularVelocity(Phaser.Math.Between(100, 500));
      this.time.delayedCall(2000, () => p.destroy());
    }
  }

  spawnObstacle() {
    const d = Phaser.Utils.Array.GetRandom(OBSTACLES);
    const o = this.add.sprite(WIDTH + 200, HEIGHT - GROUND_H - 10, d.key).setScale(d.scale).setDepth(OBJ_DEPTH);
    this.physics.add.existing(o);
    o.y = HEIGHT - GROUND_H - (o.displayHeight / 2) + 2;
    o.type = 'obs'; o.cleared = false; o.word = this.state.words.shift() || 'ahoi';
    this.groups.obs.add(o);
    this.createWordUI(o, '#9b2c2c');
    if(this.state.words.length < 5) this.state.words.push('pirat','gold','insel','schatz');
  }

  spawnItem() {
    const d = Phaser.Utils.Array.GetRandom(ITEMS);
    const i = this.add.sprite(WIDTH + 200, HEIGHT - 220, d.key).setScale(0.8).setDepth(OBJ_DEPTH);
    this.physics.add.existing(i);
    i.type = 'item'; i.ready = false; i.word = d.word;
    this.groups.items.add(i);
    this.createWordUI(i, '#0b315a');
  }

  chooseTarget() {
    const pot = [...this.groups.obs.getChildren(), ...this.groups.items.getChildren()]
      .filter(o => o.active && !o.cleared && !o.ready && o.x > 160)
      .sort((a,b) => a.x - b.x);
    if (pot.length > 0) { this.state.target = pot[0]; this.state.typedIndex = 0; }
  }

  createWordUI(obj, color) {
    const cont = this.add.container(0, 0);
    const g = this.add.graphics();
    const t1 = this.add.text(0, 0, '', { fontSize: 22, color: COLORS.typed, fontStyle: 'bold', fontFamily: 'monospace' }).setOrigin(0, 0.5);
    const t2 = this.add.text(0, 0, '', { fontSize: 22, color: color, fontFamily: 'monospace' }).setOrigin(0, 0.5);
    cont.add([g, t1, t2]); obj.ui = { cont, g, t1, t2 };
  }

  updateWordUI(obj) {
    const { cont, g, t1, t2 } = obj.ui; const isT = (obj === this.state.target);
    t1.setText(obj.word.slice(0, isT ? this.state.typedIndex : 0));
    t2.setText(obj.word.slice(isT ? this.state.typedIndex : 0));
    const tw = t1.width + t2.width;
    cont.setPosition(obj.x, obj.y - obj.displayHeight/2 - 40);
    t1.setX(-tw/2); t2.setX(-tw/2 + t1.width);
    g.clear().fillStyle(0xffffff, 0.95).lineStyle(isT ? 4 : 2, isT ? 0xffb300 : 0xccd6e0);
    g.fillRoundedRect(-tw/2-10, -20, tw+20, 40, 10).strokeRoundedRect(-tw/2-10, -20, tw+20, 40, 10);
  }

  updateHUD() {
    this.ui.hud.setText(`Punkte: ${this.state.score}`);
  }

  setupLevelButtons() {
    ['einfach', 'mittel', 'schnell'].forEach(l => {
      const b = document.getElementById('level-' + l);
      if(b) { b.classList.toggle('active', this.levelName === l); b.onclick = () => { localStorage.setItem('jnt_level', l); this.scene.restart(); }; }
    });
  }

  gameOver(res) {
    this.physics.world.pause(); this.state.gameOver = true;
    this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH, HEIGHT, 0, 0.5).setDepth(OVERLAY_DEPTH);
    this.add.text(WIDTH/2, HEIGHT/2, `GAME OVER\n${res}\n\nKlick zum Neustart`, { fontSize: 40, color: '#fff', align: 'center' }).setOrigin(0.5).setDepth(OVERLAY_DEPTH+1);
    this.input.once('pointerdown', () => this.scene.restart());
  }
}

const config = { type: Phaser.AUTO, width: WIDTH, height: HEIGHT, parent: 'game', physics: { default: 'arcade' }, scene: GameScene };
new Phaser.Game(config);
})();
