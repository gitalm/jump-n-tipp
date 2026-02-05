const player = document.getElementById("player");
const obstacle = document.getElementById("obstacle");
const word = document.getElementById("word");
const input = document.getElementById("input");

const words = ["Springen", "Laufen", "Tippen", "Hindernis", "Schnell"];
let currentWord = "";
let playerX = 50;
let obstacleX = 300;
let gameActive = true;

// Wort auswählen und anzeigen
function newWord() {
    currentWord = words[Math.floor(Math.random() * words.length)];
    word.textContent = currentWord;
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
        e.target.value = "";
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
newWord();
gameLoop();
