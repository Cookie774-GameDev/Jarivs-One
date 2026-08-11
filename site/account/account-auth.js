async function submitCredentials(event) {
  event.preventDefault();
  if (!vibeSupabase) return;
  const generation = ++authGeneration;
  const email = normalizedEmail();
  const emailError = validateEmail(email);
  setMessage(nodes.authError, '');
  setMessage(nodes.authInfo, '');
  if (emailError) { setMessage(nodes.authError, emailError); return; }
  if (authMode !== 'recovery') {
    const passwordError = validatePassword(nodes.passwordInput.value);
    if (passwordError) { setMessage(nodes.authError, passwordError); return; }
  }
  if (authMode === 'signup' && nodes.passwordInput.value !== nodes.confirmPasswordInput.value) {
    setMessage(nodes.authError, 'Passwords do not match.'); return;
  }
  setBusy([nodes.credentialsSubmit, nodes.emailCodeButton], true);
  try {
    if (authMode === 'recovery') {
      const { error } = await vibeSupabase.auth.resetPasswordForEmail(email);
      if (generation !== authGeneration) return;
      if (error) throw error;
      showCodePanel('recovery', email);
      setMessage(nodes.codeInfo, 'Recovery code sent. Check inbox and spam.');
      return;
    }
    if (authMode === 'signup') {
      const displayName = safeText(nodes.displayNameInput.value, 80);
      const password = nodes.passwordInput.value;
      const { data, error } = await vibeSupabase.auth.signUp({
        email,
        password,
        options: { data: displayName ? { display_name: displayName } : {}, emailRedirectTo: undefined },
      });
      nodes.passwordInput.value = '';
      nodes.confirmPasswordInput.value = '';
      if (generation !== authGeneration) { await cleanupUnexpectedSession(email); return; }
      if (error) throw error;
      if (data?.session?.user?.email?.trim().toLowerCase() === email) {
        setGlobalStatus('Account created. Loading your dashboard…'); return;
      }
      if (!data?.user?.id || !Array.isArray(data.user.identities) || data.user.identities.length === 0 || data.user.email?.trim().toLowerCase() !== email) {
        selectAuthMode('signin', { preserveEmail: true });
        setMessage(nodes.authError, 'Unable to complete sign-up. Try signing in or reset the password.');
        return;
      }
      showCodePanel('signup', email);
      setMessage(nodes.codeInfo, 'Verification code sent. Check inbox and spam.');
      return;
    }
    const password = nodes.passwordInput.value;
    nodes.passwordInput.value = '';
    const { data, error } = await vibeSupabase.auth.signInWithPassword({ email, password });
    if (generation !== authGeneration) { await cleanupUnexpectedSession(email); return; }
    if (error) throw error;
    if (data?.user?.email?.trim().toLowerCase() !== email) {
      await cleanupUnexpectedSession(email);
      throw new Error('Authentication could not be verified.');
    }
    setGlobalStatus('Signed in. Loading your dashboard…');
  } catch (error) {
    if (generation === authGeneration) setMessage(nodes.authError, friendlyAuthError(error, 'Sign-in could not be completed.'));
  } finally {
    if (generation === authGeneration) setBusy([nodes.credentialsSubmit, nodes.emailCodeButton], false);
  }
}

async function sendEmailCode() {
  if (!vibeSupabase) return;
  const email = normalizedEmail();
  const emailError = validateEmail(email);
  setMessage(nodes.authError, '');
  if (emailError) { setMessage(nodes.authError, emailError); nodes.emailInput.focus(); return; }
  setBusy([nodes.credentialsSubmit, nodes.emailCodeButton], true);
  try {
    const { error } = await vibeSupabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
    showCodePanel('email', email);
    setMessage(nodes.codeInfo, 'Sign-in code sent. Check inbox and spam.');
  } catch (error) {
    setMessage(nodes.authError, friendlyAuthError(error, 'A sign-in code could not be sent.'));
  } finally { setBusy([nodes.credentialsSubmit, nodes.emailCodeButton], false); }
}

