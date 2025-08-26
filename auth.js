const sb = window.supabaseClient;

/* ---------- STATE VARIABLES ---------- */
let rawId = "";
let email = "";
let uname = "";
let isNewSignup = false;
let currentStep = "step-check";

/* ---------- HELPER FUNCTIONS ---------- */
const $ = (id) => document.getElementById(id);

const setErr = (id, msg = "") => {
  const element = $(id);
  if (element) {
    element.textContent = msg;
    element.setAttribute("aria-live", "polite");
  }
};

const show = (step) => {
  // Hide all panels
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));

  // Show target panel
  const targetPanel = $(step);
  if (targetPanel) {
    targetPanel.classList.add("active");
    currentStep = step;

    // Focus first input in the new panel
    const firstInput = targetPanel.querySelector("input");
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }

  // Clear all error messages
  document.querySelectorAll(".error").forEach((e) => (e.textContent = ""));
};

const spinner = (btn, on, text = "") => {
  if (!btn) return;

  btn.classList.toggle("loading", on);
  btn.disabled = on;

  if (on && text) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = text;
  } else if (!on && btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
};

const showLoadingOverlay = (show, message = "Processing...") => {
  const overlay = $("loading-overlay");
  if (overlay) {
    overlay.classList.toggle("hidden", !show);
    if (show) {
      overlay.querySelector("p").textContent = message;
    }
  }
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateUsername = (username) => {
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  return (
    usernameRegex.test(username) &&
    username.length >= 3 &&
    username.length <= 30
  );
};

/* ---------- INITIALIZATION ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    showLoadingOverlay(true, "Checking authentication...");

    const {
      data: { session },
      error,
    } = await sb.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      show("step-check");
      return;
    }

    if (session?.user) {
      // Check if user has completed profile setup
      try {
        const { data: profile, error: profileError } = await sb
          .from("profiles")
          .select("username, full_name")
          .eq("id", session.user.id)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Profile check error:", profileError);
        }

        const hasUsername =
          profile?.username || session.user.user_metadata?.username;

        if (!hasUsername && session.user.email_confirmed_at) {
          // User verified email but hasn't completed profile
          email = session.user.email;
          isNewSignup = true;
          show("step-profile");
        } else if (hasUsername) {
          // Redirect to dashboard
          window.location.href = "home.html";
          return;
        } else {
          // User exists but email not confirmed
          show("step-check");
        }
      } catch (error) {
        console.error("Profile verification error:", error);
        show("step-check");
      }
    } else {
      show("step-check");
    }
  } catch (error) {
    console.error("Initialization error:", error);
    show("step-check");
  } finally {
    showLoadingOverlay(false);
    bindEvents();
  }
});

/* ---------- EVENT BINDING ---------- */
function bindEvents() {
  // Form submissions
  const formCheck = $("form-check");
  const formLogin = $("form-login");
  const formSignup = $("form-signup");
  const formOtp = $("form-otp");
  const formProfile = $("form-profile");
  const formReset = $("form-reset");

  if (formCheck) formCheck.onsubmit = onCheck;
  if (formLogin) formLogin.onsubmit = onLogin;
  if (formSignup) formSignup.onsubmit = onSignup;
  if (formOtp) formOtp.onsubmit = onVerify;
  if (formProfile) formProfile.onsubmit = onCompleteProfile;
  if (formReset) formReset.onsubmit = onResetPassword;

  // Navigation buttons
  const backLogin = $("back-login");
  const backSignup = $("back-signup");
  const backOtp = $("back-otp");
  const backReset = $("back-reset");
  const forgotPassword = $("forgot-password");
  const otpResend = $("otp-resend");

  if (backLogin) backLogin.onclick = () => show("step-check");
  if (backSignup) backSignup.onclick = () => show("step-check");
  if (backOtp) backOtp.onclick = () => show("step-check");
  if (backReset) backReset.onclick = () => show("step-login");
  if (forgotPassword) forgotPassword.onclick = () => show("step-reset");
  if (otpResend) otpResend.onclick = resendOtp;

  // Real-time validation
  const profilePass2 = $("profile-pass2");
  const otpCode = $("otp-code");
  const profileUser = $("profile-user");

  if (profilePass2) {
    profilePass2.oninput = matchProfilePasswords;
  }

  if (otpCode) {
    otpCode.oninput = (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    };
  }

  if (profileUser) {
    profileUser.oninput = (e) => {
      e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
      validateUsernameInput();
    };
  }

  // Keyboard navigation
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const activePanel = document.querySelector(".panel.active");
      if (activePanel) {
        const submitBtn = activePanel.querySelector('button[type="submit"]');
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }
    }
  });
}

