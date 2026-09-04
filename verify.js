document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(window.location.search);
  var email = params.get('email') || '';
  if (!email) {
    window.location.href = 'register.html';
    return;
  }

  var emailEl = document.getElementById('verifyEmail');
  if (emailEl) emailEl.textContent = email;

  var form = document.getElementById('verifyForm');
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.otp-box'));
  var errorEl = document.getElementById('formError');
  var successEl = document.getElementById('formSuccess');
  var resendBtn = document.getElementById('resendBtn');
  var resendTimer = null;

  function showError(message) {
    if (successEl) successEl.style.display = 'none';
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  function showSuccess(message) {
    if (errorEl) errorEl.style.display = 'none';
    if (!successEl) return;
    successEl.textContent = message;
    successEl.style.display = 'block';
  }
  function clearMessages() {
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';
  }
  function friendlyError(err) {
    return err.message === 'Failed to fetch'
      ? 'Could not reach the server. Check your connection.'
      : err.message;
  }
  function currentCode() {
    return boxes.map(function (b) { return b.value; }).join('');
  }

  function setSubmitting(isSubmitting) {
    var btn = form.querySelector('.submit-btn');
    if (!btn) return;
    var label = btn.querySelector('.btn-label');
    btn.disabled = isSubmitting;
    if (!label) return;
    if (isSubmitting) {
      btn.dataset.originalText = label.textContent;
      label.textContent = 'Verifying…';
    } else if (btn.dataset.originalText) {
      label.textContent = btn.dataset.originalText;
    }
  }

  function submitCode() {
    var code = currentCode();
    if (code.length !== 6) {
      showError('Enter all 6 digits.');
      return;
    }
    clearMessages();
    setSubmitting(true);
    Zafar.postJSON('/auth/verify', { email: email, code: code })
      .then(function () {
        window.location.href = 'login.html?verified=1';
      })
      .catch(function (err) {
        setSubmitting(false);
        boxes.forEach(function (b) { b.value = ''; b.classList.remove('filled'); });
        boxes[0].focus();
        showError(friendlyError(err));
      });
  }

  // ---- OTP boxes: digits only, auto-advance on entry, backspace steps
  // back into the previous box, and pasting the whole code anywhere
  // splits it across all six boxes. ----
  boxes.forEach(function (box, i) {
    box.addEventListener('input', function () {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      box.classList.toggle('filled', box.value !== '');
      if (box.value && i < boxes.length - 1) {
        boxes[i + 1].focus();
      }
      if (currentCode().length === 6) submitCode();
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus();
      }
    });
    box.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      if (!text) return;
      e.preventDefault();
      text.slice(0, 6).split('').forEach(function (digit, idx) {
        if (boxes[idx]) {
          boxes[idx].value = digit;
          boxes[idx].classList.add('filled');
        }
      });
      var next = boxes[Math.min(text.length, 5)];
      if (next) next.focus();
      if (currentCode().length === 6) submitCode();
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitCode();
  });

  boxes[0].focus();

  // ---- Resend, with a 30s cooldown so it can't be hammered ----
  function startCooldown(seconds) {
    var remaining = seconds;
    resendBtn.disabled = true;
    resendBtn.textContent = 'Resend code (' + remaining + 's)';
    resendTimer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend code';
      } else {
        resendBtn.textContent = 'Resend code (' + remaining + 's)';
      }
    }, 1000);
  }

  function sendResend(silent) {
    if (resendBtn) resendBtn.disabled = true;
    Zafar.postJSON('/auth/resend', { email: email })
      .then(function () {
        if (!silent) showSuccess('New code sent — check your Gmail.');
        startCooldown(30);
      })
      .catch(function (err) {
        if (resendBtn) resendBtn.disabled = false;
        showError(friendlyError(err));
      });
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', function () { sendResend(false); });
  }

  // Arriving here because /auth/login said the account isn't verified —
  // the original registration code may have already expired, so send a
  // fresh one right away instead of making them dig up an old email.
  if (params.get('resend') === '1') {
    sendResend(true);
  }
});
