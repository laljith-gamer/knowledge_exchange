// Global variables
let currentEmail = "";
let currentUsername = "";
let pendingSignup = false;
let pendingMagicLink = "";

// DOM elements
const sections = {
  checkUser: document.getElementById("check-user-section"),
  login: document.getElementById("login-section"),
  signup: document.getElementById("signup-section"),
  magicLink: document.getElementById("magic-link-section"),
  magicLinkSent: document.getElementById("magic-link-sent-section"),
  otp: document.getElementById("otp-section"),
  home: document.getElementById("home-section"),
};

// Initialize app
document.addEventListener("DOMContentLoaded", async () => {
  await checkAuthState();
  setupEventListeners();
  handleAuthCallback();
});

// Handle auth callback (for magic links)
async function handleAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const accessToken = urlParams.get("access_token");
  const refreshToken = urlParams.get("refresh_token");

  if (accessToken && refreshToken) {
    try {
      const { data, error } = await supabaseClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("Session error:", error);
        return;
      }

      if (data.user) {
        // Clear URL parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        showSection("home");
        displayUserInfo(data.user);
      }
    } catch (error) {
      console.error("Auth callback error:", error);
    }
  }
}

// Check if user is already logged in
async function checkAuthState() {
  try {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      return;
    }

    if (session && session.user) {
      showSection("home");
      displayUserInfo(session.user);
    } else {
      showSection("checkUser");
    }
  } catch (error) {
    console.error("Auth check error:", error);
    showSection("checkUser");
  }
}

// Setup event listeners
function setupEventListeners() {
  // Check user form
  document
    .getElementById("check-user-form")
    .addEventListener("submit", handleCheckUser);
  document
    .getElementById("magic-link-option")
    .addEventListener("click", () => showSection("magicLink"));

  // Login form
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document
    .getElementById("login-magic-link")
    .addEventListener("click", handleLoginMagicLink);
  document
    .getElementById("back-to-check")
    .addEventListener("click", () => showSection("checkUser"));

  // Signup form
  document
    .getElementById("signup-form")
    .addEventListener("submit", handleSignup);
  document
    .getElementById("back-to-check-signup")
    .addEventListener("click", () => showSection("checkUser"));

  // Magic link form
  document
    .getElementById("magic-link-form")
    .addEventListener("submit", handleMagicLinkRequest);
  document
    .getElementById("back-to-check-magic")
    .addEventListener("click", () => showSection("checkUser"));

  // Magic link sent actions
  document
    .getElementById("resend-magic-link")
    .addEventListener("click", resendMagicLink);
  document
    .getElementById("back-to-magic-form")
    .addEventListener("click", () => showSection("magicLink"));

  // OTP form
  document
    .getElementById("otp-form")
    .addEventListener("submit", handleOTPVerification);
  document.getElementById("resend-otp").addEventListener("click", resendOTP);

  // Logout
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Auto-format OTP input
  document.getElementById("otp-code").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
  });

  // Password confirmation validation
  document
    .getElementById("confirm-password")
    .addEventListener("input", validatePasswordMatch);
}

// Show specific section
function showSection(sectionName) {
  Object.values(sections).forEach((section) => {
    section.classList.remove("active");
  });
  sections[sectionName].classList.add("active");

  // Clear error messages
  clearErrors();
}

// Clear all error messages
function clearErrors() {
  document
    .querySelectorAll(".error-message")
    .forEach((el) => (el.textContent = ""));
}

// Show error message
function showError(elementId, message) {
  document.getElementById(elementId).textContent = message;
}

// Check if user exists
async function handleCheckUser(e) {
  e.preventDefault();

  const emailUsername = document.getElementById("email-username").value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!emailUsername) {
    showError("check-error", "Please enter email or username");
    return;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const isEmail = emailUsername.includes("@");
    let userExists = false;
    let userEmail = "";

    if (isEmail) {
      // Check if email exists by attempting to sign in with a dummy password
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: emailUsername,
        password: "dummy-password-check",
      });

      // If error is not "Invalid login credentials", user exists
      userExists = error && error.message !== "Invalid login credentials";
      userEmail = emailUsername;
    } else {
      // Search for username in user metadata
      const { data, error } = await supabaseClient.rpc("get_user_by_username", {
        username_input: emailUsername,
      });

      if (!error && data && data.length > 0) {
        userExists = true;
        userEmail = data[0].email;
      } else {
        userExists = false;
        userEmail = "";
      }
    }

    currentEmail = userEmail || emailUsername;
    currentUsername = !isEmail ? emailUsername : "";

    if (userExists && userEmail) {
      // User exists, show login
      document.getElementById(
        "login-email"
      ).textContent = `Welcome back! Please enter your password for ${userEmail}`;
      showSection("login");
    } else {
      // New user, show signup
      if (isEmail) {
        document.getElementById(
          "signup-email"
        ).textContent = `Create account for ${emailUsername}`;
        currentEmail = emailUsername;
      } else {
        document.getElementById(
          "signup-email"
        ).textContent = `Create account with username: ${emailUsername}`;
        currentUsername = emailUsername;
      }
      showSection("signup");
    }
  } catch (error) {
    console.error("Check user error:", error);
    showError("check-error", "Something went wrong. Please try again.");
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
}

