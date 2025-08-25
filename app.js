/**********************************
 *  app.js  –  Supabase OTP auth  *
 **********************************/

// ---------- Supabase client ----------
const sb = window.supabaseClient; // created in config.js

// ---------- Global state ----------
let rawId = ""; // original input (email or username)
let email = ""; // resolved email
let username = ""; // username (if provided)

// ---------- Shorthand ----------
const $ = (id) => document.getElementById(id);
const err = (id, msg) => {
  $(id).textContent = msg || "";
};

// ---------- Panel control ----------
function show(panel) {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  $(panel).classList.add("active");
  document.querySelectorAll(".msg-err").forEach((e) => (e.textContent = ""));
}

// ---------- Initial load ----------
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user) {
    renderUser(session.user);
    show("home");
  } else {
    show("check-user");
  }
  bindEvents();
});

// ---------- Event bindings ----------
function bindEvents() {
  $("check-user-form").onsubmit = handleCheckUser;
  $("login-form").onsubmit = handleLogin;
  $("signup-form").onsubmit = handleSignup;
  $("otp-form").onsubmit = handleVerifyOtp;
  $("otp-resend").onclick = handleResendOtp;
  $("logout").onclick = handleLogout;

  $("back-login").onclick = () => show("check-user");
  $("back-signup").onclick = () => show("check-user");

  $("su-pwd2").oninput = matchPasswords;
  $("otp-code").oninput = (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  };
}

// ---------- 1. Identify user ----------
async function handleCheckUser(e) {
  e.preventDefault();
  const field = $("id-field");
  rawId = field.value.trim();
  if (!rawId) {
    err("check-err", "Enter email or username");
    return;
  }

  const btn = e.target.querySelector("button");
  setLoading(btn, true);

  try {
    const isEmail = rawId.includes("@");
    let exists = false;

    if (isEmail) {
      const { error } = await sb.auth.signInWithPassword({
        email: rawId,
        password: "dummy",
      });
      exists = error && error.message !== "Invalid login credentials";
      email = rawId;
    } else {
      const { data } = await sb.rpc("get_user_by_username", {
        username_input: rawId,
      });
      exists = data?.length > 0;
      email = data?.[0]?.email || "";
      username = rawId;
    }

    if (exists && email) {
      $("login-label").textContent = `Account: ${email}`;
      show("login");
    } else {
      $("signup-label").textContent = email
        ? `Create account for ${email}`
        : `Username: ${username}`;
      show("signup");
    }
  } catch (e0) {
    console.error(e0);
    err("check-err", "Something went wrong");
  } finally {
    setLoading(btn, false);
  }
}

// ---------- 2. Login ----------
async function handleLogin(e) {
  e.preventDefault();
  const password = $("login-pwd").value;
  if (!password) {
    err("login-err", "Enter password");
    return;
  }

  const btn = e.target.querySelector("button");
  setLoading(btn, true);

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    err("login-err", error.message);
  } else {
    renderUser(data.user);
    show("home");
  }

  setLoading(btn, false);
}

// ---------- 3. Signup ----------
async function handleSignup(e) {
  e.preventDefault();
  username = $("su-username").value.trim();
  const pwd = $("su-pwd").value;
  const pwd2 = $("su-pwd2").value;

  if (!username) {
    err("signup-err", "Enter username");
    return;
  }
  if (pwd.length < 6) {
    err("signup-err", "Password ≥ 6 chars");
    return;
  }
  if (pwd !== pwd2) {
    err("signup-err", "Passwords do not match");
    return;
  }

  if (!email) {
    // user typed only username
    const promptMail = prompt("Enter your email address:");
    if (!promptMail?.includes("@")) {
      err("signup-err", "Valid email required");
      return;
    }
    email = promptMail.trim();
  }

  const btn = e.target.querySelector("button");
  setLoading(btn, true);

  const { data, error } = await sb.auth.signUp({
    email,
    password: pwd,
    options: { data: { username } },
  });

  if (error) {
    err("signup-err", error.message);
  } else {
    $("otp-mail").textContent = email;
    show("otp");
  }

  setLoading(btn, false);
}

// ---------- 4. Verify OTP ----------
async function handleVerifyOtp(e) {
  e.preventDefault();
  const code = $("otp-code").value.trim();
  if (code.length !== 6) {
    err("otp-err", "Enter 6-digit code");
    return;
  }

  const btn = e.target.querySelector("button");
  setLoading(btn, true);

  const { data, error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error) {
    err("otp-err", error.message);
  } else {
    renderUser(data.user);
    show("home");
  }

  setLoading(btn, false);
}

// ---------- 5. Resend OTP ----------
async function handleResendOtp() {
  const link = $("otp-resend");
  link.textContent = "Sending…";
  link.disabled = true;

  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) err("otp-err", "Could not resend");
  else {
    link.textContent = "Code sent!";
    setTimeout(() => (link.textContent = "Resend code"), 3000);
  }
  link.disabled = false;
}

// ---------- Helper: dashboard ----------
function renderUser(u) {
  $("u-mail").textContent = u.email;
  $("u-name").textContent = u.user_metadata?.username || "–";
  $("u-date").textContent = new Date(u.created_at).toLocaleDateString();
}

// ---------- Logout ----------
async function handleLogout() {
  await sb.auth.signOut();
  document.querySelectorAll("form").forEach((f) => f.reset());
  rawId = email = username = "";
  show("check-user");
}

// ---------- Small helpers ----------
function setLoading(btn, on) {
  if (on) {
    btn.classList.add("loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}
function matchPasswords() {
  const p1 = $("su-pwd").value,
    p2 = $("su-pwd2").value;
  err("signup-err", p1 && p2 && p1 !== p2 ? "Passwords do not match" : "");
}
