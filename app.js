document.addEventListener('DOMContentLoaded', function () {
  // Password show/hide — toggles which of the two static <svg> icons is
  // visible via a class, instead of swapping raw <path> strings in with
  // innerHTML (that approach can produce invalid markup in stricter parsers).
  var pwToggle = document.getElementById('pwToggle');
  var pw = document.getElementById('pw');
  if (pwToggle && pw) {
    var eyeOpenIcon = pwToggle.querySelector('.eye-open');
    var eyeOffIcon = pwToggle.querySelector('.eye-off');
    pwToggle.addEventListener('click', function () {
      var isHidden = pw.type === 'password';
      pw.type = isHidden ? 'text' : 'password';
      if (eyeOpenIcon) eyeOpenIcon.classList.toggle('icon-hidden', !isHidden);
      if (eyeOffIcon) eyeOffIcon.classList.toggle('icon-hidden', isHidden);
    });
  }

  // Autofocus first field
  var firstField = document.querySelector('.field input');
  if (firstField) firstField.focus();

  // Nudge the focused field into view when the on-screen keyboard opens,
  // without hiding or resizing anything else — the card just scrolls
  // normally like any other page.
  document.querySelectorAll('.field input').forEach(function (input) {
    input.addEventListener('focus', function () {
      var el = this;
      setTimeout(function () {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  });

  function showError(message) {
    var errorEl = document.getElementById('formError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  // Only swaps the button's text label (in .btn-label) so the icon svg
  // next to it survives the "Please wait…" state instead of being wiped
  // out by a textContent overwrite.
  function setSubmitting(form, isSubmitting) {
    var btn = form.querySelector('.submit-btn');
    if (!btn) return;
    var label = btn.querySelector('.btn-label');
    btn.disabled = isSubmitting;
    if (!label) return;
    if (isSubmitting) {
      btn.dataset.originalText = label.textContent;
      label.textContent = 'Please wait…';
    } else if (btn.dataset.originalText) {
      label.textContent = btn.dataset.originalText;
    }
  }

  // Sign in against the real backend (/auth/login), store the JWT, go to the dashboard.
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    var loginParams = new URLSearchParams(window.location.search);
    var loginSuccessEl = document.getElementById('formSuccess');
    if (loginSuccessEl) {
      if (loginParams.get('verified') === '1') {
        loginSuccessEl.textContent = 'Email verified — sign in to continue.';
        loginSuccessEl.style.display = 'block';
      } else if (loginParams.get('registered') === '1') {
        loginSuccessEl.textContent = 'Account created — sign in to continue.';
        loginSuccessEl.style.display = 'block';
      }
    }

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('pw').value;

      setSubmitting(loginForm, true);
      Zafar.postForm('/auth/login', { email: email, password: password })
        .then(function (data) {
          // Always remember the session — the "remember me" toggle was
          // dropped from the redesigned auth screens.
          Zafar.setToken(data.access_token, true);
          window.location.href = 'home.html';
        })
        .catch(function (err) {
          setSubmitting(loginForm, false);
          // Backend returns 403 "Email not verified..." until the code is
          // confirmed — send them to verify.html instead of just showing
          // an error they can't act on. resend=1 fetches a fresh code
          // since the one from registration may have already expired.
          if (err.message && /not verified/i.test(err.message)) {
            window.location.href = 'verify.html?email=' + encodeURIComponent(email) + '&resend=1';
            return;
          }
          showError(err.message === 'Failed to fetch'
            ? 'Could not reach the server. Check your connection.'
            : err.message);
        });
    });
  }

  // Register against the real backend (/auth/register), then send to login.
  var registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var fullNameField = document.getElementById('fullName');
      var fullName = fullNameField ? fullNameField.value.trim() : '';
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('pw').value;

      setSubmitting(registerForm, true);
      // full_name is sent alongside email/password for when the backend
      // adds a name column; unrecognized fields are ignored by FastAPI's
      // default pydantic models, so this is safe even before that lands.
      Zafar.postJSON('/auth/register', { email: email, password: password, full_name: fullName })
        .then(function () {
          // Account exists but isn't verified yet — send them straight to
          // the code entry step (the code was just emailed by /auth/register).
          window.location.href = 'verify.html?email=' + encodeURIComponent(email);
        })
        .catch(function (err) {
          setSubmitting(registerForm, false);
          showError(err.message === 'Failed to fetch'
            ? 'Could not reach the server. Check your connection.'
            : err.message);
        });
    });
  }
});
