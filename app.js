// Supabase Configuration
const SUPABASE_URL = "https://lnmrfqiozzmjbrugnpep.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubXJmcWlvenptamJydWducGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzg4MjAsImV4cCI6MjA2OTg1NDgyMH0.CUxbI2BWeQv-u0-IEuef7BtgfW98k23Apmj3zayth6k";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global variables
let currentUserEmail = "";
let currentUser = null;
let otpRetryCount = 0;
let otpTimer = null;
let otpTimeLeft = 300;
const MAX_OTP_RETRIES = 3;

// Toast notification system
class ToastManager {
  constructor() {
    this.container = document.getElementById("toastContainer");
    this.toasts = [];
  }

  show(type, title, message, duration = 5000) {
    const toast = this.createToast(type, title, message);
    this.container.appendChild(toast);
    this.toasts.push(toast);
    setTimeout(() => this.remove(toast), duration);
    return toast;
  }

  createToast(type, title, message) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const iconMap = {
      success: "✓",
      error: "✗",
      info: "ℹ",
    };
    toast.innerHTML = `
            <div class="toast-icon">${iconMap[type] || "ℹ"}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="toastManager.remove(this.parentElement)">×</button>
        `;
    return toast;
  }

  remove(toast) {
    if (toast && toast.parentElement) {
      toast.style.animation = "slideOutRight 0.3s ease forwards";
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
        this.toasts = this.toasts.filter((t) => t !== toast);
      }, 300);
    }
  }
}

const toastManager = new ToastManager();

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Application initialized");

  // Check for URL parameters (password reset, email verification)
  const urlParams = new URLSearchParams(window.location.hash.substring(1));
  const type = urlParams.get("type");
  const accessToken = urlParams.get("access_token");
  const refreshToken = urlParams.get("refresh_token");

  if (type === "recovery" && accessToken) {
    // Handle password reset
    await handlePasswordReset(accessToken, refreshToken);
    return;
  }

  // Check if user is already logged in
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showHome();
  } else {
    showLogin();
  }

  initializeEventListeners();
  initializePasswordStrength();
});

// Handle password reset from email link
async function handlePasswordReset(accessToken, refreshToken) {
  try {
    // Set the session with the tokens from URL
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error("Error setting session:", error);
      showError(
        "Invalid Reset Link",
        "This password reset link is invalid or has expired. Please request a new one."
      );
      return;
    }

    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    // Show reset password form
    showResetPassword();
    toastManager.show(
      "success",
      "Reset Link Verified",
      "You can now set your new password"
    );
  } catch (error) {
    console.error("Password reset error:", error);
    showError(
      "Reset Failed",
      "Unable to process your password reset request. Please try again."
    );
  }
}

// Initialize event listeners
function initializeEventListeners() {
  // Login form
  document.getElementById("loginForm")?.addEventListener("submit", handleLogin);

  // Signup form
  document
    .getElementById("signupForm")
    ?.addEventListener("submit", handleSignup);

  // OTP form
  document
    .getElementById("otpForm")
    ?.addEventListener("submit", handleOTPVerification);

  // Forgot password form
  document
    .getElementById("forgotPasswordForm")
    ?.addEventListener("submit", handleForgotPassword);

  // Reset password form
  document
    .getElementById("resetPasswordForm")
    ?.addEventListener("submit", handleResetPassword);

  // OTP input handling
  initializeOTPInputs();

  // Auth state listener
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth state changed:", event, session);

    if (event === "SIGNED_IN") {
      currentUser = session.user;
      showHome();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      showLogin();
    }
  });
}

// Login handler
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    toastManager.show(
      "error",
      "Missing Information",
      "Please fill in all fields"
    );
    return;
  }

  showLoading("Signing you in...");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        toastManager.show(
          "error",
          "Login Failed",
          "Invalid email or password. Please try again."
        );
      } else if (error.message.includes("Email not confirmed")) {
        currentUserEmail = email;
        showEmailVerification();
        toastManager.show(
          "info",
          "Email Not Verified",
          "Please check your email and click the verification link before signing in."
        );
      } else {
        toastManager.show("error", "Login Failed", error.message);
      }
      return;
    }

    currentUser = data.user;
    toastManager.show(
      "success",
      "Welcome Back!",
      `Good to see you again, ${data.user.email}`
    );
  } catch (error) {
    console.error("Login error:", error);
    toastManager.show(
      "error",
      "Login Failed",
      "An unexpected error occurred. Please try again."
    );
  } finally {
    hideLoading();
  }
}