/* ---------- STEP 1: USER CHECK ---------- */
async function onCheck(e) {
  e.preventDefault();
  rawId = $("input-id").value.trim();

  if (!rawId) {
    setErr("err-check", "Please enter your email address");
    return;
  }

  if (!validateEmail(rawId)) {
    setErr("err-check", "Please enter a valid email address");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true, "Checking...");

  try {
    email = rawId;

    // Check if user exists by email
    const { data: existingUsers, error } = await sb
      .from("profiles")
      .select("id, username, full_name")
      .eq(
        "id",
        sb.auth.getUser().then((res) => res.data?.user?.id || "none")
      )
      .limit(1);

    // Alternative: Check auth.users directly via RPC or auth methods
    const { data: authData, error: authError } =
      await sb.auth.signInWithPassword({
        email: email,
        password: "dummy_check_password_123", // This will fail but tell us if user exists
      });

    // If error is "Invalid login credentials", user doesn't exist
    // If error is about email confirmation, user exists but not confirmed
    // If no error, this shouldn't happen with dummy password

    let userExists = false;
    if (authError) {
      if (authError.message.includes("Invalid login credentials")) {
        userExists = false;
      } else if (authError.message.includes("Email not confirmed")) {
        userExists = true;
      } else if (authError.message.includes("Invalid")) {
        userExists = true; // User exists but wrong password
      }
    }

    if (userExists) {
      $("login-label").textContent = `Welcome back! Sign in to ${email}`;
      show("step-login");
    } else {
      isNewSignup = true;
      $("signup-label").textContent = `Create your SecretShare account`;
      show("step-signup");
    }
  } catch (error) {
    console.error("User check error:", error);
    setErr("err-check", "Unable to verify email. Please try again.");
  } finally {
    spinner(btn, false);
  }
}

/* ---------- STEP 2: LOGIN ---------- */
async function onLogin(e) {
  e.preventDefault();
  const pwd = $("login-pass").value;

  if (!pwd) {
    setErr("err-login", "Please enter your password");
    return;
  }

  if (pwd.length < 6) {
    setErr("err-login", "Password must be at least 6 characters");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true, "Signing in...");

  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: pwd,
    });

    if (error) {
      if (error.message.includes("Email not confirmed")) {
        setErr(
          "err-login",
          "Please check your email and confirm your account first"
        );
      } else if (error.message.includes("Invalid login credentials")) {
        setErr("err-login", "Incorrect password. Please try again.");
      } else {
        setErr("err-login", error.message);
      }
    } else if (data.user) {
      // Check if profile is complete
      const { data: profile } = await sb
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .single();

      if (!profile?.username) {
        // Profile incomplete, go to profile setup
        show("step-profile");
      } else {
        // Redirect to dashboard
        showLoadingOverlay(true, "Redirecting to dashboard...");
        window.location.href = "home.html";
      }
    }
  } catch (error) {
    console.error("Login error:", error);
    setErr("err-login", "Sign in failed. Please try again.");
  } finally {
    spinner(btn, false);
  }
}

/* ---------- STEP 3: SIGNUP ---------- */
async function onSignup(e) {
  e.preventDefault();

  if (!email || !validateEmail(email)) {
    setErr("err-signup", "Valid email address required");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true, "Creating account...");

  try {
    const { data, error } = await sb.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true,
        data: {
          email_confirm: true,
        },
      },
    });

    if (error) {
      if (error.message.includes("rate limit")) {
        setErr(
          "err-signup",
          "Too many attempts. Please wait a minute before trying again."
        );
      } else {
        setErr("err-signup", error.message);
      }
    } else {
      $("otp-mail").textContent = email;
      show("step-otp");
    }
  } catch (error) {
    console.error("Signup error:", error);
    setErr("err-signup", "Account creation failed. Please try again.");
  } finally {
    spinner(btn, false);
  }
}

/* ---------- STEP 4: OTP VERIFICATION ---------- */
async function onVerify(e) {
  e.preventDefault();
  const code = $("otp-code").value.trim();

  if (code.length !== 6) {
    setErr("err-otp", "Please enter the complete 6-digit code");
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    setErr("err-otp", "Code must be 6 digits");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true, "Verifying...");

  try {
    const { data, error } = await sb.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) {
      if (error.message.includes("expired")) {
        setErr(
          "err-otp",
          "Verification code expired. Please request a new one."
        );
      } else if (error.message.includes("invalid")) {
        setErr(
          "err-otp",
          "Invalid verification code. Please check and try again."
        );
      } else {
        setErr("err-otp", error.message);
      }
    } else if (data.user) {
      if (isNewSignup) {
        show("step-profile");
      } else {
        showLoadingOverlay(true, "Redirecting...");
        window.location.href = "home.html";
      }
    }
  } catch (error) {
    console.error("Verification error:", error);
    setErr("err-otp", "Verification failed. Please try again.");
  } finally {
    spinner(btn, false);
  }
}

