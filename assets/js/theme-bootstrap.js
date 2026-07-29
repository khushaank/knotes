(function () {
    try {
        var preference = localStorage.getItem('kn-theme-preference') || 'system';
        var theme = preference === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : preference;
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
    } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();
