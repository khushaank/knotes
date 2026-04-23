import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('submit-form');
    const authMessage = document.getElementById('auth-message');
    
    if (!supabase) return;

    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        form.classList.add('hidden');
        authMessage.classList.remove('hidden');
    }

    let submitCategory = 'news';

    const btnSubmit = document.getElementById('btn-submit');
    const btnSubmitWork = document.getElementById('btn-submit-work');

    if (btnSubmitWork) {
        btnSubmitWork.addEventListener('click', () => {
            submitCategory = 'show';
            form.requestSubmit();
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!session) return;

        let title = document.getElementById('submit-title').value.trim();
        const url = document.getElementById('submit-url').value.trim();
        const text = document.getElementById('submit-text').value.trim();

        if (!title) return;

        // Determine category if not explicitly set by button
        let finalCategory = submitCategory;
        if (finalCategory === 'news' && !url) {
            finalCategory = 'ask';
        }

        // Prefix for Show HN
        if (finalCategory === 'show' && !title.toLowerCase().startsWith('show hn:')) {
            title = `Show HN: ${title}`;
        }

        const userEmail = session.user.email;
        const author = userEmail.split('@')[0];

        const { data, error } = await supabase
            .from('blogs')
            .insert([
                {
                    title,
                    url: url || null,
                    content: text || null,
                    author,
                    category: finalCategory,
                    status: 'published',
                    published_at: new Date().toISOString()
                }
            ])
            .select();

        if (error) {
            console.error('Error submitting:', error);
            alert('Failed to submit. Please try again.');
        } else {
            // Reset for next time
            submitCategory = 'news';
            
            // Redirect based on category
            if (finalCategory === 'show') {
                window.location.href = 'show.html';
            } else if (finalCategory === 'ask') {
                window.location.href = 'ask.html';
            } else {
                window.location.href = 'index.html';
            }
        }
    });
});