/* ---------- STEP 5: PROFILE COMPLETION ---------- */
async function onCompleteProfile(e) {
  e.preventDefault();

  uname = $("profile-user").value.trim();
  const p1 = $("profile-pass").value;
  const p2 = $("profile-pass2").value;
  const fullName = $("profile-name").value.trim();

  // Validation
  if (!uname) {
    setErr("err-profile", "Username is required");
    $("profile-user").focus();
    return;
  }

  if (!validateUsername(uname)) {
    setErr(
      "err-profile",
      "Username must be 3-30 characters long and contain only letters, numbers, and underscores"
    );
    $("profile-user").focus();
    return;
  }

  if (p1.length < 6) {
    setErr("err-profile", "Password must be at least 6 characters long");
    $("profile-pass").focus();
    return;
  }

  if (p1 !== p2) {
    setErr("err-profile", "Passwords do not match");
    $("profile-pass2").focus();
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true, "Creating profile...");

  try {
    // Check if username is already taken
    const { data: existingProfile, error: checkError } = await sb
      .from("profiles")
      .select("username")
      .eq("username", uname)
      .single();

    if (existingProfile) {
      setErr("err-profile", "Username already taken. Please choose another.");
      $("profile-user").focus();
      spinner(btn, false);
      return;
    }

    // Update user with password and metadata
    const { data: authData, error: authError } = await sb.auth.updateUser({
      password: p1,
      data: {
        username: uname,
        full_name: fullName || "",
        profile_completed: true,
      },
    });

    if (authError) {
      throw authError;
    }

    // The profile should be created automatically by the trigger
    // But let's verify and create if needed
    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("id")
      .eq("id", authData.user.id)
      .single();

    if (profileError && profileError.code === "PGRST116") {
      // Profile doesn't exist, create it
      const { error: insertError } = await sb.from("profiles").insert({
        id: authData.user.id,
        username: uname,
        full_name: fullName || "",
      });

      if (insertError) {
        console.error("Profile creation error:", insertError);
        throw insertError;
      }
    }

    // Success
    showLoadingOverlay(true, "Welcome to SecretShare! Redirecting...");

    setTimeout(() => {
      window.location.href = "home.html";
    }, 1500);
  } catch (error) {
    console.error("Profile completion error:", error);

    if (error.message.includes("username")) {
      setErr("err-profile", "Username already taken. Please choose another.");
    } else {
      setErr(
        "err-profile",
        "Unable to complete registration. Please try again."
      );
    }
  } finally {
    spinner(btn, false);
  }
}

/* ---------- PASSWORD RESET ---------- */
async function onResetPassword(e) {
  e.preventDefault();
  const resetEmail = $("reset-email").value.trim();

  if (!resetEmail || !validateEmail(resetEmail)) {
    setErr("err-reset", "Please enter a valid email address");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true, "Sending reset link...");

  try {
    const { error } = await sb.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      setErr("err-reset", error.message);
    } else {
      setErr("err-reset", ""); // Clear error
      btn.textContent = "Reset link sent! Check your email.";
      btn.disabled = true;

      setTimeout(() => {
        show("step-login");
      }, 3000);
    }
  } catch (error) {
    console.error("Password reset error:", error);
    setErr("err-reset", "Unable to send reset link. Please try again.");
  } finally {
    if (!btn.textContent.includes("sent")) {
      spinner(btn, false);
    }
  }
}

/* ---------- UTILITY FUNCTIONS ---------- */
async function resendOtp() {
  const link = $("otp-resend");
  if (!link || !email) return;

  link.disabled = true;
  link.textContent = "Sending...";

  try {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      setErr("err-otp", "Couldn't resend code. Please try again.");
    } else {
      link.textContent = "Code sent!";
      setErr("err-otp", ""); // Clear any previous errors

      setTimeout(() => {
        link.textContent = "Resend code";
        link.disabled = false;
      }, 30000); // 30 second cooldown
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    setErr("err-otp", "Unable to resend code");
    link.textContent = "Resend code";
    link.disabled = false;
  }
}

function matchProfilePasswords() {
  const p1 = $("profile-pass").value;
  const p2 = $("profile-pass2").value;

  if (p1 && p2) {
    if (p1 !== p2) {
      setErr("err-profile", "Passwords do not match");
    } else {
      setErr("err-profile", ""); // Clear error
    }
  }
}

function validateUsernameInput() {
  const usernameInput = $("profile-user");
  const username = usernameInput.value;

  if (username && !validateUsername(username)) {
    setErr(
      "err-profile",
      "Username must be 3-30 characters: letters, numbers, underscores only"
    );
  } else {
    setErr("err-profile", ""); // Clear error
  }
}

/* ---------- ERROR HANDLING ---------- */
window.addEventListener("error", (e) => {
  console.error("Global error:", e.error);
  showLoadingOverlay(false);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
  showLoadingOverlay(false);
});

// Export functions for debugging
window.authDebug = {
  show,
  getCurrentStep: () => currentStep,
  getCurrentUser: () => sb.auth.getUser(),
  resetState: () => {
    rawId = "";
    email = "";
    uname = "";
    isNewSignup = false;
    show("step-check");
  },
};
