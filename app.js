// ---------- Supabase ----------
const supabase = window.supabaseClient;

// ---------- State ----------
let currentEmail = "";
let currentUsername = "";
let pendingSignup = false;

// ---------- Sections ----------
const sections = {
  checkUser: document.getElementById("check-user-section"),
  login: document.getElementById("login-section"),
  signup: document.getElementById("signup-section"),
  otp: document.getElementById("otp-section"),
  home: document.getElementById("home-section"),
};

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  await restoreSession();
  initListeners();
});

// ---------- Session ----------
async function restoreSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (session?.user) {
    show("home");
    renderUser(session.user);
  } else {
    show("checkUser");
  }
}

// ---------- UI helpers ----------
function show(key) {
  Object.values(sections).forEach((sec) => sec.classList.remove("active"));
  sections[key].classList.add("active");
  document
    .querySelectorAll(".error-message")
    .forEach((e) => (e.textContent = ""));
}
function err(id, msg) {
  document.getElementById(id).textContent = msg;
}

// ---------- Listeners ----------
function initListeners() {
  /* email / username step */
  document
    .getElementById("check-user-form")
    .addEventListener("submit", checkUser);

  /* login */
  document.getElementById("login-form").addEventListener("submit", login);
  document
    .getElementById("back-to-check")
    .addEventListener("click", () => show("checkUser"));

  /* signup */
  document.getElementById("signup-form").addEventListener("submit", signup);
  document
    .getElementById("back-to-check-signup")
    .addEventListener("click", () => show("checkUser"));

  /* otp */
  document.getElementById("otp-form").addEventListener("submit", verifyOtp);
  document.getElementById("resend-otp").addEventListener("click", resendOtp);
  document.getElementById("otp-code").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  /* logout */
  document.getElementById("logout-btn").addEventListener("click", logout);

  /* password confirm helper */
  document.getElementById("confirm-password").addEventListener("input", () => {
    const p = document.getElementById("signup-password").value;
    const c = document.getElementById("confirm-password").value;
    err("signup-error", p && c && p !== c ? "Passwords do not match" : "");
  });
}

// ---------- Step 1: check if user exists ----------
async function checkUser(e) {
  e.preventDefault();
  const field = document.getElementById("email-username");
  const value = field.value.trim();
  if (!value) {
    err("check-error", "Please enter email or username");
    return;
  }

  const btn = e.target.querySelector("button");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const isEmail = value.includes("@");
    let exists = false;
    let userEmail = "";

    if (isEmail) {
      const { error } = await supabase.auth.signInWithPassword({
        email: value,
        password: "dummy",
      });
      exists = error && error.message !== "Invalid login credentials";
      userEmail = value;
    } else {
      const { data } = await supabase.rpc("get_user_by_username", {
        username_input: value,
      });
      exists = data?.length > 0;
      userEmail = data?.[0]?.email || "";
    }

    currentEmail = userEmail || value;
    currentUsername = isEmail ? "" : value;

    if (exists && userEmail) {
      document.getElementById(
        "login-email"
      ).textContent = `Welcome back! Please enter your password for ${userEmail}`;
      show("login");
    } else {
      document.getElementById("signup-email").textContent = isEmail
        ? `Create account for ${value}`
        : `Create account with username: ${value}`;
      show("signup");
    }
  } catch (err0) {
    console.error(err0);
    err("check-error", "Something went wrong, try again.");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// ---------- Login ----------
async function login(e) {
  e.preventDefault();
  const password = document.getElementById("login-password").value;
  if (!password) {
    err("login-error", "Enter your password");
    return;
  }

  const btn = e.target.querySelector("button");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password,
    });
    if (error) {
      err("login-error", error.message);
      return;
    }
    if (data.user) {
      show("home");
      renderUser(data.user);
    }
  } catch (err0) {
    console.error(err0);
    err("login-error", "Login failed. Try again.");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// ---------- Signup ----------
async function signup(e) {
  e.preventDefault();
  const username = document.getElementById("signup-username").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("confirm-password").value;
  if (!username) {
    err("signup-error", "Enter a username");
    return;
  }
  if (password.length < 6) {
    err("signup-error", "Password ≥ 6 chars");
    return;
  }
  if (password !== confirm) {
    err("signup-error", "Passwords do not match");
    return;
  }

  if (!currentEmail.includes("@")) {
    const emailPrompt = prompt("Enter your email address:");
    if (!emailPrompt || !emailPrompt.includes("@")) {
      err("signup-error", "Valid email required");
      return;
    }
    currentEmail = emailPrompt;
  }

  const btn = e.target.querySelector("button");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: currentEmail,
      password,
      options: { data: { username } },
    });
    if (error) {
      err("signup-error", error.message);
      return;
    }
    if (data.user) {
      document.getElementById("otp-email").textContent = currentEmail;
      pendingSignup = true;
      show("otp");
    }
  } catch (err0) {
    console.error(err0);
    err("signup-error", "Signup failed, try again.");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// ---------- Verify OTP ----------
async function verifyOtp(e) {
  e.preventDefault();
  const code = document.getElementById("otp-code").value.trim();
  if (code.length !== 6) {
    err("otp-error", "Enter a 6-digit code");
    return;
  }

  const btn = e.target.querySelector("button");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: code,
      type: "email",
    });
    if (error) {
      err("otp-error", error.message);
      return;
    }
    if (data.user) {
      show("home");
      renderUser(data.user);
    }
  } catch (err0) {
    console.error(err0);
    err("otp-error", "Verification failed.");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// ---------- Resend OTP ----------
async function resendOtp() {
  const link = document.getElementById("resend-otp");
  link.disabled = true;
  link.textContent = "Sending…";
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: currentEmail,
    });
    if (error) {
      err("otp-error", "Couldn’t resend.");
    } else {
      link.textContent = "Code sent!";
      setTimeout(() => (link.textContent = "Resend Code"), 3000);
    }
  } finally {
    link.disabled = false;
  }
}

// ---------- Dashboard ----------
function renderUser(user) {
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-username").textContent =
    user.user_metadata?.username || "Not set";
  document.getElementById("user-created").textContent = new Date(
    user.created_at
  ).toLocaleDateString();
}

// ---------- Logout ----------
async function logout() {
  await supabase.auth.signOut();
  currentEmail = currentUsername = "";
  pendingSignup = false;
  document.querySelectorAll("form").forEach((f) => f.reset());
  show("checkUser");
}