async function submitCode(event) {
  event.preventDefault();
  if (!vibeSupabase || !pendingVerification) return;
  const generation = ++authGeneration;
  const token = nodes.otpInput.value.replace(/\D/gu, '').slice(0, 6);
  setMessage(nodes.codeError, ''); setMessage(nodes.codeInfo, '');
  if (token.length !== 6) { setMessage(nodes.codeError, 'Enter the complete 6-digit code.'); return; }
  setBusy([nodes.codeSubmit, nodes.resendCodeButton, nodes.codeBackButton], true);
  try {
    const expectedEmail = pendingVerification.email;
    const verificationType = pendingVerification.type;
    const { data, error } = await vibeSupabase.auth.verifyOtp({ email: expectedEmail, token, type: verificationType });
    nodes.otpInput.value = '';
    if (generation !== authGeneration) { await cleanupUnexpectedSession(expectedEmail); return; }
    if (error) throw error;
    if (data?.user?.email?.trim().toLowerCase() !== expectedEmail) {
      await cleanupUnexpectedSession(expectedEmail);
      throw new Error('Verification could not be confirmed.');
    }
    if (verificationType === 'recovery') {
      recoveryVerified = true; showAuthPanel('password'); queueMicrotask(() => nodes.newPasswordInput.focus()); return;
    }
    setGlobalStatus(verificationType === 'signup' ? 'Account verified. Loading your dashboard…' : 'Signed in. Loading your dashboard…');
  } catch (error) {
    if (generation === authGeneration) setMessage(nodes.codeError, friendlyAuthError(error, 'Verification failed. Check the code and try again.'));
  } finally {
    if (generation === authGeneration) setBusy([nodes.codeSubmit, nodes.resendCodeButton, nodes.codeBackButton], false);
  }
}

async function resendCode() {
  if (!vibeSupabase || !pendingVerification) return;
  setMessage(nodes.codeError, ''); setMessage(nodes.codeInfo, '');
  setBusy([nodes.codeSubmit, nodes.resendCodeButton, nodes.codeBackButton], true);
  try {
    let response;
    if (pendingVerification.type === 'signup') response = await vibeSupabase.auth.resend({ type: 'signup', email: pendingVerification.email });
    else if (pendingVerification.type === 'recovery') response = await vibeSupabase.auth.resetPasswordForEmail(pendingVerification.email);
    else response = await vibeSupabase.auth.signInWithOtp({ email: pendingVerification.email, options: { shouldCreateUser: false } });
    if (response.error) throw response.error;
    nodes.otpInput.value = '';
    setMessage(nodes.codeInfo, 'A new code was requested. Check inbox and spam before trying again.');
  } catch (error) {
    setMessage(nodes.codeError, friendlyAuthError(error, 'A new code could not be sent.'));
  } finally { setBusy([nodes.codeSubmit, nodes.resendCodeButton, nodes.codeBackButton], false); }
}

async function submitNewPassword(event) {
  event.preventDefault();
  if (!vibeSupabase || !recoveryVerified) return;
  const password = nodes.newPasswordInput.value;
  const confirmation = nodes.newPasswordConfirmInput.value;
  setMessage(nodes.newPasswordError, '');
  const passwordError = validatePassword(password);
  if (passwordError) { setMessage(nodes.newPasswordError, passwordError); return; }
  if (password !== confirmation) { setMessage(nodes.newPasswordError, 'Passwords do not match.'); return; }
  const button = nodes.newPasswordForm.querySelector('button[type="submit"]');
  setBusy([button, nodes.passwordBackButton], true);
  try {
    const { error } = await vibeSupabase.auth.updateUser({ password });
    if (error) throw error;
    await vibeSupabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
    clearSecretInputs(); recoveryVerified = false; pendingVerification = null;
    setGlobalStatus('Password updated. Loading your dashboard…');
  } catch (error) {
    setMessage(nodes.newPasswordError, friendlyAuthError(error, 'The password could not be updated. Request a new recovery code.'));
  } finally { setBusy([button, nodes.passwordBackButton], false); }
}

function selectDashboardRoute(route) {
  if (!routeCopy[route]) return;
  for (const button of nodes.dashboardNav) button.classList.toggle('active', button.dataset.dashboardRoute === route);
  for (const panel of nodes.dashboardPanels) {
    const active = panel.dataset.routePanel === route;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  }
  const copy = routeCopy[route];
  nodes.dashboardEyebrow.textContent = copy.eyebrow;
  nodes.dashboardTitle.textContent = copy.title;
  nodes.dashboardSubtitle.textContent = copy.subtitle;
  if (route === 'terminals') renderTerminalWorkspace();
}
