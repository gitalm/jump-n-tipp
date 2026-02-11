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
const ACTIVE_WORD_DEPTH = 5000;

const LevelPresets = {
  einfach: { initialSpeed: 60, accelPerMinute: 4,  obsDelay: 5000, itemDelay: 10000, enemyDelay: 12000 },
  mittel:  { initialSpeed: 90, accelPerMinute: 7,  obsDelay: 4000, itemDelay: 8000, enemyDelay: 9000 },
  schnell: { initialSpeed: 140, accelPerMinute: 12, obsDelay: 3000, itemDelay: 6000, enemyDelay: 7000 }
};

const COLORS = { typed: '#0a7f3f', rest: '#083056', enemyRest: '#9b2c2c', itemRest: '#0b315a' };

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
    
    // Assets Pfade basierend auf ls -R
    this.load.image('barrel', 'assets/obstacles/barrel.png');
    this.load.image('ship', 'assets/environment/ship.png');
    this.load.image('big_thorns', 'assets/obstacles/big_thorns.png');
    this.load.image('small_thorn', 'assets/obstacles/small_thorn.png');
    this.load.image('skull', 'assets/environment/skull.png');
    this.load.image('crab', 'assets/environment/crab.png');
    
    this.load.image('coin', 'assets/items/coin.png');
    this.load.image('heart', 'assets/items/heart.png');
    this.load.image('chest', 'assets/items/chest.png');
    this.load.image('bomb', 'assets/items/bomb.png');
    this.load.image('compass', 'assets/items/compass.png');

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

    // Pirat Startposition 140
    this.player = this.physics.add.sprite(140, HEIGHT - GROUND_H - 100, 'parrot1').setScale(0.95).setDepth(PLAYER_DEPTH);
    this.player.setCollideWorldBounds(true);
    this.player.body.setGravityY(2500);
    this.physics.add.collider(this.player, physGround);

    this.pigeon = this.add.sprite(WIDTH/2, 100, 'pigeon1').setScale(0.5).setDepth(UI_DEPTH);

    this.anims.create({ key: 'run', frames: [{key:'parrot1'}, {key:'parrot2'}, {key:'parrot3'}], frameRate: 8, repeat: -1 });
    this.player.anims.play('run');

    const raw = this.cache.text.get('woerter') || 'pirat gold ahoi';
    this.state.words = raw.split(/\s+/).filter(w => w.length > 2);
    Phaser.Utils.Array.Shuffle(this.state.words);

    this.groups.obs = this.physics.add.group({ allowGravity: false });
    this.groups.items = this.physics.add.group({ allowGravity: false });
    this.groups.enemies = this.physics.add.group({ allowGravity: false });

    // Kollisionen
    this.physics.add.overlap(this.player, this.groups.obs, (_, o) => { if(!o.cleared) this.gameOver('An einem Hindernis hängengeblieben!'); });
    this.physics.add.overlap(this.player, this.groups.enemies, (_, e) => { if(!e.destroyed) this.gameOver('Von einem Gegner erwischt!'); });
    this.physics.add.overlap(this.player, this.groups.items, (_, i) => { if(i.ready) this.collectItem(i); });

    this.sounds.kling = this.sound.add('sfx_kling');
    this.sounds.jump = this.sound.add('sfx_jump');
    this.sounds.bgm = this.sound.add('bgm', { volume: 0.3, loop: true });
    this.sounds.bgm.play();

    this.ui.hud = this.add.text(20, 20, '', { fontSize: 24, color: '#083056', fontStyle: 'bold' }).setDepth(ACTIVE_WORD_DEPTH);
    this.input.keyboard.on('keydown', e => this.handleKey(e));

    // Spawner
    this.spawnObstacle();
    this.time.addEvent({ delay: this.level.obsDelay, loop: true, callback: () => this.spawnObstacle() });
    this.time.addEvent({ delay: this.level.itemDelay, loop: true, callback: () => this.spawnItem() });
    this.time.addEvent({ delay: this.level.enemyDelay, loop: true, callback: () => this.spawnEnemy() });

    this.setupLevelButtons();
  }

  update() {
    if (this.state.gameOver) return;

    this.state.worldSpeed += 0.01;
    this.clouds.tilePositionX += 0.2;
    this.sea.tilePositionX += (this.state.worldSpeed * 0.005);
    this.sea.y = (HEIGHT - GROUND_H - 150) + Math.sin(this.time.now / 1000) * 10;

    // RÜCKZUG-LOGIK: Pirat kehrt sanft auf x=140 zurück
    if (this.player.x > 140) {
        this.player.x -= 0.5; 
    } else if (this.player.x < 140) {
        this.player.x = 140;
    }

    const proc = (obj, type) => {
      if (!obj.active) return;
      obj.x -= (this.state.worldSpeed / 60);
      
      if (obj.ui) {
        this.updateWordUI(obj);
        obj.ui.cont.setDepth(obj === this.state.target ? ACTIVE_WORD_DEPTH : UI_DEPTH);
      }

      // Sprung auslösen
      if (obj.readyToJump && this.player.body.onFloor() && obj.x < this.player.x + 130 && obj.x > this.player.x) {
        this.player.setVelocityY(-980);
        this.player.x += 40; // Kurzer Satz nach vorne
        this.sounds.jump.play();
        obj.readyToJump = false;
        if(obj.body) obj.body.checkCollision.none = true; 
      }

      if (obj.x < -200) { if(obj.ui) obj.ui.cont.destroy(); obj.destroy(); }
    };

    this.groups.obs.getChildren().forEach(o => proc(o, 'obs'));
    this.groups.items.getChildren().forEach(i => proc(i, 'item'));
    this.groups.enemies.getChildren().forEach(e => proc(e, 'enemy'));

    if (!this.state.target) this.chooseTarget();

    if (this.state.target) {
      const tx = this.state.target.x - 120;
      const ty = this.state.target.y - 100 + Math.sin(this.time.now / 500) * 20;
      this.pigeon.x += (tx - this.pigeon.x) * 0.03; // Schön geschmeidig
      this.pigeon.y += (ty - this.pigeon.y) * 0.03;
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
    if (t.type === 'obs' || t.type === 'item') {
      t.readyToJump = true; 
      if (t.type === 'item') t.ready = true;
      this.state.score += 10;
    } else if (t.type === 'enemy') {
      this.confettiRain(t.x, t.y, [0x9b2c2c, 0xffffff]); // Rotes Konfetti für Gegner
      t.destroyed = true;
      this.state.score += 30;
      if(t.ui) t.ui.cont.destroy();
      t.destroy();
    }
    this.state.target = null;
    this.chooseTarget();
  }

  collectItem(it) {
    this.confettiRain(it.x, it.y, [0xffff00, 0xffffff, 0x00ff00, 0xffa500]); // Bunter Regen
    this.sounds.kling.play();
    this.state.score += 100;
    if(it.ui) it.ui.cont.destroy();
    it.destroy();
  }

  confettiRain(x, y, colorSet) {
    for (let i = 0; i < 25; i++) {
      const p = this.add.image(x, y, 'confetti').setDepth(ACTIVE_WORD_DEPTH);
      p.setTint(Phaser.Utils.Array.GetRandom(colorSet));
      this.physics.add.existing(p);
      p.body.setVelocity(Phaser.Math.Between(-250, 250), Phaser.Math.Between(-500, -150));
      p.body.setGravityY(800);
      p.body.setAngularVelocity(Phaser.Math.Between(100, 800));
      this.time.delayedCall(1500, () => p.destroy());
    }
  }

  spawnObstacle() {
    const list = [
        {k:'barrel', s:0.65}, {k:'ship', s:0.75}, 
        {k:'big_thorns', s:0.8}, {k:'small_thorn', s:0.85}
    ];
    const d = Phaser.Utils.Array.GetRandom(list);
    const o = this.add.sprite(WIDTH + 200, 0, d.k).setScale(d.s).setDepth(OBJ_DEPTH);
    this.physics.add.existing(o);
    o.y = HEIGHT - GROUND_H - (o.displayHeight / 2) + 2;
    o.type = 'obs'; o.cleared = false; o.word = this.state.words.shift() || 'pirat';
    this.groups.obs.add(o);
    this.createWordUI(o, '#9b2c2c');
    if(this.state.words.length < 5) this.state.words.push('gold','ahoi','schiff','insel','schatz','papagei','hüpfen');
  }

  spawnEnemy() {
    const list = [{k:'skull', a:true}, {k:'crab', a:false}];
    const d = Phaser.Utils.Array.GetRandom(list);
    const y = d.a ? HEIGHT - 220 : HEIGHT - GROUND_H - 30;
    const e = this.add.sprite(WIDTH + 200, y, d.k).setScale(0.9).setDepth(OBJ_DEPTH);
    this.physics.add.existing(e);
    if (!d.a) e.y = HEIGHT - GROUND_H - (e.displayHeight/2);
    e.type = 'enemy'; e.destroyed = false; e.word = this.state.words.shift() || 'gegner';
    this.groups.enemies.add(e);
    this.createWordUI(e, '#000000');
  }

  spawnItem() {
    const list = ['coin','heart','chest','bomb','compass'];
    const k = Phaser.Utils.Array.GetRandom(list);
    const i = this.add.sprite(WIDTH + 200, HEIGHT - 200, k).setScale(0.85).setDepth(OBJ_DEPTH);
    this.physics.add.existing(i);
    i.type = 'item'; i.ready = false; i.word = k === 'coin' ? 'gold' : k;
    this.groups.items.add(i);
    this.createWordUI(i, '#0b315a');
  }

  chooseTarget() {
    const pot = [...this.groups.obs.getChildren(), ...this.groups.items.getChildren(), ...this.groups.enemies.getChildren()]
      .filter(o => o.active && !o.cleared && !o.ready && !o.destroyed && o.x > 160)
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
