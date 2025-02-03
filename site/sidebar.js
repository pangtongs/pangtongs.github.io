const sidebarContent = `
    <div class="sidebar-header">
        <h1>My Portal</h1>
        <button class="menu-toggle">☰</button>
    </div>
    <nav class="sidebar-nav">
        <a href="index.html" class="nav-link active">Home</a>

        <div class="nav-section">
            <h2 class="section-title">Games</h2>
            <div class="section-links">
                <a href="2048.html" class="nav-link">2048</a>
                <a href="flappy_bird.html" class="nav-link">Flappy Bird</a>
                <a href="slot.html" class="nav-link">Slot</a>
                <a href="snake.html" class="nav-link">Snake</a>
                <a href="sudoku.html" class="nav-link">Sudoku</a>
                <a href="hangman.html" class="nav-link">Hangman</a>
                <a href="memory.html" class="nav-link">Memory</a>
            </div>
        </div>

        <div class="nav-section">
            <h2 class="section-title">Tools</h2>
            <div class="section-links">
                <a href="camt053xml_to_csv.html" class="nav-link">XML to CSV Converter</a>
            </div>
        </div>
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