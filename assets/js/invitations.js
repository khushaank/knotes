import { supabase } from './supabaseClient.js';

const codeForm = document.getElementById('code-form');
const accountForm = document.getElementById('account-form');
const codeStatus = document.getElementById('code-status');
const accountStatus = document.getElementById('account-status');
let invitationClaim = '';

const codeFromUrl = new URLSearchParams(location.search).get('code');
if (codeFromUrl) document.getElementById('invitation-code').value = codeFromUrl.trim().toUpperCase();

function setBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

codeForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!codeForm.reportValidity()) return;
  if (!supabase) {
    codeStatus.textContent = 'Invitations are temporarily unavailable. Please try again shortly.';
    return;
  }

  setBusy(codeForm, true);
  codeStatus.textContent = 'Verifying securely…';
  const { data, error } = await supabase.rpc('begin_invitation', {
    invitation_code: codeForm.elements.code.value.trim()
  });

  if (error || !data) {
    codeStatus.textContent = 'That invitation is invalid, expired, or has already been used.';
    setBusy(codeForm, false);
    return;
  }

  invitationClaim = data;
  codeForm.reset();
  codeForm.hidden = true;
  accountForm.hidden = false;
  document.getElementById('step-number').textContent = '2';
  document.getElementById('invitation-name').focus();
});

accountForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!accountForm.reportValidity() || !invitationClaim) return;

  const { name, email, password, confirm } = accountForm.elements;
  if (password.value !== confirm.value) {
    accountStatus.textContent = 'The passwords do not match.';
    confirm.focus();
    return;
  }

  setBusy(accountForm, true);
  accountStatus.textContent = 'Creating your private account…';
  const { data, error } = await supabase.auth.signUp({
    email: email.value.trim(),
    password: password.value,
    options: {
      data: {
        display_name: name.value.trim(),
        invite_claim: invitationClaim
      },
      emailRedirectTo: `${location.origin}/login`
    }
  });

  if (error) {
    accountStatus.textContent = 'The account could not be created. Check that you used the invited email address.';
    setBusy(accountForm, false);
    return;
  }

  invitationClaim = '';
  if (data.session) {
    location.replace('/home');
    return;
  }

  accountForm.reset();
  accountStatus.textContent = 'Account created. Confirm your email, then sign in.';
  setBusy(accountForm, false);
});

if (supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    codeStatus.textContent = 'You are already signed in. Sign out before creating another account.';
    setBusy(codeForm, true);
  }
}
