const sidebarContent = `
    <div class="sidebar-header">
        <h1>My Games</h1>
        <button class="menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false">☰</button>
    </div>
    <nav class="sidebar-nav" role="navigation">
        <a href="index.html" class="nav-link active" aria-label="Home">
            <span class="icon">🏠</span>
            <span>Home</span>
        </a>
        <a href="2048.html" class="nav-link" aria-label="Play 2048 game">
            <span class="icon">🎯</span>
            <span>2048</span>
        </a>
        <a href="flappy_bird.html" class="nav-link" aria-label="Play Flappy Bird game">
            <span class="icon">🐦</span>
            <span>Flappy Bird</span>
        </a>
        <a href="slot.html" class="nav-link" aria-label="Play Slot game">
            <span class="icon">🎰</span>
            <span>Slot</span>
        </a>
        <a href="snake.html" class="nav-link" aria-label="Play Snake game">
            <span class="icon">🐍</span>
            <span>Snake</span>
        </a>
        <a href="sudoku.html" class="nav-link" aria-label="Play Sudoku game">
            <span class="icon">🔢</span>
            <span>Sudoku</span>
        </a>
        <a href="hangman.html" class="nav-link" aria-label="Play Hangman game">
            <span class="icon">💬</span>
            <span>Hangman</span>
        </a>
        <a href="memory.html" class="nav-link" aria-label="Play Memory game">
            <span class="icon">🧠</span>
            <span>Memory</span>
        </a>
    </nav>
`;

document.addEventListener('DOMContentLoaded', function () {
    // Insert sidebar content
    document.querySelector('.sidebar').innerHTML = sidebarContent;

    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.querySelector('.menu-toggle');
    const body = document.body;

    // Mobile menu toggle
    menuToggle.addEventListener('click', function () {
        const isActive = sidebar.classList.toggle('active');
        menuToggle.setAttribute('aria-expanded', isActive);
        
        // Prevent body scroll when sidebar is open on mobile
        if (window.innerWidth <= 768) {
            body.classList.toggle('sidebar-open', isActive);
        }
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(event) {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('active') && 
            !sidebar.contains(event.target)) {
            sidebar.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
            body.classList.remove('sidebar-open');
        }
    });

    // Highlight current page in navigation
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const links = document.querySelectorAll('.nav-link');

    links.forEach(link => {
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
});