// Handle login
async function handleLogin(e) {
  e.preventDefault();

  const password = document.getElementById("login-password").value;
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!password) {
    showError("login-error", "Please enter your password");
    return;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: currentEmail,
      password: password,
    });

    if (error) {
      showError("login-error", error.message);
      return;
    }

    if (data.user) {
      showSection("home");
      displayUserInfo(data.user);
    }
  } catch (error) {
    console.error("Login error:", error);
    showError("login-error", "Login failed. Please try again.");
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
}

// Handle login magic link
async function handleLoginMagicLink() {
  const btn = document.getElementById("login-magic-link");
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    await sendMagicLink(currentEmail);
    pendingMagicLink = currentEmail;
    document.getElementById("magic-sent-email").textContent = currentEmail;
    showSection("magicLinkSent");
  } catch (error) {
    showError("login-error", "Failed to send magic link. Please try again.");
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// Handle signup
async function handleSignup(e) {
  e.preventDefault();

  const username = document.getElementById("signup-username").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const submitBtn = e.target.querySelector('button[type="submit"]');

  // Validation
  if (!username) {
    showError("signup-error", "Please enter a username");
    return;
  }

  if (!password || password.length < 6) {
    showError("signup-error", "Password must be at least 6 characters");
    return;
  }

  if (password !== confirmPassword) {
    showError("signup-error", "Passwords do not match");
    return;
  }

  // If currentEmail is not set (username was entered), ask for email
  if (!currentEmail || !currentEmail.includes("@")) {
    const email = prompt("Please enter your email address:");
    if (!email || !email.includes("@")) {
      showError("signup-error", "Valid email address is required");
      return;
    }
    currentEmail = email;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    // Sign up user
    const { data, error } = await supabaseClient.auth.signUp({
      email: currentEmail,
      password: password,
      options: {
        data: {
          username: username,
        },
      },
    });

    if (error) {
      showError("signup-error", error.message);
      return;
    }

    if (data.user) {
      currentUsername = username;
      pendingSignup = true;

      // Show OTP verification
      document.getElementById("otp-email").textContent = currentEmail;
      showSection("otp");
    }
  } catch (error) {
    console.error("Signup error:", error);
    showError("signup-error", "Signup failed. Please try again.");
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
}

// Handle magic link request
async function handleMagicLinkRequest(e) {
  e.preventDefault();

  const email = document.getElementById("magic-link-email").value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!email) {
    showError("magic-link-error", "Please enter your email address");
    return;
  }

  if (!email.includes("@")) {
    showError("magic-link-error", "Please enter a valid email address");
    return;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    await sendMagicLink(email);
    pendingMagicLink = email;
    document.getElementById("magic-sent-email").textContent = email;
    showSection("magicLinkSent");
  } catch (error) {
    showError(
      "magic-link-error",
      error.message || "Failed to send magic link. Please try again."
    );
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
}

// Send magic link
async function sendMagicLink(email) {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }
}

// Resend magic link
async function resendMagicLink() {
  const btn = document.getElementById("resend-magic-link");
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    await sendMagicLink(pendingMagicLink);
    // Show success message temporarily
    const originalText = btn.textContent;
    btn.textContent = "Magic Link Sent!";
    setTimeout(() => {
      btn.textContent = originalText;
    }, 3000);
  } catch (error) {
    showError(
      "magic-sent-error",
      "Failed to resend magic link. Please try again."
    );
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// Handle OTP verification
async function handleOTPVerification(e) {
  e.preventDefault();

  const otpCode = document.getElementById("otp-code").value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!otpCode || otpCode.length !== 6) {
    showError("otp-error", "Please enter a valid 6-digit code");
    return;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: currentEmail,
      token: otpCode,
      type: "email",
    });

    if (error) {
      showError("otp-error", error.message);
      return;
    }

    if (data.user) {
      showSection("home");
      displayUserInfo(data.user);
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    showError("otp-error", "Verification failed. Please try again.");
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
}

// Resend OTP
async function resendOTP() {
  const resendBtn = document.getElementById("resend-otp");
  resendBtn.disabled = true;
  resendBtn.textContent = "Sending...";

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: currentEmail,
    });

    if (error) {
      showError("otp-error", "Failed to resend code. Please try again.");
    } else {
      showError("otp-error", "");
      // Show success message temporarily
      const originalText = resendBtn.textContent;
      resendBtn.textContent = "Code sent!";
      setTimeout(() => {
        resendBtn.textContent = "Resend Code";
      }, 3000);
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    showError("otp-error", "Failed to resend code. Please try again.");
  } finally {
    resendBtn.disabled = false;
    setTimeout(() => {
      if (resendBtn.textContent === "Sending...") {
        resendBtn.textContent = "Resend Code";
      }
    }, 2000);
  }
}

// Display user information
function displayUserInfo(user) {
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-username").textContent =
    user.user_metadata?.username || "Not set";
  document.getElementById("user-created").textContent = new Date(
    user.created_at
  ).toLocaleDateString();
}

// Handle logout
async function handleLogout() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error("Logout error:", error);
      return;
    }

    // Reset variables
    currentEmail = "";
    currentUsername = "";
    pendingSignup = false;
    pendingMagicLink = "";

    // Clear forms
    document.querySelectorAll("form").forEach((form) => form.reset());

    // Show initial section
    showSection("checkUser");
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// Validate password match
function validatePasswordMatch() {
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const errorElement = document.getElementById("signup-error");

  if (confirmPassword && password !== confirmPassword) {
    errorElement.textContent = "Passwords do not match";
  } else {
    errorElement.textContent = "";
  }
}
