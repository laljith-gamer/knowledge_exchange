const sb = window.supabaseClient;

/* ---------- state ---------- */
let rawId = ""; // as typed
let email = "";
let uname = "";
let isNewSignup = false; // track if this is a new signup flow

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
    // Check if user has completed profile setup
    const hasUsername = session.user.user_metadata?.username;
    if (!hasUsername && session.user.email_confirmed_at) {
      // User verified email but hasn't completed profile
      email = session.user.email;
      isNewSignup = true;
      show("step-profile");
    } else {
      drawUser(session.user);
      show("step-home");
    }
  } else show("step-check");
  bindEvents();
});

/* ---------- events ---------- */
function bindEvents() {
  $("form-check").onsubmit = onCheck;
  $("form-login").onsubmit = onLogin;
  $("form-signup").onsubmit = onSignup;
  $("form-otp").onsubmit = onVerify;
  $("form-profile").onsubmit = onCompleteProfile; // NEW
  $("otp-resend").onclick = resendOtp;
  $("logout").onclick = logout;

  $("back-login").onclick = () => show("step-check");
  $("back-signup").onclick = () => show("step-check");

  // Password matching for profile completion
  $("profile-pass2").oninput = () => matchProfilePwds();
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
      isNewSignup = true;
      $("signup-label").textContent = email
        ? `Create account for ${email}`
        : `We need your email address to continue`;

      if (!email) {
        // If username was entered, ask for email
        const ask = prompt("Enter your email address:");
        if (!ask?.includes("@")) {
          setErr("err-check", "Valid email required");
          spinner(btn, false);
          return;
        }
        email = ask.trim();
        $("signup-label").textContent = `Create account for ${email}`;
      }
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

/* ---------- 3 • signup (modified) ---------- */
async function onSignup(e) {
  e.preventDefault();

  if (!email) {
    setErr("err-signup", "Email address required");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true);

  // Send OTP without creating full account yet
  const { data, error } = await sb.auth.signInWithOtp({
    email: email,
    options: {
      shouldCreateUser: true,
    },
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
    if (isNewSignup) {
      // New signup - go to profile completion
      show("step-profile");
    } else {
      // Existing user login
      drawUser(data.user);
      show("step-home");
    }
  }
  spinner(btn, false);
}

/* ---------- 5 • complete profile (NEW) ---------- */
async function onCompleteProfile(e) {
  e.preventDefault();
  uname = $("profile-user").value.trim();
  const p1 = $("profile-pass").value;
  const p2 = $("profile-pass2").value;

  if (!uname) {
    setErr("err-profile", "Enter username");
    return;
  }
  if (uname.length < 3) {
    setErr("err-profile", "Username must be at least 3 characters");
    return;
  }
  if (p1.length < 6) {
    setErr("err-profile", "Password must be at least 6 characters");
    return;
  }
  if (p1 !== p2) {
    setErr("err-profile", "Passwords do not match");
    return;
  }

  const btn = e.target.querySelector("button");
  spinner(btn, true);

  try {
    // Check if username is available
    const { data: existingUser, error: checkError } = await sb.rpc(
      "get_user_by_username",
      {
        username_input: uname,
      }
    );

    if (checkError) throw checkError;

    if (existingUser && existingUser.length > 0) {
      setErr("err-profile", "Username already taken");
      spinner(btn, false);
      return;
    }

    // Update user password and metadata
    const { data, error } = await sb.auth.updateUser({
      password: p1,
      data: { username: uname },
    });

    if (error) {
      setErr("err-profile", error.message);
    } else {
      isNewSignup = false;
      drawUser(data.user);
      show("step-home");
    }
  } catch (x) {
    console.error(x);
    setErr("err-profile", "Unable to complete registration");
  }

  spinner(btn, false);
}

/* ---------- resend OTP ---------- */
async function resendOtp() {
  const link = $("otp-resend");
  link.disabled = true;
  link.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) setErr("err-otp", "Couldn't resend");
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
  isNewSignup = false;
  show("step-check");
}

/* ---------- misc ---------- */
function matchProfilePwds() {
  const a = $("profile-pass").value;
  const b = $("profile-pass2").value;
  setErr("err-profile", a && b && a !== b ? "Passwords do not match" : "");
}