// Signup handler
async function handleSignup(e) {
  e.preventDefault();

  const fullName = document.getElementById("signupFullName").value;
  const username = document.getElementById("signupUsername").value;
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  if (!fullName || !username || !email || !password) {
    toastManager.show(
      "error",
      "Missing Information",
      "Please fill in all fields"
    );
    return;
  }

  if (password.length < 8) {
    toastManager.show(
      "error",
      "Weak Password",
      "Password must be at least 8 characters long"
    );
    return;
  }

  showLoading("Creating your account...");

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          username: username,
        },
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        toastManager.show(
          "error",
          "Email Already Exists",
          "This email is already registered. Try signing in instead."
        );
      } else {
        toastManager.show("error", "Signup Failed", error.message);
      }
      return;
    }

    currentUserEmail = email;
    showEmailVerification();
    toastManager.show(
      "success",
      "Account Created!",
      "Please check your email to verify your account"
    );
  } catch (error) {
    console.error("Signup error:", error);
    toastManager.show(
      "error",
      "Signup Failed",
      "An unexpected error occurred. Please try again."
    );
  } finally {
    hideLoading();
  }
}

// Forgot password handler
async function handleForgotPassword(e) {
  e.preventDefault();

  const email = document.getElementById("forgotEmail").value;

  if (!email) {
    toastManager.show(
      "error",
      "Email Required",
      "Please enter your email address"
    );
    return;
  }

  showLoading("Sending reset link...");

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });

    if (error) {
      toastManager.show("error", "Reset Failed", error.message);
      return;
    }

    toastManager.show(
      "success",
      "Reset Link Sent!",
      `Check your email at ${email} for the password reset link`
    );
    showLogin();
  } catch (error) {
    console.error("Forgot password error:", error);
    toastManager.show(
      "error",
      "Reset Failed",
      "Unable to send reset email. Please try again."
    );
  } finally {
    hideLoading();
  }
}

// Reset password handler
async function handleResetPassword(e) {
  e.preventDefault();

  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!newPassword || !confirmPassword) {
    toastManager.show(
      "error",
      "Missing Information",
      "Please fill in both password fields"
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    toastManager.show(
      "error",
      "Passwords Don't Match",
      "Please make sure both passwords are identical"
    );
    return;
  }

  if (!isPasswordStrong(newPassword)) {
    toastManager.show(
      "error",
      "Weak Password",
      "Please meet all password requirements"
    );
    return;
  }

  showLoading("Updating your password...");

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toastManager.show("error", "Update Failed", error.message);
      return;
    }

    toastManager.show(
      "success",
      "Password Updated!",
      "Your password has been successfully changed"
    );
    showSuccess();
    startCountdown();
  } catch (error) {
    console.error("Reset password error:", error);
    toastManager.show(
      "error",
      "Update Failed",
      "Unable to update password. Please try again."
    );
  } finally {
    hideLoading();
  }
}

// OTP verification handler
async function handleOTPVerification(e) {
  e.preventDefault();

  const otpInputs = document.querySelectorAll(".otp-input");
  const otpCode = Array.from(otpInputs)
    .map((input) => input.value)
    .join("");

  if (otpCode.length !== 6) {
    toastManager.show(
      "error",
      "Incomplete Code",
      "Please enter the complete 6-digit code"
    );
    otpInputs.forEach((input) => input.classList.add("error"));
    setTimeout(() => {
      otpInputs.forEach((input) => input.classList.remove("error"));
    }, 2000);
    return;
  }

  showLoading("Verifying code...");

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: currentUserEmail,
      token: otpCode,
      type: "signup",
    });

    if (error) {
      toastManager.show(
        "error",
        "Invalid Code",
        "The code you entered is incorrect or has expired"
      );
      otpInputs.forEach((input) => {
        input.classList.add("error");
        input.value = "";
      });
      setTimeout(() => {
        otpInputs.forEach((input) => input.classList.remove("error"));
      }, 2000);
      return;
    }

    currentUser = data.user;
    toastManager.show("success", "Account Verified!", "Welcome to SkillShare!");
  } catch (error) {
    console.error("OTP verification error:", error);
    toastManager.show(
      "error",
      "Verification Failed",
      "An unexpected error occurred. Please try again."
    );
  } finally {
    hideLoading();
  }
}

