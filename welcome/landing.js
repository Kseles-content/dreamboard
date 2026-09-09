/* Только локальные визуальные элементы. Без трекеров и внешних запросов. */
document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelector('.board-demo').dataset.theme = button.dataset.themeChoice;
        document.querySelectorAll('[data-theme-choice]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    });
});
const motionButton = document.getElementById('motion-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function syncMotionPreference() {
    motionButton.hidden = reducedMotion.matches;
}
syncMotionPreference();
reducedMotion.addEventListener('change', syncMotionPreference);
motionButton.addEventListener('click', () => {
    const paused = document.querySelector('.breath-art').classList.toggle('paused');
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? 'Продолжить движение' : 'Приостановить движение';
});
