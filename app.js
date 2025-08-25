const sb = window.supabaseClient; // from config.js
/* ---------- globals ---------- */
let rawId = ""; // original input
let email = ""; // final e-mail
let username = ""; // username if provided
/* ---------- dom helpers ---------- */
const $ = (id) => document.getElementById(id);
const err = (id, m) => ($(id).textContent = m || "");
const show = (p) => {
  document
    .querySelectorAll(".panel")
    .forEach((x) => x.classList.remove("active"));
  $(p).classList.add("active");
  document.querySelectorAll(".msg-err").forEach((x) => (x.textContent = ""));
};
const setLoading = (btn, on) => {
  btn.classList.toggle("loading", on);
  btn.disabled = on;
};

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user) {
    renderUser(session.user);
    show("home");
  } else show("check-user");
  bind();
});
/* ---------- events ---------- */
function bind() {
  $("check-user-form").onsubmit = checkUser;
  $("login-form").onsubmit = login;
  $("signup-form").onsubmit = signup;
  $("otp-form").onsubmit = verifyOtp;
  $("otp-resend").onclick = resendOtp;
  $("logout").onclick = logout;
  $("back-login").onclick = () => show("check-user");
  $("back-signup").onclick = () => show("check-user");
  $("su-pwd2").oninput = matchPwds;
  $("otp-code").oninput = (e) =>
    (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6));
}
/* ---------- 1. decide login vs signup ---------- */
async function checkUser(e) {
  e.preventDefault();
  rawId = $("id-field").value.trim();
  if (!rawId) {
    err("check-err", "Enter email or username");
    return;
  }
  const btn = e.target.querySelector("button");
  setLoading(btn, true);
  try {
    const isMail = rawId.includes("@");
    let exists = false;
    if (isMail) {
      const { data, error } = await sb.rpc("user_exists_by_email", {
        email_input: rawId,
      });
      if (error) throw error;
      exists = data;
      email = rawId;
    } else {
      const { data, error } = await sb.rpc("get_user_by_username", {
        username_input: rawId,
      });
      if (error) throw error;
      exists = !!data?.length;
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
  } catch (x) {
    console.error(x);
    err("check-err", "Unable to check user");
  }
  setLoading(btn, false);
}
/* ---------- 2. login ---------- */
async function login(e) {
  e.preventDefault();
  const pwd = $("login-pwd").value;
  if (!pwd) {
    err("login-err", "Enter password");
    return;
  }
  const btn = e.target.querySelector("button");
  setLoading(btn, true);
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: pwd,
  });
  if (error) {
    err("login-err", error.message);
  } else {
    renderUser(data.user);
    show("home");
  }
  setLoading(btn, false);
}
/* ---------- 3. signup ---------- */
async function signup(e) {
  e.preventDefault();
  username = $("su-username").value.trim();
  const p1 = $("su-pwd").value,
    p2 = $("su-pwd2").value;
  if (!username) {
    err("signup-err", "Enter username");
    return;
  }
  if (p1.length < 6) {
    err("signup-err", "Password ≥6 chars");
    return;
  }
  if (p1 !== p2) {
    err("signup-err", "Passwords do not match");
    return;
  }
  if (!email) {
    const ask = prompt("Email address?");
    if (!ask?.includes("@")) {
      err("signup-err", "Valid email required");
      return;
    }
    email = ask.trim();
  }
  const btn = e.target.querySelector("button");
  setLoading(btn, true);
  const { data, error } = await sb.auth.signUp({
    email,
    password: p1,
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
/* ---------- 4. verify otp ---------- */
async function verifyOtp(e) {
  e.preventDefault();
  const code = $("otp-code").value.trim();
  if (code.length !== 6) {
    err("otp-err", "6-digit code");
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
/* ---------- resend otp ---------- */
async function resendOtp() {
  const a = $("otp-resend");
  a.textContent = "Sending…";
  a.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) err("otp-err", "Couldn’t resend");
  else {
    a.textContent = "Code sent!";
    setTimeout(() => (a.textContent = "Resend code"), 3000);
  }
  a.disabled = false;
}
/* ---------- dashboard ---------- */
function renderUser(u) {
  $("u-mail").textContent = u.email;
  $("u-name").textContent = u.user_metadata?.username || "–";
  $("u-date").textContent = new Date(u.created_at).toLocaleDateString();
}
/* ---------- logout ---------- */
async function logout() {
  await sb.auth.signOut();
  document.querySelectorAll("form").forEach((f) => f.reset());
  rawId = email = username = "";
  show("check-user");
}
/* ---------- helpers ---------- */
function matchPwds() {
  const a = $("su-pwd").value,
    b = $("su-pwd2").value;
  err("signup-err", a && b && a !== b ? "Passwords do not match" : "");
}
