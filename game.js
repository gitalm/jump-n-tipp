const player = document.getElementById("player");
const obstacle = document.getElementById("obstacle");
const word = document.getElementById("word");
const input = document.getElementById("input");
const scoreElement = document.getElementById("score");

let words = [];
let currentWord = "";
let playerX = 50;
let obstacleX = 800;
let score = 0;
let gameActive = true;
let animationFrameId;

// Wörter aus der Textdatei laden
async function loadWords() {
    const response = await fetch('woerter.txt');
    const text = await response.text();
    words = text.split('\n').filter(word => word.trim() !== '');
    newWord();
}

// Neues Wort auswählen
function newWord() {
    currentWord = words[Math.floor(Math.random() * words.length)];
    word.textContent = currentWord;
    input.value = "";
}

// Spieler springen lassen
function jump() {
    player.src = "sprites/springend.png";
    setTimeout(() => {
        player.src = "sprites/laufend.png";
    }, 500);
}

// Spielerbewegung (Laufanimation)
function movePlayer() {
    playerX += 2;
    player.style.left = playerX + "px";
}

// Hindernisbewegung
function moveObstacle() {
    obstacleX -= 3;
    obstacle.style.left = obstacleX + "px";

    // Hindernis zurücksetzen, wenn es den Bildschirm verlassen hat
    if (obstacleX < 0) {
        obstacleX = 800;
        newWord();
    }

    // Kollision prüfen
    if (obstacleX < playerX + 50 && obstacleX + 30 > playerX && obstacle.style.bottom === "50px") {
        gameOver();
    }
}

// Spielende
function gameOver() {
    gameActive = false;
    cancelAnimationFrame(animationFrameId);
    word.textContent = "Game Over!";
    input.disabled = true;
}

// Punkte aktualisieren
function updateScore() {
    score++;
    scoreElement.textContent = "Punkte: " + score;
}

// Eingabe prüfen
input.addEventListener("input", (e) => {
    if (e.target.value === currentWord) {
        jump();
        updateScore();
        obstacleX = 800; // Hindernis zurücksetzen
        newWord();
        e.target.value = "";
    }
});

// Spielschleife
function gameLoop() {
    if (gameActive) {
        movePlayer();
        moveObstacle();
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// Start
loadWords();
gameLoop();
