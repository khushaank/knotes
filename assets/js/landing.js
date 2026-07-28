import { supabase } from './supabaseClient.js';
import { redirectApprovedMember } from './routeGuard.js';

await redirectApprovedMember();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }).catch(() => {});
}

const form = document.getElementById('membership-form');
const status = document.getElementById('request-status');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (form.elements.company.value) return;
  if (!supabase) {
    status.textContent = 'Requests are temporarily unavailable. Please email us instead.';
    return;
  }

  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Sending…';
  const { error } = await supabase.rpc('request_membership', {
    request_name: form.elements.name.value.trim(),
    request_email: form.elements.email.value.trim(),
    request_note: form.elements.note.value.trim()
  });

  status.textContent = error
    ? 'We could not send that request. Please wait and try again.'
    : 'Thank you. If there is a fit, we will contact you by email.';
  if (!error) form.reset();
  button.disabled = false;
});
