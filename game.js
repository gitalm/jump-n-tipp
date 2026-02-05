(() => {
  const WIDTH = 960;
  const HEIGHT = 540;

  // Tuning: Hier stellst du Tempo, Physik und Spawn-Intervalle ein.
  const Tuning = {
    // Welt-Tempo
    initialSpeed: 180,        // Startgeschwindigkeit der Welt (px/s)
    speedStep: 10,            // Erhöhung pro Schwierigkeitsstufe
    speedStepEvery: 30,       // alle N Clears wird erhöht

    // Spawns
    obstacleDelayMs: 2400,    // Abstand zwischen Hindernissen
    enemyStartDelayMs: 20000, // ab wann Gegnerinnen/Gegner erscheinen
    enemyDelayMs: 5200,       // Abstand zwischen Gegner-Spawns
    enemySpeedFactor: 1.02,   // Gegner minimal schneller als Welt

    // Physik
    gravityY: 2000,           // Schwerkraft
    jumpStrength: 720,        // Sprungkraft
    preJumpDistancePx: 36,    // Abstand vor Hindernis, wann gesprungen wird

    // Animation
    runFrameRate: 6,          // Lauf-Animation (fps)
    obstacleAnimFrameRate: 4, // Hindernis-Animation (fps)

    // Wortauswahl
    enemyPreferShortMaxLen: 6 // Gegner bevorzugen kurze Wörter (<= N Zeichen)
  };

  const GROUND_H = 56;

  // Spritesheet-Einstellungen (Pfad/Größen ggf. anpassen)
  const PLAYER_FRAME_W = 32;
  const PLAYER_FRAME_H = 32;
  const PLAYER_SCALE = 1.6;

  // Hindernis: 100×100 Sheet mit 2×2 Frames => 50×50 pro Frame
  const OBST_FRAME_W = 50;
  const OBST_FRAME_H = 50;
  const OBST_SCALE = 1.4;

  // Gegner bleiben als einfache Shapes (kannst du später auch als Sprite-Sheet hinterlegen)
  const ENEMY_SIZE = 44;

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
    }

    preload() {
      // Wortliste laden
      this.load.text('woerter', 'woerter.txt');

      // Spieler-Spritesheet
      this.load.spritesheet('player', 'sprites/player.png', {
        frameWidth: PLAYER_FRAME_W,
        frameHeight: PLAYER_FRAME_H
      });

      // Hindernis-Spritesheet
      this.load.spritesheet('obstacle', 'sprites/obstacle.png', {
        frameWidth: OBST_FRAME_W,
        frameHeight: OBST_FRAME_H
      });

      // Platzhalter-Textur für Gegner
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xF7768E);
      g.fillRoundedRect(0, 0, ENEMY_SIZE, ENEMY_SIZE, 8);
      g.generateTexture('enemy', ENEMY_SIZE, ENEMY_SIZE);
      g.clear();

      // Boden
      g.fillStyle(0x2e3440);
      g.fillRect(0, 0, WIDTH, GROUND_H);
      g.generateTexture('ground', WIDTH, GROUND_H);
      g.destroy();
    }

    create() {
      this.physics.world.gravity.y = Tuning.gravityY;

      // Wörter vorbereiten
      const raw = this.cache.text.get('woerter') || '';
      this.state.words = raw.split(/\r?\n/).map(w => w.trim()).filter(Boolean);
      if (this.state.words.length === 0) {
        this.state.words = ['und','ist','gehen','lernen','springen','Schule','früher','groß','künftig','Straße'];
      }
      Phaser.Utils.Array.Shuffle(this.state.words);

      // Boden
      const ground = this.add.image(WIDTH/2, HEIGHT - GROUND_H/2, 'ground');
      this.physics.add.existing(ground, true);
      this.ground = ground;

      // Spieler
      const playerY = HEIGHT - GROUND_H - (PLAYER_FRAME_H * PLAYER_SCALE) / 2;
      this.player = this.physics.add.sprite(140, playerY, 'player', 0);
      this.player.setScale(PLAYER_SCALE);
      this.player.setCollideWorldBounds(true);
      this.player.body.setSize(PLAYER_FRAME_W * 0.62, PLAYER_FRAME_H * 0.88);
      this.player.body.setOffset(PLAYER_FRAME_W * 0.19, PLAYER_FRAME_H * 0.06);
      this.player.body.setMaxVelocityY(1200);
      this.physics.add.collider(this.player, ground);

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

      // Spawner mit Tuning-Parametern
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

    // Spawner
    spawnObstacle() {
      const id = this.state.idCounter++;
      const x = WIDTH + 120;
      const hPix = OBST_FRAME_H * OBST_SCALE;
      const y = HEIGHT - GROUND_H - hPix / 2;

      const sprite = this.groups.obstacles.create(x, y, 'obstacle', 0);
      sprite.setScale(OBST_SCALE);
      sprite.setImmovable(true);
      sprite.body.setVelocityX(-this.state.worldSpeed);
      // schlanke Kollisionsbox, damit die Tentakel/Kopf etwas toleranter sind
      sprite.body.setSize(OBST_FRAME_W * OBST_SCALE * 0.8, OBST_FRAME_H * OBST_SCALE * 0.85);
      sprite.body.setOffset(OBST_FRAME_W * OBST_SCALE * 0.1, OBST_FRAME_H * OBST_SCALE * 0.1);

      sprite.cleared = false;
      sprite.type = 'obstacle';
      sprite.id = id;

      // Hindernis-Animation
      this.anims.create({
        key: 'obst_idle',
        frames: this.anims.generateFrameNumbers('obstacle', { start: 0, end: 3 }),
        frameRate: Tuning.obstacleAnimFrameRate,
        repeat: -1
      });
      sprite.anims.play('obst_idle', true);

      const word = this.nextWord();
      sprite.word = word;
      sprite.label = this.add.text(x, y - hPix / 2 - 20, word, {
        fontFamily: 'monospace', fontSize: 18, color: '#ECEFF4'
      }).setOrigin(0.5);

      if (!this.state.target) this.chooseTarget();
    }

    spawnEnemy() {
      const id = this.state.idCounter++;
      const x = WIDTH + 140;
      const groundY = HEIGHT - GROUND_H;
      const altitude = Phaser.Math.Between(0, 1)
        ? (groundY - ENEMY_SIZE/2)
        : (groundY - GROUND_H - 140);

      const sprite = this.groups.enemies.create(x, altitude, 'enemy');
      sprite.setImmovable(true);
      sprite.body.setVelocityX(-this.state.worldSpeed * Tuning.enemySpeedFactor);
      sprite.destroyed = false;
      sprite.type = 'enemy';
      sprite.id = id;

      const word = this.nextWord({ preferShort: true });
      sprite.word = word;
      sprite.label = this.add.text(x, altitude - ENEMY_SIZE/2 - 18, word, {
        fontFamily: 'monospace', fontSize: 18, color: '#FFE4E6'
      }).setOrigin(0.5);

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

    // Ziel wählen: nächstes aktives Objekt vor dem Player
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
      if (!key || key.length !== 1) return; // nur Zeichen

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
        target.setAlpha(0.8);
        target.body.checkCollision.none = true;
        // Sprung kurz vor dem Hindernis
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

    flashWord() {
      this.cameras.main.flash(80, 247, 118, 142, false);
    }

    update() {
      // Labels bewegen + Offscreen aufräumen
      this.groups.obstacles.getChildren().forEach(o => {
        if (!o.active) return;
        const hPix = OBST_FRAME_H * OBST_SCALE;
        if (o.label) { o.label.x = o.x; o.label.y = o.y - hPix / 2 - 20; }
        if (o.x < -100) { o.label && o.label.destroy(); o.destroy(); }
      });
      this.groups.enemies.getChildren().forEach(e => {
        if (!e.active) return;
        if (e.label) { e.label.x = e.x; e.label.y = e.y - ENEMY_SIZE/2 - 18; }
        if (e.x < -100) { e.label && e.label.destroy(); e.destroy(); }
      });

      // Auto-Sprung kurz vor dem markierten Hindernis
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

      // lokal speichern
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
    backgroundColor: '#1b1e24',
    render: { pixelArt: true, antialias: false },
    physics: { default: 'arcade', arcade: { gravity: { y: Tuning.gravityY }, debug: false } },
    scene: [GameScene]
  };

  new Phaser.Game(config);
})();