// Page navigation functions
function showLogin() {
  showPage("loginPage");
  document.getElementById("loginForm").reset();
}

function showSignup() {
  showPage("signupPage");
  document.getElementById("signupForm").reset();
}

function showEmailVerification() {
  showPage("verificationPage");
  document.getElementById("verificationEmail").textContent = currentUserEmail;
}

function showOTPVerification() {
  showPage("otpPage");
  document.getElementById("otpEmail").textContent = currentUserEmail;
  startOTPTimer();
  focusFirstOTPInput();
}

function showForgotPassword() {
  showPage("forgotPasswordPage");
  document.getElementById("forgotPasswordForm").reset();
}

function showResetPassword() {
  showPage("resetPasswordPage");
  document.getElementById("resetPasswordForm").reset();
  initializePasswordRequirements();
}

function showSuccess() {
  showPage("successPage");
}

function showError(title, message) {
  document.getElementById("errorTitle").textContent = title;
  document.getElementById("errorMessage").textContent = message;
  showPage("errorPage");
}

function showHome() {
  showPage("homePage");
}

function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll(".page-section").forEach((page) => {
    page.classList.remove("active");
  });

  // Show target page
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add("active");
  }
}

// Password strength checker
function initializePasswordStrength() {
  const signupPassword = document.getElementById("signupPassword");
  const newPassword = document.getElementById("newPassword");

  if (signupPassword) {
    signupPassword.addEventListener("input", (e) =>
      updatePasswordStrength(
        e.target,
        "passwordStrength",
        "strengthFill",
        "strengthText"
      )
    );
  }

  if (newPassword) {
    newPassword.addEventListener("input", (e) => {
      updatePasswordStrength(
        e.target,
        "newPasswordStrength",
        "newStrengthFill",
        "newStrengthText"
      );
      updatePasswordRequirements(e.target.value);
    });
  }
}

function updatePasswordStrength(input, strengthId, fillId, textId) {
  const password = input.value;
  const strengthContainer = document.getElementById(strengthId);
  const strengthFill = document.getElementById(fillId);
  const strengthText = document.getElementById(textId);

  if (!password) {
    strengthContainer.classList.add("hidden");
    return;
  }

  strengthContainer.classList.remove("hidden");

  const strength = calculatePasswordStrength(password);
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  strengthFill.style.width = `${(strength + 1) * 25}%`;
  strengthFill.style.backgroundColor = colors[strength];
  strengthText.textContent = labels[strength];
}

function calculatePasswordStrength(password) {
  let score = 0;

  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  return Math.min(score - 1, 3);
}

function isPasswordStrong(password) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

// Password requirements checker
function initializePasswordRequirements() {
  const newPassword = document.getElementById("newPassword");
  if (newPassword) {
    newPassword.addEventListener("input", (e) =>
      updatePasswordRequirements(e.target.value)
    );
  }
}

function updatePasswordRequirements(password) {
  const requirements = [
    { id: "req-length", test: password.length >= 8 },
    { id: "req-upper", test: /[A-Z]/.test(password) },
    { id: "req-lower", test: /[a-z]/.test(password) },
    { id: "req-number", test: /[0-9]/.test(password) },
    { id: "req-special", test: /[^A-Za-z0-9]/.test(password) },
  ];

  requirements.forEach((req) => {
    const element = document.getElementById(req.id);
    if (element) {
      if (req.test) {
        element.classList.add("valid");
        element.classList.remove("invalid");
        element.innerHTML = '<i class="fas fa-check"></i>';
      } else {
        element.classList.add("invalid");
        element.classList.remove("valid");
        element.innerHTML = '<i class="fas fa-times"></i>';
      }
    }
  });
}

