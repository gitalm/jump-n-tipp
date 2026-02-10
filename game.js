// Updated updateWordUI function
function updateWordUI(objects) {
    objects.forEach(object => {
        const dynamicDepth = calculateDynamicDepth(object.x);
        // existing code...
        object.depth = dynamicDepth;
    });
}

function calculateDynamicDepth(xPosition) {
    // Implement logic for depth calculation based on x position
    return Math.floor(xPosition / 10); // Sample depth calculation
}