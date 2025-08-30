// public/games.js

function initializeMatrixAnimation() {
    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }
    const ctx = canvas.getContext('2d');

    const container = document.querySelector('.games-background');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;

    // Znaki, które będą się pojawiać
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789αβγδεζηθικλμνξοπρστυφχψω√∫∑≈≠≤≥∛∜∞";
    const charArray = chars.split('');
    const fontSize = 16;
    const columns = Math.ceil(canvas.width / fontSize);

    // Tablica do śledzenia pozycji Y dla każdej kolumny
    const drops = [];
    for (let x = 0; x < columns; x++) {
        drops[x] = Math.floor(Math.random() * canvas.height);
    }

    function draw() {
        // Półprzezroczyste czarne tło, aby tworzyć efekt zanikania
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#0f0'; // Kolor znaków
        ctx.font = fontSize + 'px monospace';

        for (let i = 0; i < drops.length; i++) {
            const text = charArray[Math.floor(Math.random() * charArray.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            // Resetowanie kropli, gdy dotrze do dna, z losowością
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }

    // Pętla animacji
    const animationInterval = setInterval(draw, 40);

    // Zatrzymywanie animacji, gdy użytkownik opuszcza widok
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const gamesContent = document.querySelector('.games-content');
                if (!gamesContent && animationInterval) {
                    clearInterval(animationInterval);
                    observer.disconnect();
                }
            }
        }
    });
    observer.observe(document.getElementById('main-content'), { childList: true });

    // Dopasowanie canvasa przy zmianie rozmiaru okna
    window.addEventListener('resize', () => {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        // Re-inicjalizacja kolumn, aby pasowały do nowego rozmiaru
        const newColumns = Math.ceil(canvas.width / fontSize);
        drops.length = 0; // Wyczyść starą tablicę
        for (let x = 0; x < newColumns; x++) {
            drops[x] = Math.floor(Math.random() * canvas.height);
        }
    });
}