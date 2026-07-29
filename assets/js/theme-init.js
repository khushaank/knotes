try {
    const theme = localStorage.getItem('kn-theme') || 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
} catch {
    document.documentElement.dataset.theme = 'light';
}
