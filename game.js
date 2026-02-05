const player = document.getElementById("player");
const obstacle = document.getElementById("obstacle");
const word = document.getElementById("word");
const input = document.getElementById("input");

let words = [];
let currentWord = "";
let playerX = 50;
let obstacleX = 300;
let gameActive = true;

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

// Spielerbewegung
function movePlayer() {
    if (playerX < 750) playerX += 2;
    player.style.left = playerX + "px";
}

// Hindernisbewegung
function moveObstacle() {
    if (obstacleX > 0) obstacleX -= 2;
    else {
        obstacleX = 800;
        newWord();
    }
    obstacle.style.left = obstacleX + "px";
}

// Eingabe prüfen
input.addEventListener("input", (e) => {
    if (e.target.value === currentWord) {
        jump();
        playerX += 20; // Spieler springt vorwärts
        newWord();
    }
});

// Spielschleife
function gameLoop() {
    if (gameActive) {
        movePlayer();
        moveObstacle();
        requestAnimationFrame(gameLoop);
    }
}

// Start
loadWords();
gameLoop();
