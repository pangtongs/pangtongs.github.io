const sidebarContent = `
    <div class="sidebar-header">
        <h1>My Games</h1>
        <button class="menu-toggle">☰</button>
    </div>
    <nav class="sidebar-nav">
        <a href="index.html" class="nav-link active">Home</a>

        <a href="2048.html" class="nav-link">2048</a>
        <a href="flappy_bird.html" class="nav-link">Flappy Bird</a>
        <a href="slot.html" class="nav-link">Slot</a>
        <a href="snake.html" class="nav-link">Snake</a>
        <a href="sudoku.html" class="nav-link">Sudoku</a>
    </nav>
`;

document.addEventListener('DOMContentLoaded', function () {
    // Insert sidebar content
    document.querySelector('.sidebar').innerHTML = sidebarContent;

    // Mobile menu toggle
    document.querySelector('.menu-toggle').addEventListener('click', function () {
        document.querySelector('.sidebar').classList.toggle('active');
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