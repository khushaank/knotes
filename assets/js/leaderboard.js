import { supabase, getLeaderboard, sanitize, toggleFollow } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('leaderboard-container');
    if (!container || !supabase) return;

    try {
        const leaders = await getLeaderboard(20);

        if (!leaders || leaders.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No users found yet. Be the first to join!</div>';
            return;
        }

        let html = '';
        const avatarColors = ['#fecaca', '#bfdbfe', '#bbf7d0', '#fef08a', '#e9d5ff', '#fbcfe8'];

        leaders.forEach((user, index) => {
            const rank = index + 1;
            let rankClass = '';
            if (rank === 1) rankClass = 'gold';
            else if (rank === 2) rankClass = 'silver';
            else if (rank === 3) rankClass = 'bronze';

            const initial = (user.username || '?').charAt(0).toUpperCase();
            const bgColor = avatarColors[(user.username || '').charCodeAt(0) % avatarColors.length];
            const joined = new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

            const avatarHtml = user.avatar_url
                ? `<div class="leader-avatar" style="background:${bgColor}"><img src="${user.avatar_url}" alt="${sanitize(user.username)}" onerror="this.parentElement.textContent='${initial}'"></div>`
                : `<div class="leader-avatar" style="background:${bgColor}">${initial}</div>`;

            html += `
                <div class="leader-row items-center">
                    <span class="leader-rank ${rankClass}">${rank}.</span>
                    ${avatarHtml}
                    <div class="leader-info">
                        <a href="profile.html?user=${encodeURIComponent(user.username)}" class="leader-name block">${sanitize(user.username)}</a>
                        <div class="text-[10px] text-gray-500 flex gap-2 mt-0.5">
                            <span title="Total views on their posts" class="flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:14px;">visibility</span> ${user.views || 0} views</span>
                            <span title="Number of posts they saved" class="flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:14px;">star</span> ${user.saved || 0} saved</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="leader-karma">
                            <span class="karma-count">${user.followers}</span>
                            <span class="leader-karma-label">karma</span>
                        </div>
                        <button class="boost-karma-btn text-gray-500 hover:text-[#ff6600] text-[10px] focus:outline-none" title="Increase karma" data-userid="${user.id}">[increase karma]</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Setup boost buttons
        container.querySelectorAll('.boost-karma-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const userId = btn.getAttribute('data-userid');
                btn.disabled = true;
                btn.style.opacity = '0.5';
                
                const result = await toggleFollow(userId);
                
                if (result.error) {
                    alert(result.error);
                    btn.disabled = false;
                    btn.style.opacity = '1';
                } else {
                    // Update count in UI visually
                    const karmaEl = btn.closest('.leader-row').querySelector('.karma-count');
                    let currentKarma = parseInt(karmaEl.textContent);
                    if (result.action === 'followed') {
                        karmaEl.textContent = currentKarma + 1;
                        btn.classList.replace('text-gray-500', 'text-[#ff6600]');
                        btn.title = "Decrease karma";
                        btn.textContent = "[decrease karma]";
                    } else {
                        karmaEl.textContent = Math.max(0, currentKarma - 1);
                        btn.classList.replace('text-[#ff6600]', 'text-gray-500');
                        btn.title = "Increase karma";
                        btn.textContent = "[increase karma]";
                    }
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            });
        });
    } catch (err) {
        container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">Could not load leaderboard. Please try again later.</div>';
    }
});
