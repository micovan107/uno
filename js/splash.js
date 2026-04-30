document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');

    if (sessionStorage.getItem('splashSeen')) {
        splashScreen.classList.add('hidden');
        return;
    }

    setTimeout(() => {
        splashScreen.classList.add('flow-effect');
    }, 1500);

    setTimeout(() => {
        splashScreen.classList.add('dissolve-effect');
    }, 2500);

    setTimeout(() => {
        splashScreen.classList.add('hidden');
        sessionStorage.setItem('splashSeen', 'true');
    }, 3500);
});