/**
 * Ambient Background Animation
 * "Constellation Network" Effect
 */

const canvas = document.getElementById('ambient-bg');
if (!canvas) throw new Error("Missing #ambient-bg canvas");
const ctx = canvas.getContext('2d');

let particlesArray = [];

// Mouse Position (offscreen until first move so no stray lines)
const mouse = {
    x: -9999,
    y: -9999,
    radius: 200// Radius of interaction
};

window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX ?? event.x;
    mouse.y = event.clientY ?? event.y;
});
document.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
});

// Create Particle Class
class Particle {
    constructor(x, y, dx, dy, size, color) {
        this.x = x;
        this.y = y;
        this.dx = dx; // velocity x
        this.dy = dy; // velocity y
        this.size = size;
        this.color = color;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }

    update() {
        // Check Canvas Boundaries
        if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
        if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;

        // Interaction with Mouse
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouse.radius + this.size) {
            // Move away gently? Or just be highlighted? 
            // Let's just let them float for now, lines will do the work.
            // Maybe slightly larger?
            if (mouse.x < this.x && this.x < canvas.width - this.size * 10) this.x += 1;
            if (mouse.x > this.x && this.x > this.size * 10) this.x -= 1;
            if (mouse.y < this.y && this.y < canvas.height - this.size * 10) this.y += 1;
            if (mouse.y > this.y && this.y > this.size * 10) this.y -= 1;
        }

        // Move particle
        this.x += this.dx;
        this.y += this.dy;

        this.draw();
    }
}

// Initializer
function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    particlesArray = [];
    const numberOfParticles = (canvas.height * canvas.width) / 4000; // Increased density

    for (let i = 0; i < numberOfParticles; i++) {
        let size = (Math.random() * 2) + 1; // Random size 1-3px
        let x = (Math.random() * ((innerWidth - size * 2) - (size * 2)) + size * 2);
        let y = (Math.random() * ((innerHeight - size * 2) - (size * 2)) + size * 2);
        let dx = (Math.random() * 0.4) - 0.2; // Slow speed
        let dy = (Math.random() * 0.4) - 0.2;
        let color = 'rgba(255, 255, 255, 0.4)';

        particlesArray.push(new Particle(x, y, dx, dy, size, color));
    }
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    if (!particlesArray || particlesArray.length === 0) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
    }
    connect();
}

// Draw Lines Between Particles
function connect() {
    let opacityValue = 1;
    for (let a = 0; a < particlesArray.length; a++) {
        // Connect to other particles
        for (let b = a; b < particlesArray.length; b++) {
            let distance = ((particlesArray[a].x - particlesArray[b].x) * (particlesArray[a].x - particlesArray[b].x)) +
                ((particlesArray[a].y - particlesArray[b].y) * (particlesArray[a].y - particlesArray[b].y));

            if (distance < (canvas.width / 7) * (canvas.height / 7)) {
                opacityValue = 1 - (distance / 20000);
                if (opacityValue > 0) {
                    ctx.strokeStyle = 'rgba(140, 85, 255,' + opacityValue * 0.15 + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                    ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                    ctx.stroke();
                }
            }
        }

        // Connect to Mouse
        let mouseDistance = ((particlesArray[a].x - mouse.x) * (particlesArray[a].x - mouse.x)) +
            ((particlesArray[a].y - mouse.y) * (particlesArray[a].y - mouse.y));

        if (mouseDistance < 20000) { // approx 140px radius squared
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
        }
    }
}

// Resize Handling
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
});

// Run
init();
animate();
