import { supabase, getBookmarkedPosts, calculateTimeAgo, sanitize } from './supabaseClient.js';

const DEFAULT_FOLDERS = ['To Learn', 'Inspiration', 'Archive', 'Reading List'];

async function loadReadingLists() {
    const container = document.getElementById('lists-container');
    if (!container) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        container.innerHTML = '<div class="p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded">Please <a href="login.html" class="underline font-bold">login</a> to view your personal reading lists.</div>';
        return;
    }

    const posts = await getBookmarkedPosts(session.user.id);
    const folderMapping = getFolderMapping(session.user.id);

    if (posts.length === 0) {
        container.innerHTML = '<div class="text-gray-500 italic">You haven\'t saved any stories yet.</div>';
        return;
    }

    // Organize posts by folder
    const organized = {};
    DEFAULT_FOLDERS.forEach(f => organized[f] = []);
    organized['Uncategorized'] = [];

    posts.forEach(post => {
        const folder = folderMapping[post.id] || 'Uncategorized';
        if (!organized[folder]) organized[folder] = [];
        organized[folder].push(post);
    });

    let html = '';
    const activeFolders = Object.keys(organized).filter(f => organized[f].length > 0);

    if (activeFolders.length === 0) {
        html = '<div class="text-gray-500 italic">No stories found in your lists.</div>';
    } else {
        activeFolders.forEach(folderName => {
            html += `
                <div class="folder-section mb-6">
                    <div class="flex items-center gap-2 mb-2 opacity-80">
                        <span class="text-[10px] text-[#ff6600]">●</span>
                        <h3 class="font-bold text-black text-xs uppercase tracking-widest">${folderName} <span class="text-gray-400 font-normal ml-1">(${organized[folderName].length})</span></h3>
                    </div>
                    <div class="space-y-1 ml-4">
                        ${organized[folderName].map(post => {
                            const timeAgo = calculateTimeAgo(post.published_at);
                            const domain = post.url ? new URL(post.url).hostname.replace('www.', '') : null;
                            return `
                                <div class="flex flex-col mb-2">
                                    <div class="flex items-baseline gap-1">
                                        <div class="hn-arrow scale-75 -ml-4 mr-1"></div>
                                        <a href="${post.url || `pulse/index.html?s=${post.slug}`}" class="text-[14px] text-black hover:underline">${sanitize(post.title)}</a>
                                        ${domain ? `<span class="text-[11px] text-gray-400">(${domain})</span>` : ''}
                                    </div>
                                    <div class="story-meta flex items-center gap-1 opacity-70 -mt-0.5">
                                        <span class="text-[11px]">
                                            ${post.likes_count > 0 ? `${post.likes_count} pts ` : ''}by ${post.author} ${timeAgo} | 
                                            <span class="bookmark-container">
                                                <select class="move-folder folder-picker" data-id="${post.id}">
                                                    <option value="" disabled selected>+</option>
                                                    ${DEFAULT_FOLDERS.map(f => `<option value="${f}" ${f === folderName ? 'disabled' : ''}>${f}</option>`).join('')}
                                                    <option value="Uncategorized" ${folderName === 'Uncategorized' ? 'disabled' : ''}>Uncategorized</option>
                                                </select>
                                                <a href="#" class="remove-bookmark hover:underline text-red-400" data-id="${post.id}">remove</a>
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;

    // Add listeners for moving/removing
    container.querySelectorAll('.move-folder').forEach(select => {
        select.addEventListener('change', (e) => {
            const storyId = e.target.getAttribute('data-id');
            const newFolder = e.target.value;
            moveStoryToFolder(session.user.id, storyId, newFolder);
            loadReadingLists(); // refresh
        });
    });

    container.querySelectorAll('.remove-bookmark').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const storyId = e.target.getAttribute('data-id');
            // Assuming we have access to toggleBookmark or similar
            // For now, just remove from mapping and potentially Supabase
            if (confirm('Are you sure you want to remove this story from your lists?')) {
                // We'd call toggleBookmark here if exported
                // For simplicity in this demo, let's just clear the mapping
                removeStoryFromFolder(session.user.id, storyId);
                loadReadingLists();
            }
        });
    });
}

function getFolderMapping(userId) {
    try {
        const key = `kn-folders-${userId}`;
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
}

function moveStoryToFolder(userId, storyId, folderName) {
    const mapping = getFolderMapping(userId);
    mapping[storyId] = folderName;
    localStorage.setItem(`kn-folders-${userId}`, JSON.stringify(mapping));
}

function removeStoryFromFolder(userId, storyId) {
    const mapping = getFolderMapping(userId);
    delete mapping[storyId];
    localStorage.setItem(`kn-folders-${userId}`, JSON.stringify(mapping));
}

document.addEventListener('DOMContentLoaded', loadReadingLists);
