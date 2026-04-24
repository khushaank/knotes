import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminAuth();
    setupTabs();
    
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });
});

async function checkAdminAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        showLoginRequired();
        return;
    }
    
    currentUser = session.user;
    
    // Check if user is admin
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, username')
        .eq('id', currentUser.id)
        .single();
        
    if (error || !profile || !profile.is_admin) {
        showLoginRequired();
        return;
    }
    
    currentProfile = profile;
    document.getElementById('admin-name').textContent = `Logged in as Admin: ${profile.username || currentUser.email}`;
    
    // Show dashboard
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    
    // Load initial data
    loadUsers();
    loadPosts();
    loadComments();
}

function showLoginRequired() {
    window.location.href = 'login.html';
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            // Add active to clicked
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target).classList.remove('hidden');
        });
    });
}

// ---- Data Loading ---- //

async function loadUsers() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${error.message}</td></tr>`;
        return;
    }
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(user => `
        <tr>
            <td title="${user.id}">${user.id.substring(0, 8)}...</td>
            <td>${user.username || 'N/A'}</td>
            <td>
                <input type="checkbox" ${user.is_admin ? 'checked' : ''} 
                    onchange="window.adminActions.toggleAdmin('${user.id}', this.checked)"
                    ${user.id === currentUser.id ? 'disabled title="Cannot change own status"' : ''}>
            </td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn-danger btn-small" onclick="window.adminActions.deleteProfile('${user.id}')"
                    ${user.id === currentUser.id ? 'disabled' : ''}>Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadPosts() {
    const tbody = document.querySelector('#posts-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    
    const { data, error } = await supabase
        .from('blogs')
        .select('id, title, author, status, published_at, slug')
        .order('published_at', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${error.message}</td></tr>`;
        return;
    }
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No posts found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(post => `
        <tr>
            <td><a href="../../pulse/index.html?s=${post.slug}" target="_blank">${post.title.substring(0, 40)}${post.title.length > 40 ? '...' : ''}</a></td>
            <td>${post.author}</td>
            <td>${post.status}</td>
            <td>${new Date(post.published_at).toLocaleDateString()}</td>
            <td>
                <button class="btn-danger btn-small" onclick="window.adminActions.deletePost('${post.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function loadComments() {
    const tbody = document.querySelector('#comments-table tbody');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    
    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:red">Error: ${error.message}</td></tr>`;
        return;
    }
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No comments found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(comment => `
        <tr>
            <td>${comment.comment_text.substring(0, 50)}${comment.comment_text.length > 50 ? '...' : ''}</td>
            <td>${comment.user_name}</td>
            <td>${new Date(comment.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn-danger btn-small" onclick="window.adminActions.deleteComment('${comment.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// ---- Actions ---- //
window.adminActions = {
    async deletePost(id) {
        if (!confirm('Are you sure you want to delete this post?')) return;
        const { error } = await supabase.from('blogs').delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else loadPosts();
    },
    
    async deleteComment(id) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        const { error } = await supabase.from('comments').delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else loadComments();
    },
    
    async deleteProfile(id) {
        if (!confirm('Are you sure you want to delete this profile? Note: This deletes their profile data, but they may still be able to login via Supabase Auth.')) return;
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else loadUsers();
    },
    
    async toggleAdmin(id, isAdmin) {
        const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', id);
        if (error) {
            alert('Error: ' + error.message);
            loadUsers(); // reload to reset checkbox
        }
    }
};
