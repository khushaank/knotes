import { supabase, getBookmarkedPosts, calculateTimeAgo } from './supabaseClient.js';

const DEFAULT_FOLDERS = ['To Learn', 'Inspiration', 'Archive', 'Reading List'];

function showLoginMessage(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded';
    wrapper.appendChild(document.createTextNode('Please '));

    const loginLink = document.createElement('a');
    loginLink.href = 'login';
    loginLink.className = 'underline font-bold';
    loginLink.textContent = 'login';
    wrapper.appendChild(loginLink);
    wrapper.appendChild(document.createTextNode(' to view your personal reading lists.'));

    container.replaceChildren(wrapper);
}

function renderEmptyMessage(text) {
    const div = document.createElement('div');
    div.className = 'text-gray-500 italic';
    div.textContent = text;
    return div;
}

function getSafeStoryHref(post) {
    if (post.url) {
        try {
            const parsed = new URL(post.url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return post.url;
        } catch {
        }
    }
    return `pulse/home?s=${encodeURIComponent(post.slug || '')}`;
}

function getSafeDomain(url) {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return '';
    }
}

function renderFolderOption(folder, activeFolder) {
    const option = document.createElement('option');
    option.value = folder;
    option.disabled = folder === activeFolder;
    option.textContent = folder;
    return option;
}

function renderFolderSection(folderName, posts) {
    const section = document.createElement('div');
    section.className = 'folder-section mb-6';

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 mb-2 opacity-80';

    const marker = document.createElement('span');
    marker.className = 'text-[10px] text-[#ff6600]';
    marker.textContent = '-';
    header.appendChild(marker);

    const title = document.createElement('h3');
    title.className = 'font-bold text-black text-xs uppercase tracking-widest';
    title.appendChild(document.createTextNode(`${folderName} `));

    const count = document.createElement('span');
    count.className = 'text-gray-400 font-normal ml-1';
    count.textContent = `(${posts.length})`;
    title.appendChild(count);

    header.appendChild(title);
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'space-y-1 ml-4';

    posts.forEach(post => {
        const item = document.createElement('div');
        item.className = 'flex flex-col mb-2';

        const row = document.createElement('div');
        row.className = 'flex items-baseline gap-1';

        const vote = document.createElement('div');
        vote.className = 'knotes-upvote-triangle scale-75 -ml-4 mr-1';
        row.appendChild(vote);

        const link = document.createElement('a');
        link.href = getSafeStoryHref(post);
        link.className = 'text-[14px] text-black hover:underline';
        link.textContent = post.title || 'Untitled';
        if (post.url) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
        row.appendChild(link);

        const domain = getSafeDomain(post.url);
        if (domain) {
            const domainSpan = document.createElement('span');
            domainSpan.className = 'text-[11px] text-gray-400';
            domainSpan.textContent = `(${domain})`;
            row.appendChild(domainSpan);
        }

        item.appendChild(row);

        const meta = document.createElement('div');
        meta.className = 'story-meta flex items-center gap-1 opacity-70 -mt-0.5';

        const metaText = document.createElement('span');
        metaText.className = 'text-[11px]';
        const points = post.likes_count > 0 ? `${post.likes_count} pts ` : '';
        metaText.appendChild(document.createTextNode(`${points}by ${post.author || 'anonymous'} ${calculateTimeAgo(post.published_at)} | `));

        const bookmarkContainer = document.createElement('span');
        bookmarkContainer.className = 'bookmark-container';

        const select = document.createElement('select');
        select.className = 'move-folder folder-picker';
        select.setAttribute('data-id', post.id);

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = '+';
        select.appendChild(placeholder);

        [...DEFAULT_FOLDERS, 'Uncategorized'].forEach(folder => {
            select.appendChild(renderFolderOption(folder, folderName));
        });

        const removeLink = document.createElement('a');
        removeLink.href = '#';
        removeLink.className = 'remove-bookmark hover:underline text-red-400';
        removeLink.setAttribute('data-id', post.id);
        removeLink.textContent = 'remove';

        bookmarkContainer.appendChild(select);
        bookmarkContainer.appendChild(document.createTextNode(' '));
        bookmarkContainer.appendChild(removeLink);
        metaText.appendChild(bookmarkContainer);
        meta.appendChild(metaText);
        item.appendChild(meta);

        list.appendChild(item);
    });

    section.appendChild(list);
    return section;
}

async function loadReadingLists() {
    const container = document.getElementById('lists-container');
    if (!container) return;

    if (!supabase) {
        showLoginMessage(container);
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        showLoginMessage(container);
        return;
    }

    const posts = await getBookmarkedPosts(session.user.id);
    const folderMapping = getFolderMapping(session.user.id);

    if (posts.length === 0) {
        container.replaceChildren(renderEmptyMessage("You haven't saved any stories yet."));
        return;
    }

    const organized = {};
    DEFAULT_FOLDERS.forEach(folder => {
        organized[folder] = [];
    });
    organized.Uncategorized = [];

    posts.forEach(post => {
        const folder = folderMapping[post.id] || 'Uncategorized';
        if (!organized[folder]) organized[folder] = [];
        organized[folder].push(post);
    });

    const activeFolders = Object.keys(organized).filter(folder => organized[folder].length > 0);
    if (activeFolders.length === 0) {
        container.replaceChildren(renderEmptyMessage('No stories found in your lists.'));
        return;
    }

    const fragment = document.createDocumentFragment();
    activeFolders.forEach(folderName => {
        fragment.appendChild(renderFolderSection(folderName, organized[folderName]));
    });
    container.replaceChildren(fragment);

    container.querySelectorAll('.move-folder').forEach(select => {
        select.addEventListener('change', e => {
            const storyId = e.target.getAttribute('data-id');
            const newFolder = e.target.value;
            moveStoryToFolder(session.user.id, storyId, newFolder);
            loadReadingLists();
        });
    });

    container.querySelectorAll('.remove-bookmark').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            const storyId = e.target.getAttribute('data-id');
            if (confirm('Are you sure you want to remove this story from your lists?')) {
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
    } catch {
        return {};
    }
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

(document.readyState === 'loading' ? document.addEventListener.bind(document, 'DOMContentLoaded') : callback => callback())(loadReadingLists);
