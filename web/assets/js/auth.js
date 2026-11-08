/* ============================================================
   Zafar — authentication screen
   One module drives login.html, register.html and verify.html: the markup
   is built here so the three pages can't drift apart.

   Backend endpoints used:
     POST /auth/register         {email, password, name}
     POST /auth/login            form: email, password   -> {access_token}
     POST /auth/verify           {email, code}
     POST /auth/resend           {email}
     POST /auth/forgot-password  {email}
     POST /auth/reset-password   {email, code, new_password}
   ============================================================ */

var ZafarAuth = (function () {
  /* ---------------- strings ---------------- */
  var T = {
    en: {
      headline: "Welcome to ZAFAR.",
      subtitle: "Twelve years of <b>MSCE &amp; JCE past papers</b>, books, notes and " +
        "<b>marking keys</b> &mdash; free for every Malawian student.",

      signin: "Sign in", create: "Create account",
      switchCreate: 'Don\u2019t have an account? <button type="button" class="link-btn" data-goto="create">Create one</button>',
      switchSignin: 'Already have an account? <button type="button" class="link-btn" data-goto="signin">Sign in</button>',

      nameLabel: "Full name", namePh: "Full name",
      emailLabel: "Email address", emailPh: "Email address",
      passLabel: "Password", passPhSignin: "Password", passPhCreate: "Password \u2014 6 characters or more",
      confirmLabel: "Confirm password", confirmPh: "Confirm password",
      show: "Show password", hide: "Hide password",

      stay: "Remember me", forgot: "Forgot password?",
      continueBtn: "Sign in", createBtn: "Create account",
      signingIn: "Signing in\u2026", creatingAccount: "Creating account\u2026",

      footer: "12+ years archived&nbsp;&nbsp;&middot;&nbsp;&nbsp;Daily downloads&nbsp;&nbsp;&middot;&nbsp;&nbsp;Free",

      errName: "Enter your full name.",
      errEmail: "Enter a valid email address.",
      errPassword: "At least 6 characters.",
      errConfirm: "Passwords don't match.",
      verifiedBanner: "Email verified \u2014 sign in to continue.",
      registeredBanner: "Account created \u2014 sign in to continue.",

      forgotTitle: "Reset password",
      forgotSubtitle: "Enter the email on your account and we'll send a code.",
      sendCode: "Send code", sendingCode: "Sending code\u2026",
      rememberLine: 'Remembered it? <button type="button" class="link-btn" data-back="auth">Sign in</button>',
      errForgotEmail: "Enter a valid email address.",
      forgotNotAvailable: "Password reset isn't available yet. Please contact support.",

      verifyTitle: "Check your email",
      verifySubtitle: "We sent a 6-digit code to",
      verifyBtn: "Verify email", verifying: "Verifying\u2026",
      errCode: "Enter the 6-digit code.",
      resendPrefix: "Nothing arrived?", resendLink: "Resend code",
      resendWait: function (s) { return "Resend in " + s + "s"; },
      resendSent: "New code sent \u2014 check your email.",

      resetTitle: "New password",
      resetSubtitle: "Enter the code we emailed you, then choose a password.",
      resetCodeLabel: "6-digit code", errResetCode: "Enter the 6-digit code from your email.",
      resetCodePh: "6-digit code",
      newPasswordLabel: "New password", confirmNewLabel: "Confirm new password",
      newPasswordPh: "New password \u2014 6 characters or more",
      resetBtn: "Reset password", resetting: "Updating\u2026",
      errNewPassword: "At least 6 characters.", errConfirmNew: "Passwords don't match.",

      successTitle: "Password updated",
      successSubtitle: "You can now sign in with your new password.",
      backToSignin: "Back to sign in",

      offline: "Could not reach the server. Check your connection."
    }
  };

  var mode = "signin";
  var lang = "en";
  var resendTimer = null;
  var resendSeconds = 30;
  var currentEmail = "";

  var el = function (id) { return document.getElementById(id); };

  /* ---------------- icons ---------------- */
  var ICONS = {
    book: '<path d="M12 5C10.2 3.6 7.6 3 5 3v13c2.6 0 5.2.6 7 2 1.8-1.4 4.4-2 7-2V3c-2.6 0-5.2.6-7 2Z"/><path d="M12 5v13"/>',
    user: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/>',
    mail: '<rect x="3" y="5.6" width="18" height="12.8" rx="2.6"/><path d="m3.6 7.6 8.4 5.9 8.4-5.9"/>',
    lock: '<rect x="4.6" y="10.6" width="14.8" height="9.8" rx="2.6"/><path d="M8.1 10.6V8a3.9 3.9 0 0 1 7.8 0v2.6"/>',
    back: '<path d="m14.6 18.4-6.4-6.4 6.4-6.4"/>',
    check: '<path d="M20 6.5 9.2 17.3 4 12.1"/>',
    eye: '<path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.9"/>',
    eyeoff: '<path d="M4 4l16 16"/><path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c5.8 0 9.4 7 9.4 7a16 16 0 0 1-3 3.8"/><path d="M6.3 7.1A16 16 0 0 0 2.6 12S6.2 19 12 19a9.4 9.4 0 0 0 3.3-.6"/>'
  };
  function icon(name, size, stroke) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="' + (stroke || 1.7) + '" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || "") + "</svg>";
  }

  /* ---------------- markup ---------------- */

  // Floating past-paper cards over a shelf of books — the library, drawn.
  function libraryHTML() {
    var heights = [56, 76, 44, 88, 62, 94, 50, 72, 82, 42, 90, 60, 78, 48, 84, 66, 58, 74];
    var spines = "";
    for (var i = 0; i < heights.length; i++) {
      var cls = i % 6 === 2 ? " a" : i % 3 === 0 ? " w" : "";
      spines += '<i class="' + cls + '" style="height:' + heights[i] + '%"></i>';
    }
    return '<div class="lib" aria-hidden="true">' +
      '<span class="doc d3"></span><span class="doc d1"></span><span class="doc d2"></span>' +
      '<div class="shelf">' + spines + "</div>" +
    "</div>";
  }

  function fieldMarkup(o) {
    return '<div class="field" id="' + o.field + '">' +
      '<label class="sr-only" for="' + o.input + '" id="' + o.label + '"></label>' +
      '<div class="control">' +
        '<span class="ic">' + icon(o.icon, 18) + "</span>" +
        '<input class="input" id="' + o.input + '" type="' + (o.type || "text") + '"' +
          (o.ac ? ' autocomplete="' + o.ac + '"' : "") +
          (o.mode ? ' inputmode="' + o.mode + '"' : "") +
          (o.max ? ' maxlength="' + o.max + '"' : "") +
          (o.min ? ' minlength="' + o.min + '"' : "") +
          (o.pattern ? ' pattern="' + o.pattern + '"' : "") +
          (o.otp === 0 ? ' autocomplete="one-time-code"' : "") +
          (o.otp !== undefined ? ' data-otp="' + o.otp + '" aria-label="Digit ' + (o.otp + 1) + '"' : "") +
          ' aria-labelledby="' + o.label + '">' +
        (o.reveal ? '<button type="button" class="toggle-show" data-target="' + o.input + '"></button>' : "") +
      "</div>" +
      (o.err ? '<div class="error-msg" id="' + o.err + '"></div>' : "") +
      (o.strength
        ? '<div class="strength-wrap" id="strengthWrap" hidden>' +
            '<div class="strength" id="strengthMeter" data-score="0"><i></i><i></i><i></i></div>' +
            '<div class="strength-label" id="strengthLabel"></div>' +
          "</div>"
        : "") +
    "</div>";
  }

  function screenHTML() {
    return (
      '<div class="auth">' +

        '<header class="mast has-head" id="mast">' +
          '<div class="mast-top">' +
            '<a class="wordmark" href="login.html">' +
              '<span class="glyph">' + icon("book", 16) + "</span>ZAFAR" +
            "</a>" +
          "</div>" +
          '<p class="mast-head" id="txt-headline"></p>' +
          '<p class="mast-lede" id="txt-subtitle"></p>' +
          libraryHTML() +
        "</header>" +

        '<section class="sheet">' +
          '<div class="sheet-body">' +

            /* ---------- auth ---------- */
            '<div class="panel" id="panel-auth">' +
              '<div class="head">' +
                '<h1 id="txt-pageTitle"></h1>' +
                '<p id="switchLine"></p>' +
              "</div>" +
              '<div class="banner" id="authBanner" role="status"></div>' +
              '<form class="form" id="authForm" novalidate>' +
                fieldMarkup({ field: "field-name", input: "fullName", label: "lbl-name",
                  icon: "user", ac: "name", err: "err-name" }) +
                fieldMarkup({ field: "field-email", input: "email", label: "lbl-email",
                  icon: "mail", type: "email", mode: "email", ac: "email", err: "err-email" }) +
                fieldMarkup({ field: "field-password", input: "password", label: "lbl-password",
                  icon: "lock", type: "password", ac: "current-password", min: 6,
                  reveal: true, err: "err-password", strength: true }) +
                fieldMarkup({ field: "field-confirm", input: "confirmPassword", label: "lbl-confirm",
                  icon: "lock", type: "password", ac: "new-password", reveal: true, err: "err-confirm" }) +
                '<div class="options-row">' +
                  '<label class="stay-signed"><input type="checkbox" id="staySignedIn" checked>' +
                    '<span id="txt-stay"></span></label>' +
                  '<button type="button" class="link-btn" id="forgotLink"></button>' +
                "</div>" +
                '<button type="submit" class="submit" id="submitBtn">' +
                  '<span class="spinner"></span><span class="submit-label"></span>' +
                "</button>" +
              "</form>" +
            "</div>" +

            /* ---------- forgot ---------- */
            '<div class="panel" id="panel-forgot" hidden>' +
              backBtn("auth") +
              '<div class="head"><h1 id="txt-forgotTitle"></h1><p id="txt-forgotSubtitle"></p></div>' +
              '<form class="form" id="forgotForm" novalidate>' +
                fieldMarkup({ field: "field-forgot-email", input: "forgotEmail",
                  label: "lbl-forgot-email", icon: "mail", type: "email", mode: "email",
                  ac: "email", err: "err-forgot-email" }) +
                '<div class="banner" id="forgotBanner" role="status"></div>' +
                '<button type="submit" class="submit" id="forgotBtn">' +
                  '<span class="spinner"></span><span class="submit-label" id="txt-sendCode"></span>' +
                "</button>" +
              "</form>" +
              '<p class="alt" id="rememberLine"></p>' +
            "</div>" +

            /* ---------- verify ---------- */
            '<div class="panel" id="panel-verify" hidden>' +
              backBtn("register") +
              '<div class="head"><h1 id="txt-verifyTitle"></h1>' +
                '<p><span id="txt-verifySubtitle"></span><br>' +
                '<strong id="verify-email-target"></strong></p></div>' +
              '<form class="form" id="verifyForm" novalidate>' +
                '<div class="otp-row" id="otpRow">' +
                  [0, 1, 2, 3, 4, 5].map(function (i) {
                    return '<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1"' +
                      (i === 0 ? ' autocomplete="one-time-code"' : "") +
                      ' aria-label="Digit ' + (i + 1) + '" data-otp="' + i + '">';
                  }).join("") +
                "</div>" +
                '<div class="error-msg" id="err-code"></div>' +
                '<div class="banner" id="verifyBanner" role="status"></div>' +
                '<button type="submit" class="submit" id="verifyBtn">' +
                  '<span class="spinner"></span><span class="submit-label" id="txt-verifyBtn"></span>' +
                "</button>" +
                '<div class="resend-row"><span id="txt-resendPrefix"></span> ' +
                  '<button type="button" class="link-btn" id="resendLink"></button></div>' +
              "</form>" +
            "</div>" +

            /* ---------- reset ---------- */
            '<div class="panel" id="panel-reset" hidden>' +
              backBtn("forgot") +
              '<div class="head"><h1 id="txt-resetTitle"></h1><p id="txt-resetSubtitle"></p></div>' +
              '<form class="form" id="resetForm" novalidate>' +
                fieldMarkup({ field: "field-reset-code", input: "resetCode",
                  label: "lbl-resetCode", icon: "mail", mode: "numeric", max: 6,
                  ac: "one-time-code", err: "err-resetCode" }) +
                fieldMarkup({ field: "field-new-password", input: "newPassword",
                  label: "lbl-newPassword", icon: "lock", type: "password", reveal: true,
                  err: "err-newPassword" }) +
                fieldMarkup({ field: "field-confirm-new", input: "confirmNewPassword",
                  label: "lbl-confirmNew", icon: "lock", type: "password", reveal: true,
                  err: "err-confirmNew" }) +
                '<div class="banner" id="resetBanner" role="status"></div>' +
                '<button type="submit" class="submit" id="resetBtn">' +
                  '<span class="spinner"></span><span class="submit-label" id="txt-resetBtn"></span>' +
                "</button>" +
              "</form>" +
            "</div>" +

            /* ---------- success ---------- */
            '<div class="panel" id="panel-success" hidden>' +
              '<div class="done">' +
                '<div class="tick">' + icon("check", 28, 2.3) + "</div>" +
                '<h1 id="txt-successTitle"></h1><p id="txt-successSubtitle"></p>' +
                '<button type="button" class="submit" id="backToSigninBtn">' +
                  '<span class="submit-label" id="txt-backToSignin"></span>' +
                "</button>" +
              "</div>" +
            "</div>" +

          "</div>" +
          '<footer class="sheet-footer"><span id="txt-footer"></span></footer>' +
        "</section>" +
      "</div>"
    );
  }

  function backBtn(dest) {
    return '<button type="button" class="back" data-back="' + dest + '" aria-label="Back">' +
      icon("back", 18) + "</button>";
  }

  /* ---------------- state helpers ---------------- */
  var panels = ["auth", "forgot", "verify", "reset", "success"];

  function showPanel(name) {
    panels.forEach(function (p) { el("panel-" + p).hidden = p !== name; });
    syncGreeting();
  }

  // The welcome exists only on the screen people land on — never on a
  // screen they reached mid-flow, and never on the create-account form.
  function syncGreeting() {
    var mast = el("mast");
    var head = el("txt-headline");
    if (!mast || !head) return;
    var show = !el("panel-auth").hidden && mode === "signin";
    mast.classList.toggle("has-head", show);
    head.hidden = !show;
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
  function refreshReveal(btn) {
    var input = el(btn.dataset.target);
    var showing = !!input && input.type === "text";
    btn.classList.toggle("shown", showing);
    btn.setAttribute("aria-label", showing ? T[lang].hide : T[lang].show);
    btn.innerHTML = icon(showing ? "eyeoff" : "eye", 18);
  }

  function render() {
    var t = T[lang];
    var isCreate = mode === "create";

    el("txt-headline").innerHTML = t.headline;
    el("txt-subtitle").innerHTML = t.subtitle;

    el("txt-pageTitle").textContent = isCreate ? t.create : t.signin;
    el("switchLine").innerHTML = isCreate ? t.switchSignin : t.switchCreate;

    el("lbl-name").textContent = t.nameLabel;
    el("fullName").placeholder = t.namePh;
    el("lbl-email").textContent = t.emailLabel;
    el("email").placeholder = t.emailPh;
    el("lbl-password").textContent = t.passLabel;
    el("password").placeholder = isCreate ? t.passPhCreate : t.passPhSignin;
    el("lbl-confirm").textContent = t.confirmLabel;
    el("confirmPassword").placeholder = t.confirmPh;

    document.querySelectorAll(".toggle-show").forEach(refreshReveal);

    el("txt-stay").textContent = t.stay;
    el("forgotLink").textContent = t.forgot;
    el("forgotLink").style.visibility = isCreate ? "hidden" : "visible";

    el("submitBtn").querySelector(".submit-label").textContent = isCreate ? t.createBtn : t.continueBtn;
    el("txt-footer").innerHTML = t.footer;

    el("err-name").textContent = t.errName;
    el("err-email").textContent = t.errEmail;
    el("err-password").textContent = t.errPassword;
    el("err-confirm").textContent = t.errConfirm;

    el("field-name").hidden = !isCreate;
    el("field-confirm").hidden = !isCreate;
    el("strengthWrap").hidden = !isCreate;
    if (!isCreate) {
      el("strengthMeter").setAttribute("data-score", "0");
      el("strengthLabel").textContent = "";
    }
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
    el("resetCode").placeholder = t.resetCodePh;
    el("err-resetCode").textContent = t.errResetCode;
    el("lbl-newPassword").textContent = t.newPasswordLabel;
    el("newPassword").placeholder = t.newPasswordPh;
    el("lbl-confirmNew").textContent = t.confirmNewLabel;
    el("confirmNewPassword").placeholder = t.confirmPh;
    el("err-newPassword").textContent = t.errNewPassword;
    el("err-confirmNew").textContent = t.errConfirmNew;
    el("txt-resetBtn").textContent = t.resetBtn;

    el("txt-successTitle").textContent = t.successTitle;
    el("txt-successSubtitle").textContent = t.successSubtitle;
    el("txt-backToSignin").textContent = t.backToSignin;

    syncGreeting();
  }

  function setMode(next) {
    mode = next;
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
          if (inputs[idx]) { inputs[idx].value = digit; inputs[idx].classList.add("filled"); }
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
          name: el("fullName").value.trim()
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
        new_password: el("newPassword").value
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
    // Mode switch, panel back buttons — one delegated listener covers the
    // links the renderer rewrites on every mode change.
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
        input.type = input.type === "password" ? "text" : "password";
        refreshReveal(btn);
      });
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    // Wake a sleeping free-tier backend while the person is still typing.
    try { fetch(API_BASE_URL + "/health", { mode: "cors" }).catch(function () {}); } catch (e) {}

    var root = document.getElementById("auth");
    root.innerHTML = screenHTML();

    wireChrome();
    wireAuthForm();
    wireForgot();
    wireVerify();
    wireReset();
    wireStrength();

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
  }

  return { init: init, T: T };
})();

document.addEventListener("DOMContentLoaded", ZafarAuth.init);
