/* ============================================================
   Zafar — authentication screen
   One module drives login.html, register.html and verify.html: the markup
   is built here so the three pages can't drift apart (the previous version
   was the same 838 lines copied three times).

   Backend endpoints used:
     POST /auth/register  {email, password, name}
     POST /auth/login     form: email, password   -> {access_token}
     POST /auth/verify    {email, code}
     POST /auth/resend    {email}
   ============================================================ */

var ZafarAuth = (function () {
  /* ---------------- translations ---------------- */
  var T = {
    en: {
      langName: "English",
      headline: "Acquire knowledge.",
      subtitle: "Access 12+ years of MSCE &amp; JCE past papers, keys and notes.",
      signin: "Sign in", create: "Create account",
      nameLabel: "Full name", namePh: "e.g. Chikondi Banda",
      emailLabel: "Email address", emailPh: "e.g. name@gmail.com",
      passLabel: "Password", passPhSignin: "Enter your password", passPhCreate: "At least 6 characters",
      confirmLabel: "Confirm password", confirmPh: "Re-enter your password",
      show: "Show", hide: "Hide",
      stay: "Stay signed in", forgot: "Forgot password?",
      continueBtn: "Continue", createBtn: "Create account",
      signingIn: "Signing in…", creatingAccount: "Creating account…",
      switchCreate: 'New to ZAFAR? <button type="button" class="link-btn" data-goto="create">Create an account</button>',
      switchSignin: 'Already have an account? <button type="button" class="link-btn" data-goto="signin">Sign in</button>',
      footer: "12+ years archived&nbsp;&nbsp;•&nbsp;&nbsp;Daily downloads",
      errName: "Enter your full name.", errEmail: "Enter a valid email address.",
      errPassword: "At least 6 characters.", errConfirm: "Passwords don't match.",
      verifiedBanner: "Email verified — sign in to continue.",
      registeredBanner: "Account created — sign in to continue.",

      forgotTitle: "Reset your password",
      forgotSubtitle: "Enter the email linked to your account. We'll send a verification code.",
      sendCode: "Send code", sendingCode: "Sending code…",
      rememberLine: 'Remembered your password? <button type="button" class="link-btn" data-back="auth">Sign in</button>',
      errForgotEmail: "Enter a valid email address.",
      forgotNotAvailable: "Password reset isn't available yet. Please contact support.",

      verifyTitle: "Check your email",
      verifySubtitle: "We sent a 6-digit code to",
      verifyBtn: "Verify code", verifying: "Verifying…",
      errCode: "Enter the 6-digit code.",
      resendPrefix: "Didn't get it?", resendLink: "Resend code",
      resendWait: function (s) { return "Resend in " + s + "s"; },
      resendSent: "New code sent — check your Gmail.",

      resetTitle: "Create new password",
      resetSubtitle: "Choose a new password for your account.",
      resetCodeLabel: "6-digit code", errResetCode: "Enter the 6-digit code from your email.",
      newPasswordLabel: "New password", confirmNewLabel: "Confirm new password",
      resetBtn: "Reset password", resetting: "Updating…",
      errNewPassword: "At least 6 characters.", errConfirmNew: "Passwords don't match.",

      successTitle: "Password updated",
      successSubtitle: "You can now sign in with your new password.",
      backToSignin: "Back to sign in",

      offline: "Could not reach the server. Check your connection.",
    },
  };

  var mode = "signin";
  var lang = "en";
  var resendTimer = null;
  var resendSeconds = 30;
  var currentEmail = "";

  var el = function (id) { return document.getElementById(id); };

  /* ---------------- markup ---------------- */
  function screenHTML() {
    return (
      '<div class="screen">' +
        '<div class="auth-hero">' +
          '<img id="heroImg" src="assets/img/hero.jpg" alt="A student reading in the school library">' +
          '<a class="auth-brand" href="login.html">' +
            '<span class="mark">' +
              '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M12 5C10.2 3.6 7.6 3 5 3v13c2.6 0 5.2.6 7 2 1.8-1.4 4.4-2 7-2V3c-2.6 0-5.2.6-7 2Z"/><path d="M12 5v13"/></svg>' +
            "</span>" +
            '<span class="name">ZAFAR</span>' +
          "</a>" +
          '<div class="hero-copy"><h1 id="txt-headline"></h1><p id="txt-subtitle"></p>' +
            '<div class="hero-stats">' +
              '<span class="stat-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg><span>12+ years archived</span></span>' +
              '<span class="stat-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/></svg><span>MSCE &amp; JCE</span></span>' +
              '<span class="stat-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg><span>Free to use</span></span>' +
            '</div>' +
          '</div>' +
        "</div>" +

        '<div class="sheet">' +

          /* ---------- auth ---------- */
          '<div class="panel" id="panel-auth">' +
            '<div class="banner" id="authBanner"></div>' +
            '<div class="segment" role="tablist">' +
              '<span class="segment-thumb" data-segment-thumb></span>' +
              '<button type="button" role="tab" aria-selected="true" class="tab active" data-tab="signin" id="tab-signin"></button>' +
              '<button type="button" role="tab" aria-selected="false" class="tab" data-tab="create" id="tab-create"></button>' +
            "</div>" +
            '<form class="auth-form" id="authForm" novalidate>' +
              '<div class="field" id="field-name" hidden>' +
                '<label for="fullName" id="lbl-name"></label>' +
                '<input type="text" id="fullName" autocomplete="name">' +
                '<div class="error-msg" id="err-name"></div>' +
              "</div>" +
              '<div class="field" id="field-email">' +
                '<label for="email" id="lbl-email"></label>' +
                '<input type="email" id="email" autocomplete="email" inputmode="email">' +
                '<div class="error-msg" id="err-email"></div>' +
              "</div>" +
              '<div class="field" id="field-password">' +
                '<label for="password" id="lbl-password"></label>' +
                '<div class="input-wrap">' +
                  '<input type="password" id="password" autocomplete="current-password" minlength="6">' +
                  '<button type="button" class="toggle-show" data-target="password"></button>' +
                "</div>" +
                '<div class="strength-wrap" id="strengthWrap" hidden>' +
                  '<div class="strength" id="strengthMeter" data-score="0"><i></i><i></i><i></i></div>' +
                  '<div class="strength-label" id="strengthLabel"></div>' +
                '</div>' +
                '<div class="error-msg" id="err-password"></div>' +
              "</div>" +
              '<div class="field" id="field-confirm" hidden>' +
                '<label for="confirmPassword" id="lbl-confirm"></label>' +
                '<div class="input-wrap">' +
                  '<input type="password" id="confirmPassword" autocomplete="new-password">' +
                  '<button type="button" class="toggle-show" data-target="confirmPassword"></button>' +
                "</div>" +
                '<div class="error-msg" id="err-confirm"></div>' +
              "</div>" +
              '<div class="options-row">' +
                '<label class="stay-signed"><input type="checkbox" id="staySignedIn" checked>' +
                '<span id="txt-stay"></span></label>' +
                '<button type="button" class="link-btn" id="forgotLink"></button>' +
              "</div>" +
              '<button type="submit" class="submit" id="submitBtn">' +
                '<span class="spinner"></span><span class="submit-label"></span>' +
              "</button>" +
              '<div class="switch-line" id="switchLine"></div>' +
            "</form>" +
          "</div>" +

          /* ---------- forgot ---------- */
          '<div class="panel" id="panel-forgot" hidden>' +
            panelHead("auth", "txt-forgotTitle", "txt-forgotSubtitle") +
            '<form class="auth-form" id="forgotForm" novalidate>' +
              '<div class="field" id="field-forgot-email">' +
                '<label for="forgotEmail" id="lbl-forgot-email"></label>' +
                '<input type="email" id="forgotEmail" autocomplete="email" inputmode="email">' +
                '<div class="error-msg" id="err-forgot-email"></div>' +
              "</div>" +
              '<div class="banner error" id="forgotBanner"></div>' +
              '<button type="submit" class="submit" id="forgotBtn">' +
                '<span class="spinner"></span><span class="submit-label" id="txt-sendCode"></span>' +
              "</button>" +
              '<div class="switch-line" id="rememberLine"></div>' +
            "</form>" +
          "</div>" +

          /* ---------- verify ---------- */
          '<div class="panel" id="panel-verify" hidden>' +
            '<div class="panel-head">' +
              backBtn("register") +
              '<div class="panel-head-text"><h2 id="txt-verifyTitle"></h2>' +
              '<p><span id="txt-verifySubtitle"></span> <strong id="verify-email-target"></strong></p></div>' +
            "</div>" +
            '<form class="auth-form" id="verifyForm" novalidate>' +
              '<div class="otp-row" id="otpRow">' +
                [0, 1, 2, 3, 4, 5].map(function (i) {
                  return '<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1"' +
                    (i === 0 ? ' autocomplete="one-time-code"' : "") +
                    ' aria-label="Digit ' + (i + 1) + '" data-otp="' + i + '">';
                }).join("") +
              "</div>" +
              '<div class="error-msg" id="err-code" style="text-align:center"></div>' +
              '<div class="banner error" id="verifyBanner"></div>' +
              '<button type="submit" class="submit" id="verifyBtn" style="margin-top:6px">' +
                '<span class="spinner"></span><span class="submit-label" id="txt-verifyBtn"></span>' +
              "</button>" +
              '<div class="resend-row"><span id="txt-resendPrefix"></span> ' +
              '<button type="button" class="link-btn" id="resendLink"></button></div>' +
            "</form>" +
          "</div>" +

          /* ---------- reset ---------- */
          '<div class="panel" id="panel-reset" hidden>' +
            panelHead("forgot", "txt-resetTitle", "txt-resetSubtitle") +
            '<form class="auth-form" id="resetForm" novalidate>' +
              '<div class="field" id="field-reset-code">' +
                '<label for="resetCode" id="lbl-resetCode"></label>' +
                '<input type="text" id="resetCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code">' +
                '<div class="error-msg" id="err-resetCode"></div>' +
              "</div>" +
              '<div class="field" id="field-new-password">' +
                '<label for="newPassword" id="lbl-newPassword"></label>' +
                '<div class="input-wrap"><input type="password" id="newPassword">' +
                '<button type="button" class="toggle-show" data-target="newPassword"></button></div>' +
                '<div class="error-msg" id="err-newPassword"></div>' +
              "</div>" +
              '<div class="field" id="field-confirm-new">' +
                '<label for="confirmNewPassword" id="lbl-confirmNew"></label>' +
                '<div class="input-wrap"><input type="password" id="confirmNewPassword">' +
                '<button type="button" class="toggle-show" data-target="confirmNewPassword"></button></div>' +
                '<div class="error-msg" id="err-confirmNew"></div>' +
              "</div>" +
              '<div class="banner error" id="resetBanner"></div>' +
              '<button type="submit" class="submit" id="resetBtn">' +
                '<span class="spinner"></span><span class="submit-label" id="txt-resetBtn"></span>' +
              "</button>" +
            "</form>" +
          "</div>" +

          /* ---------- success ---------- */
          '<div class="panel" id="panel-success" hidden>' +
            '<div class="success-wrap">' +
              '<div class="success-icon">' +
                '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' +
              "</div>" +
              '<h2 id="txt-successTitle"></h2><p id="txt-successSubtitle"></p>' +
              '<button type="button" class="submit" id="backToSigninBtn">' +
              '<span class="submit-label" id="txt-backToSignin"></span></button>' +
            "</div>" +
          "</div>" +

          '<div class="sheet-footer"><span id="txt-footer"></span></div>' +
        "</div>" +
      "</div>"
    );
  }

  function backBtn(dest) {
    return (
      '<button type="button" class="back-btn" data-back="' + dest + '" aria-label="Back">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>' +
      "</button>"
    );
  }
  function panelHead(dest, titleId, subId) {
    return (
      '<div class="panel-head">' + backBtn(dest) +
      '<div class="panel-head-text"><h2 id="' + titleId + '"></h2><p id="' + subId + '"></p></div></div>'
    );
  }

  /* ---------------- state helpers ---------------- */
  var panels = ["auth", "forgot", "verify", "reset", "success"];
  function showPanel(name) {
    panels.forEach(function (p) { el("panel-" + p).hidden = p !== name; });
  }
  function showBanner(id, message, isError) {
    var b = el(id);
    b.textContent = message || "";
    b.classList.toggle("error", !!isError);
    b.classList.toggle("show", !!message);
  }
  function friendlyError(err) {
    if (!err) return T[lang].offline;
    if (err instanceof TypeError || err.message === "Failed to fetch") return T[lang].offline;
    return err.message;
  }
  function setError(fieldId, on) { el(fieldId).classList.toggle("has-error", on); }
  function clearErrors(form) {
    form.querySelectorAll(".field, .otp-row").forEach(function (f) { f.classList.remove("has-error"); });
  }
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  /* ---------------- render ---------------- */
  // Slide the pill behind whichever tab is active.
  function moveThumb() {
    var active = document.querySelector(".segment button.active");
    var thumb = document.querySelector("[data-segment-thumb]");
    if (!active || !thumb) return;
    thumb.style.left = active.offsetLeft + "px";
    thumb.style.width = active.offsetWidth + "px";
  }

  function render() {
    var t = T[lang];
    var isCreate = mode === "create";

    document.documentElement.setAttribute("lang", lang === "ny" ? "ny" : "en");

    el("txt-headline").innerHTML = t.headline;
    el("txt-subtitle").innerHTML = t.subtitle;
    el("tab-signin").textContent = t.signin;
    el("tab-create").textContent = t.create;

    el("lbl-name").textContent = t.nameLabel;
    el("fullName").placeholder = t.namePh;
    el("lbl-email").textContent = t.emailLabel;
    el("email").placeholder = t.emailPh;
    el("lbl-password").textContent = t.passLabel;
    el("password").placeholder = isCreate ? t.passPhCreate : t.passPhSignin;
    el("lbl-confirm").textContent = t.confirmLabel;
    el("confirmPassword").placeholder = t.confirmPh;

    document.querySelectorAll(".toggle-show").forEach(function (btn) {
      var input = el(btn.dataset.target);
      btn.textContent = input && input.type === "text" ? t.hide : t.show;
    });

    el("txt-stay").textContent = t.stay;
    el("forgotLink").textContent = t.forgot;
    el("forgotLink").style.visibility = isCreate ? "hidden" : "visible";

    el("submitBtn").querySelector(".submit-label").textContent = isCreate ? t.createBtn : t.continueBtn;
    el("switchLine").innerHTML = isCreate ? t.switchSignin : t.switchCreate;
    el("txt-footer").innerHTML = t.footer;

    el("err-name").textContent = t.errName;
    el("err-email").textContent = t.errEmail;
    el("err-password").textContent = t.errPassword;
    el("err-confirm").textContent = t.errConfirm;

    el("field-name").hidden = !isCreate;
    el("field-confirm").hidden = !isCreate;
    el("strengthWrap").hidden = !isCreate;
    if (!isCreate) { el("strengthMeter").setAttribute("data-score", "0"); el("strengthLabel").textContent = ""; }
    el("password").setAttribute("autocomplete", isCreate ? "new-password" : "current-password");

    el("txt-forgotTitle").textContent = t.forgotTitle;
    el("txt-forgotSubtitle").textContent = t.forgotSubtitle;
    el("lbl-forgot-email").textContent = t.emailLabel;
    el("forgotEmail").placeholder = t.emailPh;
    el("err-forgot-email").textContent = t.errForgotEmail;
    el("txt-sendCode").textContent = t.sendCode;
    el("rememberLine").innerHTML = t.rememberLine;

    el("txt-verifyTitle").textContent = t.verifyTitle;
    el("txt-verifySubtitle").textContent = t.verifySubtitle;
    el("verify-email-target").textContent = currentEmail;
    el("err-code").textContent = t.errCode;
    el("txt-verifyBtn").textContent = t.verifyBtn;
    el("txt-resendPrefix").textContent = t.resendPrefix;
    updateResendLabel();

    el("txt-resetTitle").textContent = t.resetTitle;
    el("txt-resetSubtitle").textContent = t.resetSubtitle;
    el("lbl-resetCode").textContent = t.resetCodeLabel;
    el("err-resetCode").textContent = t.errResetCode;
    el("lbl-newPassword").textContent = t.newPasswordLabel;
    el("newPassword").placeholder = t.passPhCreate;
    el("lbl-confirmNew").textContent = t.confirmNewLabel;
    el("confirmNewPassword").placeholder = t.confirmPh;
    el("err-newPassword").textContent = t.errNewPassword;
    el("err-confirmNew").textContent = t.errConfirmNew;
    el("txt-resetBtn").textContent = t.resetBtn;

    el("txt-successTitle").textContent = t.successTitle;
    el("txt-successSubtitle").textContent = t.successSubtitle;
    el("txt-backToSignin").textContent = t.backToSignin;
    moveThumb();
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll(".tab").forEach(function (tab) {
      var on = tab.dataset.tab === mode;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    clearErrors(el("authForm"));
    render();
  }
  /* ---------------- OTP ---------------- */
  function otpInputs() { return Array.prototype.slice.call(document.querySelectorAll("[data-otp]")); }
  function clearOtp() {
    otpInputs().forEach(function (i) { i.value = ""; i.classList.remove("filled"); });
    el("otpRow").classList.remove("has-error");
    el("err-code").style.display = "none";
  }
  function getOtp() { return otpInputs().map(function (i) { return i.value; }).join(""); }

  function wireOtp() {
    var inputs = otpInputs();
    inputs.forEach(function (inp, i) {
      inp.addEventListener("input", function () {
        inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 1);
        inp.classList.toggle("filled", inp.value.length > 0);
        if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
        // All six digits in — submit on the user's behalf.
        if (inputs.every(function (x) { return x.value; })) {
          el("verifyForm").requestSubmit();
        }
      });
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !inp.value && i > 0) inputs[i - 1].focus();
      });
      inp.addEventListener("paste", function (e) {
        var text = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
        if (!text) return;
        e.preventDefault();
        text.slice(0, 6).split("").forEach(function (digit, idx) {
          if (inputs[idx]) inputs[idx].value = digit;
        });
        (inputs[Math.min(text.length, 5)] || inputs[5]).focus();
      });
    });
  }

  function updateResendLabel() {
    var link = el("resendLink");
    if (!link) return;
    if (resendSeconds > 0) {
      link.textContent = T[lang].resendWait(resendSeconds);
      link.classList.add("disabled");
    } else {
      link.textContent = T[lang].resendLink;
      link.classList.remove("disabled");
    }
  }
  function startResendCountdown() {
    resendSeconds = 30;
    updateResendLabel();
    clearInterval(resendTimer);
    resendTimer = setInterval(function () {
      resendSeconds -= 1;
      updateResendLabel();
      if (resendSeconds <= 0) clearInterval(resendTimer);
    }, 1000);
  }

  function goToVerify(email, silentResend) {
    currentEmail = email;
    el("verify-email-target").textContent = email;
    clearOtp();
    showBanner("verifyBanner", "");
    showPanel("verify");
    startResendCountdown();
    var first = otpInputs()[0];
    if (first) first.focus();
    if (silentResend) {
      // The account exists but isn't verified yet, so quietly send a fresh
      // code instead of making the person hunt for the old email.
      Zafar.postJSON("/auth/resend", { email: email }).catch(function () {});
    }
  }

  /* ---------------- password strength ---------------- */
  function passwordStrength(v) {
    if (!v) return 0;
    var s = 1;
    if (v.length >= 8 && /[0-9]/.test(v) && /[a-zA-Z]/.test(v)) s = 2;
    if (v.length >= 8 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) s = 3;
    return s;
  }
  function strengthLabel(s) { return ["", "Weak", "Fair", "Strong"][s] || ""; }
  function wireStrength() {
    var input = el("password"), meter = el("strengthMeter"), label = el("strengthLabel");
    input.addEventListener("input", function () {
      if (mode !== "create") { meter.setAttribute("data-score", "0"); label.textContent = ""; return; }
      var s = passwordStrength(input.value);
      meter.setAttribute("data-score", String(s));
      label.textContent = input.value ? strengthLabel(s) : "";
    });
  }

  /* ---------------- flows ---------------- */
  function wireAuthForm() {
    var form = el("authForm");
    var submitBtn = el("submitBtn");
    var submitLabel = submitBtn.querySelector(".submit-label");

    function busy(on, label) {
      submitBtn.disabled = on;
      submitBtn.classList.toggle("loading", on);
      submitLabel.textContent = label;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = T[lang];
      var isCreate = mode === "create";

      clearErrors(form);
      var ok = true;
      if (isCreate && el("fullName").value.trim().length < 2) { setError("field-name", true); ok = false; }
      if (!isValidEmail(el("email").value.trim())) { setError("field-email", true); ok = false; }
      if (el("password").value.length < 6) { setError("field-password", true); ok = false; }
      if (isCreate && el("confirmPassword").value !== el("password").value) { setError("field-confirm", true); ok = false; }
      if (!ok) return;

      var email = el("email").value.trim();
      var password = el("password").value;
      showBanner("authBanner", "");

      if (!isCreate) {
        busy(true, t.signingIn);
        // /auth/login is FastAPI's OAuth2PasswordRequestForm, so credentials
        // go up form-encoded rather than as JSON.
        Zafar.postForm("/auth/login", { email: email, password: password })
          .then(function (data) {
            Zafar.setToken(data.access_token, el("staySignedIn").checked);
            location.href = "dashboard.html";
          })
          .catch(function (err) {
            busy(false, t.continueBtn);
            if (err && err.message && /not verified/i.test(err.message)) return goToVerify(email, true);
            showBanner("authBanner", friendlyError(err), true);
          });
      } else {
        busy(true, t.creatingAccount);
        Zafar.postJSON("/auth/register", {
          email: email,
          password: password,
          name: el("fullName").value.trim(),
        })
          .then(function () {
            busy(false, t.createBtn);
            goToVerify(email, false);
          })
          .catch(function (err) {
            busy(false, t.createBtn);
            showBanner("authBanner", friendlyError(err), true);
          });
      }
    });
  }

  function wireForgot() {
    el("forgotLink").addEventListener("click", function () {
      el("forgotEmail").value = el("email").value || "";
      clearErrors(el("forgotForm"));
      showBanner("forgotBanner", "");
      showPanel("forgot");
      el("forgotEmail").focus();
    });

    var forgotBtn = el("forgotBtn");
    el("forgotForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = T[lang];
      clearErrors(el("forgotForm"));
      var email = el("forgotEmail").value.trim();
      if (!isValidEmail(email)) return setError("field-forgot-email", true);
      showBanner("forgotBanner", "");

      forgotBtn.disabled = true;
      forgotBtn.classList.add("loading");

      Zafar.postJSON("/auth/forgot-password", { email: email })
        .then(function () {
          forgotBtn.disabled = false;
          forgotBtn.classList.remove("loading");
          currentEmail = email; // read by wireReset() below
          clearErrors(el("resetForm"));
          showBanner("resetBanner", "");
          el("resetForm").reset();
          showPanel("reset");
          el("resetCode").focus();
        })
        .catch(function (err) {
          // The endpoint never actually reports "email not found" (see its
          // docstring) — a network/server error is the only realistic case
          // that lands here, so this banner is safe to show as-is.
          forgotBtn.disabled = false;
          forgotBtn.classList.remove("loading");
          showBanner("forgotBanner", friendlyError(err), true);
        });
    });
  }

  function wireVerify() {
    wireOtp();

    el("resendLink").addEventListener("click", function () {
      if (resendSeconds > 0) return;
      showBanner("verifyBanner", "");
      Zafar.postJSON("/auth/resend", { email: currentEmail })
        .then(function () {
          showBanner("verifyBanner", T[lang].resendSent, false);
          el("verifyBanner").classList.remove("error");
          startResendCountdown();
        })
        .catch(function (err) { showBanner("verifyBanner", friendlyError(err), true); });
    });

    var btn = el("verifyBtn");
    el("verifyForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = T[lang];
      var code = getOtp();
      if (code.length !== 6) {
        el("otpRow").classList.add("has-error");
        el("err-code").style.display = "block";
        return;
      }
      el("otpRow").classList.remove("has-error");
      el("err-code").style.display = "none";
      showBanner("verifyBanner", "");

      btn.disabled = true;
      btn.classList.add("loading");
      el("txt-verifyBtn").textContent = t.verifying;

      Zafar.postJSON("/auth/verify", { email: currentEmail, code: code })
        .then(function () {
          clearInterval(resendTimer);
          location.href = "login.html?verified=1";
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.classList.remove("loading");
          el("txt-verifyBtn").textContent = t.verifyBtn;
          clearOtp();
          otpInputs()[0].focus();
          showBanner("verifyBanner", friendlyError(err), true);
        });
    });
  }

  function wireReset() {
    var btn = el("resetBtn");
    el("resetForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = T[lang];
      clearErrors(el("resetForm"));
      showBanner("resetBanner", "");
      var code = el("resetCode").value.trim();
      var ok = true;
      if (code.length !== 6 || !/^\d{6}$/.test(code)) { setError("field-reset-code", true); ok = false; }
      if (el("newPassword").value.length < 6) { setError("field-new-password", true); ok = false; }
      if (el("confirmNewPassword").value !== el("newPassword").value) { setError("field-confirm-new", true); ok = false; }
      if (!ok) return;

      btn.disabled = true;
      btn.classList.add("loading");
      el("txt-resetBtn").textContent = t.resetting;

      Zafar.postJSON("/auth/reset-password", {
        email: currentEmail,
        code: code,
        new_password: el("newPassword").value,
      })
        .then(function () {
          showPanel("success");
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.classList.remove("loading");
          el("txt-resetBtn").textContent = t.resetBtn;
          showBanner("resetBanner", friendlyError(err), true);
        });
    });

    el("backToSigninBtn").addEventListener("click", function () {
      setMode("signin");
      el("authForm").reset();
      el("forgotForm").reset();
      el("resetForm").reset();
      clearOtp();
      showPanel("auth");
    });
  }

  function wireChrome() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () { setMode(tab.dataset.tab); });
    });
    document.body.addEventListener("click", function (e) {
      var goto = e.target.closest("[data-goto]");
      if (goto) return setMode(goto.dataset.goto);
      var back = e.target.closest("[data-back]");
      if (!back) return;
      var dest = back.dataset.back;
      if (dest === "auth" || dest === "register") {
        setMode(dest === "register" ? "create" : "signin");
        showPanel("auth");
      } else {
        showPanel(dest);
      }
    });
    document.querySelectorAll(".toggle-show").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = el(btn.dataset.target);
        var showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? T[lang].show : T[lang].hide;
      });
    });
  }

  /* ---------------- accent from the hero photo ---------------- */
  // The hero photo's average tone is blended heavily toward brand green and
  // used for focus rings, so the page feels tied to whatever image is set.
  function applyAccentFromImage(img) {
    try {
      var size = 24;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      function mix(sample, brand) {
        return Math.max(0, Math.min(255, Math.round((sample / n) * 0.25 + brand * 0.75)));
      }
      document.documentElement.style.setProperty(
        "--ring",
        "rgba(" + mix(r, 12) + "," + mix(g, 58) + "," + mix(b, 45) + ",0.28)"
      );
    } catch (e) {
      /* canvas is tainted or unavailable — the token default stays */
    }
  }

  /* ---------------- init ---------------- */
  function init() {
    // Wake a sleeping free-tier backend while the person is still typing.
    try { fetch(API_BASE_URL + "/health", { mode: "cors" }).catch(function () {}); } catch (e) {}

    var root = document.getElementById("auth");
    root.innerHTML = screenHTML();
    document.body.classList.add("auth-body");

    wireChrome();
    wireAuthForm();
    wireForgot();
    wireVerify();
    wireReset();
    wireStrength();
    window.addEventListener("resize", moveThumb);

    var page = (location.pathname.split("/").pop() || "login.html").replace(/^$/, "login.html");
    var params = new URLSearchParams(location.search);

    setMode(page === "register.html" ? "create" : "signin");

    if (page === "verify.html") {
      var email = params.get("email") || "";
      if (!email) {
        location.replace("register.html");
        return;
      }
      render();
      goToVerify(email, params.get("resend") === "1");
    } else {
      render();
      if (params.get("verified") === "1") showBanner("authBanner", T[lang].verifiedBanner, false);
      else if (params.get("registered") === "1") showBanner("authBanner", T[lang].registeredBanner, false);
      // Already signed in and landing on the sign-in page? Skip the form.
      // register.html stays reachable so a second account can be made.
      if (page === "login.html" && Zafar.getToken() && !params.get("switch") && !params.get("verified")) {
        location.replace("dashboard.html");
      }
    }

    var hero = el("heroImg");
    if (hero.complete && hero.naturalWidth) applyAccentFromImage(hero);
    else hero.addEventListener("load", function () { applyAccentFromImage(hero); });
  }

  return { init: init, T: T };
})();

document.addEventListener("DOMContentLoaded", ZafarAuth.init);
