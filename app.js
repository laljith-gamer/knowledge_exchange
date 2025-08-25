/*  app.js – dynamic login / signup / OTP  */

/* ⚠️ Required SQL helpers (execute once in Supabase SQL editor):

-- check by e-mail
create or replace function user_exists_by_email(email_input text)
returns boolean language sql security definer as $$
select exists(select 1 from auth.users
              where lower(email)=lower(email_input));
$$;

-- find e-mail by username
create or replace function get_user_by_username(username_input text)
returns table(email text) language sql security definer as $$
begin
  return query
  select auth.users.email::text
  from auth.users
  where auth.users.raw_user_meta_data ->> 'username' = username_input
  limit 1;
end;
$$;
*/

const sb = window.supabaseClient;

/* ---------- state ---------- */
let rawId = ""; // as typed
let email = "";
let uname = "";

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const setErr = (id, msg = "") => {
  $(id).textContent = msg;
};
const show = (step) => {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  $(step).classList.add("active");
  document.querySelectorAll(".error").forEach((e) => (e.textContent = ""));
};
const spinner = (btn, on) => {
  btn.classList.toggle("loading", on);
  btn.disabled = on;
};

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user) {
    drawUser(session.user);
    show("step-home");
  } else show("step-check");
  bindEvents();
});

/* ---------- events ---------- */
function bindEvents() {
  $("form-check").onsubmit = onCheck;
  $("form-login").onsubmit = onLogin;
  $("form-signup").onsubmit = onSignup;
  $("form-otp").onsubmit = onVerify;
  $("otp-resend").onclick = resendOtp;
  $("logout").onclick = logout;

  $("back-login").onclick = () => show("step-check");
  $("back-signup").onclick = () => show("step-check");

  $("su-pass2").oninput = () => matchPwds();
  $("otp-code").oninput = (e) =>
    (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6));
}

/* ---------- 1 • detect user ---------- */
async function onCheck(e) {
  e.preventDefault();
  rawId = $("input-id").value.trim();

  if (!rawId) {
    setErr("err-check", "Enter email or username");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true);
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
      exists = !!data.length;
      email = data[0]?.email || "";
      uname = rawId;
    }

    if (exists && email) {
      $("login-label").textContent = `Account: ${email}`;
      show("step-login");
    } else {
      $("signup-label").textContent = email
        ? `Create account for ${email}`
        : `Username: ${uname}`;
      show("step-signup");
    }
  } catch (x) {
    console.error(x);
    setErr("err-check", "Unable to check user");
  }
  spinner(btn, false);
}

/* ---------- 2 • login ---------- */
async function onLogin(e) {
  e.preventDefault();
  const pwd = $("login-pass").value;
  if (!pwd) {
    setErr("err-login", "Enter password");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true);
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: pwd,
  });
  if (error) {
    setErr("err-login", error.message);
  } else {
    drawUser(data.user);
    show("step-home");
  }
  spinner(btn, false);
}

/* ---------- 3 • signup ---------- */
async function onSignup(e) {
  e.preventDefault();
  uname = $("su-user").value.trim();
  const p1 = $("su-pass").value,
    p2 = $("su-pass2").value;

  if (!uname) {
    setErr("err-signup", "Enter username");
    return;
  }
  if (p1.length < 6) {
    setErr("err-signup", "Password ≥6 chars");
    return;
  }
  if (p1 !== p2) {
    setErr("err-signup", "Passwords do not match");
    return;
  }

  if (!email) {
    const ask = prompt("Email address?");
    if (!ask?.includes("@")) {
      setErr("err-signup", "Valid email required");
      return;
    }
    email = ask.trim();
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true);
  const { data, error } = await sb.auth.signUp({
    email,
    password: p1,
    options: { data: { username: uname } },
  });
  if (error) {
    setErr("err-signup", error.message);
  } else {
    $("otp-mail").textContent = email;
    show("step-otp");
  }
  spinner(btn, false);
}

/* ---------- 4 • verify OTP ---------- */
async function onVerify(e) {
  e.preventDefault();
  const code = $("otp-code").value.trim();
  if (code.length !== 6) {
    setErr("err-otp", "6-digit code");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true);
  const { data, error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) {
    setErr("err-otp", error.message);
  } else {
    drawUser(data.user);
    show("step-home");
  }
  spinner(btn, false);
}

/* ---------- resend OTP ---------- */
async function resendOtp() {
  const link = $("otp-resend");
  link.disabled = true;
  link.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) setErr("err-otp", "Couldn’t resend");
  else {
    link.textContent = "Code sent!";
    setTimeout(() => (link.textContent = "Resend code"), 3000);
  }
  link.disabled = false;
}

/* ---------- dashboard ---------- */
function drawUser(u) {
  $("u-mail").textContent = u.email;
  $("u-name").textContent = u.user_metadata?.username || "–";
  $("u-date").textContent = new Date(u.created_at).toLocaleDateString();
}

/* ---------- logout ---------- */
async function logout() {
  await sb.auth.signOut();
  document.querySelectorAll("form").forEach((f) => f.reset());
  rawId = email = uname = "";
  show("step-check");
}

/* ---------- misc ---------- */
function matchPwds() {
  const a = $("su-pass").value,
    b = $("su-pass2").value;
  setErr("err-signup", a && b && a !== b ? "Passwords do not match" : "");
}