// OTP input handling
function initializeOTPInputs() {
  const otpInputs = document.querySelectorAll(".otp-input");

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;

      // Remove non-numeric characters
      e.target.value = value.replace(/[^0-9]/g, "");

      if (e.target.value) {
        e.target.classList.add("filled");

        // Move to next input
        if (index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        }
      } else {
        e.target.classList.remove("filled");
      }
    });

    input.addEventListener("keydown", (e) => {
      // Handle backspace
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
        otpInputs[index - 1].value = "";
        otpInputs[index - 1].classList.remove("filled");
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData
        .getData("text")
        .replace(/[^0-9]/g, "")
        .slice(0, 6);

      pastedData.split("").forEach((digit, i) => {
        if (otpInputs[i]) {
          otpInputs[i].value = digit;
          otpInputs[i].classList.add("filled");
        }
      });

      // Focus last filled input or next empty one
      const lastIndex = Math.min(pastedData.length, otpInputs.length - 1);
      otpInputs[lastIndex].focus();
    });
  });
}

function focusFirstOTPInput() {
  const firstInput = document.querySelector(".otp-input");
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }
}

// OTP timer
function startOTPTimer() {
  otpTimeLeft = 300; // 5 minutes
  updateTimerDisplay();

  if (otpTimer) {
    clearInterval(otpTimer);
  }

  otpTimer = setInterval(() => {
    otpTimeLeft--;
    updateTimerDisplay();

    if (otpTimeLeft <= 0) {
      clearInterval(otpTimer);
      toastManager.show(
        "error",
        "Code Expired",
        "The verification code has expired. Please request a new one."
      );
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerElement = document.getElementById("timer");
  if (timerElement) {
    const minutes = Math.floor(otpTimeLeft / 60);
    const seconds = otpTimeLeft % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
}

// Success countdown
function startCountdown() {
  let countdown = 5;
  const countdownElement = document.getElementById("countdown");

  const timer = setInterval(() => {
    countdown--;
    if (countdownElement) {
      countdownElement.textContent = countdown;
    }

    if (countdown <= 0) {
      clearInterval(timer);
      showLogin();
    }
  }, 1000);
}

// Utility functions
function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  const icon = button.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loadingOverlay");
  const text = overlay.querySelector(".loading-text");
  if (text) {
    text.textContent = message;
  }
  overlay.classList.remove("hidden");
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  overlay.classList.add("hidden");
}

async function resendVerification() {
  if (!currentUserEmail) {
    toastManager.show(
      "error",
      "No Email",
      "Please go back and enter your email address"
    );
    return;
  }

  showLoading("Resending verification email...");

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: currentUserEmail,
    });

    if (error) {
      toastManager.show("error", "Resend Failed", error.message);
      return;
    }

    toastManager.show(
      "success",
      "Email Sent!",
      "Check your email for the verification link"
    );
  } catch (error) {
    console.error("Resend verification error:", error);
    toastManager.show(
      "error",
      "Resend Failed",
      "Unable to resend email. Please try again."
    );
  } finally {
    hideLoading();
  }
}

async function resendOTP() {
  if (otpRetryCount >= MAX_OTP_RETRIES) {
    toastManager.show(
      "error",
      "Too Many Attempts",
      "Please wait before requesting another code"
    );
    return;
  }

  otpRetryCount++;
  showLoading("Sending new code...");

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: currentUserEmail,
    });

    if (error) {
      toastManager.show("error", "Resend Failed", error.message);
      return;
    }

    // Clear existing OTP inputs
    document.querySelectorAll(".otp-input").forEach((input) => {
      input.value = "";
      input.classList.remove("filled", "error");
    });

    toastManager.show(
      "success",
      "Code Sent!",
      "A new verification code has been sent"
    );
    startOTPTimer();
    focusFirstOTPInput();
  } catch (error) {
    console.error("Resend OTP error:", error);
    toastManager.show(
      "error",
      "Resend Failed",
      "Unable to send new code. Please try again."
    );
  } finally {
    hideLoading();
  }
}

async function logout() {
  showLoading("Signing out...");

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toastManager.show("error", "Logout Failed", error.message);
      return;
    }

    currentUser = null;
    currentUserEmail = "";

    // Clear any timers
    if (otpTimer) {
      clearInterval(otpTimer);
    }

    toastManager.show("success", "Signed Out", "Come back soon!");
  } catch (error) {
    console.error("Logout error:", error);
    toastManager.show("error", "Logout Failed", "Unable to sign out properly");
  } finally {
    hideLoading();
  }
}

// Enhanced animations
document.addEventListener("DOMContentLoaded", () => {
  // Add entrance animations to elements
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = "running";
      }
    });
  }, observerOptions);

  // Observe all animated elements
  document.querySelectorAll(".animate-fade-in").forEach((el) => {
    observer.observe(el);
  });
});
