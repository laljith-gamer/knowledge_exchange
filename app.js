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
      success:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>',
      error:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    toast.innerHTML = `
            <div class="toast-icon" style="color: ${
              type === "success"
                ? "#10b981"
                : type === "error"
                ? "#ef4444"
                : "#3b82f6"
            }">
                ${iconMap[type]}
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">×</button>
        `;

    toast
      .querySelector(".toast-close")
      .addEventListener("click", () => this.remove(toast));
    return toast;
  }

  remove(toast) {
    if (toast && toast.parentNode) {
      toast.style.transform = "translateX(100%)";
      toast.style.opacity = "0";
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        this.toasts = this.toasts.filter((t) => t !== toast);
      }, 300);
    }
  }

  clear() {
    this.toasts.forEach((toast) => this.remove(toast));
  }
}

const toast = new ToastManager();

// Page Navigation
function showPage(pageId) {
  console.log("Navigating to page:", pageId);

  const pages = document.querySelectorAll(".page-section");
  pages.forEach((page) => page.classList.remove("active"));

  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add("active");
    setupPageSpecificContent(pageId);
  }
}

function setupPageSpecificContent(pageId) {
  switch (pageId) {
    case "otpPage":
      setupOTPPage();
      break;
    case "profilePage":
      setupProfilePage();
      break;
    case "homePage":
      setupHomePage();
      break;
    case "forgotPasswordPage":
      const emailInput = document.getElementById("forgotPasswordEmail");
      if (emailInput) emailInput.focus();
      break;
  }
}

function setupOTPPage() {
  if (currentUserEmail) {
    const otpEmailElement = document.getElementById("otpEmail");
    if (otpEmailElement) {
      otpEmailElement.textContent = currentUserEmail;
    }
  }

  const firstOtpInput = document.querySelector(".otp-input");
  if (firstOtpInput) {
    firstOtpInput.focus();
  }

  startOTPTimer();
}

function setupProfilePage() {
  updateProfileProgress();
  setupProfileValidation();
}

function setupHomePage() {
  updateWelcomeMessage();
  setupHomeNavigation();
  setupUserMenu();
}

// Timer functionality
function startOTPTimer() {
  otpTimeLeft = 300;
  updateTimerDisplay();

  if (otpTimer) {
    clearInterval(otpTimer);
  }

  otpTimer = setInterval(() => {
    otpTimeLeft--;
    updateTimerDisplay();

    if (otpTimeLeft <= 0) {
      clearInterval(otpTimer);
      toast.show(
        "error",
        "Code Expired",
        "Your verification code has expired. Please request a new one."
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

    if (otpTimeLeft <= 60) {
      timerElement.style.color = "#ef4444";
    } else {
      timerElement.style.color = "#fbbf24";
    }
  }
}

// Loading states
function showLoadingOverlay(text = "Loading...") {
  const overlay = document.getElementById("loadingOverlay");
  const loadingText = document.querySelector(".loading-text");

  if (loadingText) loadingText.textContent = text;
  if (overlay) overlay.classList.remove("hidden");
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function showButtonLoader(buttonId, show = true) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  const btnText = button.querySelector(".btn-text");
  const btnLoader = button.querySelector(".btn-loader");

  if (show) {
    button.disabled = true;
    if (btnText) btnText.style.opacity = "0";
    if (btnLoader) btnLoader.classList.remove("hidden");
  } else {
    button.disabled = false;
    if (btnText) btnText.style.opacity = "1";
    if (btnLoader) btnLoader.classList.add("hidden");
  }
}

// Validation functions
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  return (
    usernameRegex.test(username) &&
    username.length >= 3 &&
    username.length <= 20
  );
}

function checkPasswordStrength(password) {
  let score = 0;
  let feedback = [];

  if (password.length >= 8) score += 1;
  else feedback.push("At least 8 characters");

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("One lowercase letter");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("One uppercase letter");

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push("One number");

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push("One special character");

  const strength = ["Very Weak", "Weak", "Fair", "Good", "Strong"][
    Math.min(score, 4)
  ];
  const colors = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#10b981"];

  return {
    score,
    strength,
    color: colors[Math.min(score, 4)],
    feedback: feedback.join(", "),
  };
}

// Profile validation setup
function setupProfileValidation() {
  const fullNameInput = document.getElementById("fullName");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  if (fullNameInput) {
    fullNameInput.addEventListener("input", updateProfileProgress);
  }

  if (usernameInput) {
    let usernameTimeout;
    usernameInput.addEventListener("input", (e) => {
      clearTimeout(usernameTimeout);
      const usernameCheck = document.querySelector(".username-check");

      usernameTimeout = setTimeout(async () => {
        const username = e.target.value.trim().toLowerCase();
        if (username.length >= 3 && validateUsername(username)) {
          try {
            const { data } = await supabase
              .from("profiles")
              .select("username")
              .eq("username", username)
              .single();

            if (data) {
              if (usernameCheck) usernameCheck.classList.add("hidden");
              toast.show(
                "error",
                "Username Taken",
                "This username is already taken. Please choose another."
              );
            } else {
              if (usernameCheck) usernameCheck.classList.remove("hidden");
            }
          } catch (error) {
            if (error.code === "PGRST116") {
              if (usernameCheck) usernameCheck.classList.remove("hidden");
            }
          }
        } else {
          if (usernameCheck) usernameCheck.classList.add("hidden");
        }
        updateProfileProgress();
      }, 500);
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener("input", (e) => {
      const password = e.target.value;
      const strengthResult = checkPasswordStrength(password);

      const strengthFill = document.getElementById("strengthFill");
      const strengthText = document.getElementById("strengthText");

      if (strengthFill) {
        strengthFill.style.width = `${(strengthResult.score / 5) * 100}%`;
        strengthFill.style.backgroundColor = strengthResult.color;
      }

      if (strengthText) {
        if (password.length === 0) {
          strengthText.textContent = "Enter a password";
        } else {
          strengthText.textContent = `${strengthResult.strength}${
            strengthResult.score < 3
              ? ` - Need: ${strengthResult.feedback}`
              : ""
          }`;
        }
      }

      updateProfileProgress();
      checkPasswordMatch();
    });
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("input", checkPasswordMatch);
  }
}

function checkPasswordMatch() {
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const passwordMatch = document.querySelector(".password-match");

  if (passwordInput && confirmPasswordInput && passwordMatch) {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (confirmPassword.length > 0 && password === confirmPassword) {
      passwordMatch.classList.remove("hidden");
    } else {
      passwordMatch.classList.add("hidden");
    }
  }
}

function updateProfileProgress() {
  const fullName = document.getElementById("fullName")?.value || "";
  const username = document.getElementById("username")?.value || "";
  const password = document.getElementById("password")?.value || "";
  const confirmPassword =
    document.getElementById("confirmPassword")?.value || "";

  let progress = 0;
  if (fullName.length >= 2) progress += 25;
  if (username.length >= 3 && validateUsername(username)) progress += 25;
  if (password.length >= 6) progress += 25;
  if (confirmPassword.length >= 6 && password === confirmPassword)
    progress += 25;

  const progressFill = document.getElementById("profileProgress");
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
}

// OTP Input setup
function setupOTPInputs() {
  const otpInputs = document.querySelectorAll(".otp-input");

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;

      if (!/^\d$/.test(value)) {
        e.target.value = "";
        return;
      }

      e.target.classList.add("filled");

      if (value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }

      if (index === otpInputs.length - 1 && value) {
        const allFilled = Array.from(otpInputs).every((input) => input.value);
        if (allFilled) {
          setTimeout(() => {
            document
              .getElementById("otpForm")
              ?.dispatchEvent(new Event("submit"));
          }, 200);
        }
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
        otpInputs[index - 1].value = "";
        otpInputs[index - 1].classList.remove("filled");
      }

      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("otpForm")?.dispatchEvent(new Event("submit"));
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 6);

      pastedData.split("").forEach((digit, i) => {
        if (otpInputs[i]) {
          otpInputs[i].value = digit;
          otpInputs[i].classList.add("filled");
        }
      });

      const nextEmpty = Array.from(otpInputs).find((input) => !input.value);
      if (nextEmpty) {
        nextEmpty.focus();
      } else {
        setTimeout(() => {
          document
            .getElementById("otpForm")
            ?.dispatchEvent(new Event("submit"));
        }, 200);
      }
    });

    input.addEventListener("focus", () => {
      input.select();
    });
  });
}

function clearOTPInputs() {
  const otpInputs = document.querySelectorAll(".otp-input");
  otpInputs.forEach((input) => {
    input.value = "";
    input.classList.remove("filled", "error");
  });
  if (otpInputs[0]) {
    otpInputs[0].focus();
  }
}

function showOTPError() {
  const otpInputs = document.querySelectorAll(".otp-input");
  otpInputs.forEach((input) => input.classList.add("error"));

  setTimeout(() => {
    otpInputs.forEach((input) => input.classList.remove("error"));
  }, 600);
}

// Password toggle setup
function setupPasswordToggles() {
  const toggles = document.querySelectorAll(".password-toggle");

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      const input = toggle.parentElement.querySelector("input");
      const eyeOpen = toggle.querySelector(".eye-open");
      const eyeClosed = toggle.querySelector(".eye-closed");

      if (input.type === "password") {
        input.type = "text";
        if (eyeOpen) eyeOpen.classList.add("hidden");
        if (eyeClosed) eyeClosed.classList.remove("hidden");
      } else {
        input.type = "password";
        if (eyeOpen) eyeOpen.classList.remove("hidden");
        if (eyeClosed) eyeClosed.classList.add("hidden");
      }
    });
  });
}

// User menu setup
function setupUserMenu() {
  const userMenuBtn = document.getElementById("userMenuBtn");
  const userDropdown = document.getElementById("userDropdown");

  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add("hidden");
      }
    });
  }
}

// Navigation setup
function setupForgotPasswordNavigation() {
  const goToForgotPassword = document.getElementById("goToForgotPassword");
  if (goToForgotPassword) {
    goToForgotPassword.addEventListener("click", (e) => {
      e.preventDefault();
      showPage("forgotPasswordPage");
      toast.clear();
    });
  }

  const backToLogin = document.getElementById("backToLogin");
  if (backToLogin) {
    backToLogin.addEventListener("click", (e) => {
      e.preventDefault();
      showPage("loginPage");
      toast.clear();
    });
  }

  const goToSignupFromForgot = document.getElementById("goToSignupFromForgot");
  if (goToSignupFromForgot) {
    goToSignupFromForgot.addEventListener("click", (e) => {
      e.preventDefault();
      showPage("signupPage");
      toast.clear();
    });
  }
}

// Authentication functions
async function handleSignupEmail(e) {
  e.preventDefault();

  const email = document.getElementById("signupEmail").value.trim();

  if (!validateEmail(email)) {
    toast.show("error", "Invalid Email", "Please enter a valid email address.");
    return;
  }

  showButtonLoader("signupBtn", true);

  try {
    console.log("Requesting OTP for email:", email);

    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,
      },
    });

    if (error) throw error;

    currentUserEmail = email;
    otpRetryCount = 0;

    toast.show(
      "success",
      "Code Sent!",
      "Check your email for the verification code."
    );

    setTimeout(() => {
      showPage("otpPage");
    }, 1500);
  } catch (error) {
    console.error("Signup error:", error);

    let message = "Failed to send verification code. Please try again.";
    if (error.message.includes("rate_limit")) {
      message = "Too many requests. Please wait before trying again.";
    }

    toast.show("error", "Signup Failed", message);
  } finally {
    showButtonLoader("signupBtn", false);
  }
}

async function handleOtpVerification(e) {
  e.preventDefault();

  const otpInputs = document.querySelectorAll(".otp-input");
  const otpCode = Array.from(otpInputs)
    .map((input) => input.value)
    .join("");

  if (!currentUserEmail) {
    toast.show(
      "error",
      "Session Expired",
      "Please start the signup process again."
    );
    showPage("signupPage");
    return;
  }

  if (otpCode.length !== 6) {
    toast.show(
      "error",
      "Invalid Code",
      "Please enter the complete 6-digit code."
    );
    showOTPError();
    return;
  }

  showButtonLoader("otpBtn", true);

  try {
    console.log("Verifying OTP:", otpCode);

    const { data, error } = await supabase.auth.verifyOtp({
      email: currentUserEmail,
      token: otpCode,
      type: "email",
    });

    if (error) throw error;

    if (!data.user) {
      throw new Error("Verification failed");
    }

    console.log("OTP verification successful");

    currentUser = data.user;

    if (otpTimer) {
      clearInterval(otpTimer);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Profile check error:", profileError);
    }

    if (!profile) {
      toast.show("success", "Email Verified!", "Please complete your profile.");
      setTimeout(() => showPage("profilePage"), 1500);
    } else {
      toast.show(
        "success",
        "Welcome Back!",
        "You have been signed in successfully."
      );
      setTimeout(() => showPage("homePage"), 1500);
    }
  } catch (error) {
    console.error("OTP verification error:", error);

    let message = "Invalid or expired verification code.";
    if (error.message.includes("expired")) {
      message = "Verification code has expired. Please request a new one.";
    }

    toast.show("error", "Verification Failed", message);
    showOTPError();
    clearOTPInputs();
  } finally {
    showButtonLoader("otpBtn", false);
  }
}

async function resendOtp() {
  if (!currentUserEmail) {
    toast.show(
      "error",
      "Session Expired",
      "Please start the signup process again."
    );
    showPage("signupPage");
    return;
  }

  if (otpRetryCount >= MAX_OTP_RETRIES) {
    toast.show(
      "error",
      "Too Many Attempts",
      "Maximum retry attempts reached. Please start over."
    );
    showPage("signupPage");
    return;
  }

  try {
    console.log("Resending OTP to:", currentUserEmail);

    const { error } = await supabase.auth.signInWithOtp({
      email: currentUserEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: undefined,
      },
    });

    if (error) throw error;

    otpRetryCount++;

    toast.show(
      "success",
      "Code Resent!",
      `New verification code sent (${otpRetryCount}/${MAX_OTP_RETRIES}).`
    );

    clearOTPInputs();
    startOTPTimer();
  } catch (error) {
    console.error("Resend OTP error:", error);
    toast.show("error", "Resend Failed", "Failed to resend verification code.");
  }
}

async function handleCompleteProfile(e) {
  e.preventDefault();

  const fullName = document.getElementById("fullName").value.trim();
  const username = document
    .getElementById("username")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!fullName || fullName.length < 2) {
    toast.show(
      "error",
      "Invalid Name",
      "Full name must be at least 2 characters long."
    );
    return;
  }

  if (!validateUsername(username)) {
    toast.show(
      "error",
      "Invalid Username",
      "Username must be 3-20 characters with letters, numbers, and underscores only."
    );
    return;
  }

  const passwordStrength = checkPasswordStrength(password);
  if (passwordStrength.score < 3) {
    toast.show("error", "Weak Password", "Please choose a stronger password.");
    return;
  }

  if (password !== confirmPassword) {
    toast.show("error", "Password Mismatch", "Passwords do not match.");
    return;
  }

  showButtonLoader("profileBtn", true);
  showLoadingOverlay("Creating your account...");

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    currentUser = user;

    const { data: existingUser } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();

    if (existingUser) {
      throw new Error("Username is already taken. Please choose another.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) throw updateError;

    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      username: username,
      email: user.email,
    });

    if (profileError) throw profileError;

    console.log("Profile created successfully");

    toast.show(
      "success",
      "Account Created!",
      "Welcome to SkillShare! Your account has been created successfully."
    );

    setTimeout(() => {
      showPage("homePage");
    }, 2000);
  } catch (error) {
    console.error("Profile completion error:", error);
    toast.show(
      "error",
      "Account Creation Failed",
      error.message || "Failed to create your account. Please try again."
    );
  } finally {
    showButtonLoader("profileBtn", false);
    hideLoadingOverlay();
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!identifier || !password) {
    toast.show("error", "Missing Information", "Please fill in all fields.");
    return;
  }

  showButtonLoader("loginBtn", true);

  try {
    let email = identifier;

    console.log("Attempting login with identifier:", identifier);

    if (!identifier.includes("@")) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("username", identifier.toLowerCase())
        .single();

      if (profileError) {
        throw new Error("Username not found");
      }

      email = profile.email;
      console.log("Found email for username:", email);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    console.log("Login successful");

    currentUser = data.user;

    toast.show(
      "success",
      "Welcome Back!",
      "You have been signed in successfully."
    );

    setTimeout(() => {
      showPage("homePage");
    }, 1000);
  } catch (error) {
    console.error("Login error:", error);

    let message = "Invalid email/username or password.";
    if (error.message.includes("Invalid login credentials")) {
      message = "Invalid email/username or password.";
    } else if (error.message.includes("Email not confirmed")) {
      message = "Please verify your email address first.";
    } else if (error.message.includes("Username not found")) {
      message = "Username not found. Please check and try again.";
    }

    toast.show("error", "Sign In Failed", message);
  } finally {
    showButtonLoader("loginBtn", false);
  }
}

// 🔥 FIXED FORGOT PASSWORD FUNCTION
async function handleForgotPassword(e) {
  e.preventDefault();

  const email = document.getElementById("forgotPasswordEmail").value.trim();

  if (!validateEmail(email)) {
    toast.show("error", "Invalid Email", "Please enter a valid email address.");
    return;
  }

  showButtonLoader("forgotPasswordBtn", true);

  try {
    console.log("Sending password reset email to:", email);

    // Get the current protocol and host
    const protocol = window.location.protocol;
    const host = window.location.host;
    const resetUrl = `${protocol}//${host}/reset-password.html`;

    console.log("Reset URL:", resetUrl);

    // Use the resetPasswordForEmail method
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetUrl,
    });

    if (error) {
      console.error("Reset password error:", error);
      throw error;
    }

    console.log("Password reset email sent successfully:", data);

    toast.show(
      "success",
      "Reset Link Sent!",
      "Check your email (including spam folder) for password reset instructions."
    );

    // Show instructions to user
    setTimeout(() => {
      toast.show(
        "info",
        "Check Your Email",
        "Please check your email inbox and spam/junk folder for the reset link."
      );
    }, 2000);

    // Redirect back to login after showing message
    setTimeout(() => {
      showPage("loginPage");
      // Clear the form
      document.getElementById("forgotPasswordForm").reset();
    }, 5000);
  } catch (error) {
    console.error("Forgot password error:", error);

    let message = "Failed to send reset email. Please try again.";

    // Handle specific errors
    if (error.message.includes("rate_limit") || error.message.includes("429")) {
      message =
        "Too many reset requests. Please wait 5 minutes before trying again.";
    } else if (
      error.message.includes("user_not_found") ||
      error.message.includes("404")
    ) {
      // For security, don't reveal if email exists
      message =
        "If an account with this email exists, you will receive a reset link.";
      toast.show("success", "Request Processed", message);

      setTimeout(() => {
        showPage("loginPage");
        document.getElementById("forgotPasswordForm").reset();
      }, 3000);

      return;
    } else if (
      error.message.includes("network") ||
      error.message.includes("fetch")
    ) {
      message = "Network error. Please check your connection and try again.";
    }

    toast.show("error", "Reset Failed", message);

    // Show troubleshooting tips
    setTimeout(() => {
      toast.show(
        "info",
        "Troubleshooting Tips",
        "Try: 1) Check spam folder 2) Ensure email is correct 3) Wait a few minutes and retry"
      );
    }, 2000);
  } finally {
    showButtonLoader("forgotPasswordBtn", false);
  }
}

async function handleLogout() {
  try {
    console.log("Logging out user");

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    currentUserEmail = "";
    currentUser = null;
    otpRetryCount = 0;

    if (otpTimer) {
      clearInterval(otpTimer);
    }

    document.querySelectorAll("form").forEach((form) => form.reset());
    clearOTPInputs();

    const userDropdown = document.getElementById("userDropdown");
    if (userDropdown) {
      userDropdown.classList.add("hidden");
    }

    toast.show(
      "success",
      "Signed Out",
      "You have been signed out successfully."
    );

    setTimeout(() => {
      showPage("loginPage");
    }, 1000);
  } catch (error) {
    console.error("Logout error:", error);
    toast.show(
      "error",
      "Sign Out Failed",
      "Error signing out. Please try again."
    );
  }
}

async function checkAuth() {
  try {
    console.log("Checking authentication status");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("No authenticated user");
      showPage("loginPage");
      return;
    }

    console.log("Authenticated user found:", user.id);
    currentUser = user;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Profile check error:", profileError);
    }

    if (!profile) {
      console.log("Profile incomplete, showing profile page");
      showPage("profilePage");
    } else {
      console.log("Profile complete, showing home page");
      showPage("homePage");
    }
  } catch (error) {
    console.error("Auth check error:", error);
    showPage("loginPage");
  }
}

async function updateWelcomeMessage() {
  if (!currentUser) return;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, username, email")
      .eq("id", currentUser.id)
      .single();

    if (profile) {
      const userName = document.getElementById("userName");
      const userEmail = document.getElementById("userEmail");

      if (userName) {
        userName.textContent = profile.full_name || profile.username || "User";
      }

      if (userEmail) {
        userEmail.textContent = profile.email || currentUser.email || "";
      }
    }
  } catch (error) {
    console.error("Failed to load user profile:", error);
  }
}

function setupHomeNavigation() {
  const navButtons = document.querySelectorAll(".nav-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((btn) => btn.classList.remove("active"));
      tabContents.forEach((tab) => tab.classList.remove("active"));

      button.classList.add("active");
      const tab = button.getAttribute("data-tab");
      const currentTab = document.querySelector(
        `.tab-content[data-tab="${tab}"]`
      );
      if (currentTab) {
        currentTab.classList.add("active");
      }
    });
  });
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing SkillShare app...");

  checkAuth();

  setupOTPInputs();
  setupPasswordToggles();
  setupForgotPasswordNavigation();

  // Navigation event listeners
  const goToSignup = document.getElementById("goToSignup");
  const goToLogin = document.getElementById("goToLogin");
  const backToSignup = document.getElementById("backToSignup");

  if (goToSignup) {
    goToSignup.addEventListener("click", (e) => {
      e.preventDefault();
      showPage("signupPage");
      toast.clear();
    });
  }

  if (goToLogin) {
    goToLogin.addEventListener("click", (e) => {
      e.preventDefault();
      showPage("loginPage");
      toast.clear();
    });
  }

  if (backToSignup) {
    backToSignup.addEventListener("click", (e) => {
      e.preventDefault();
      currentUserEmail = "";
      otpRetryCount = 0;
      if (otpTimer) clearInterval(otpTimer);
      clearOTPInputs();
      showPage("signupPage");
      toast.clear();
    });
  }

  // Form event listeners
  const signupForm = document.getElementById("signupForm");
  const otpForm = document.getElementById("otpForm");
  const profileForm = document.getElementById("profileForm");
  const loginForm = document.getElementById("loginForm");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignupEmail);
  }

  if (otpForm) {
    otpForm.addEventListener("submit", handleOtpVerification);
  }

  if (profileForm) {
    profileForm.addEventListener("submit", handleCompleteProfile);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", handleForgotPassword);
  }

  // Button event listeners
  const resendOtpBtn = document.getElementById("resendOtp");
  const logoutBtn = document.getElementById("logoutBtn");

  if (resendOtpBtn) {
    resendOtpBtn.addEventListener("click", resendOtp);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  console.log("SkillShare app initialized successfully!");
});

// Auth state change listener
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth state changed:", event, session?.user?.id || "no user");

  if (event === "SIGNED_OUT") {
    currentUserEmail = "";
    currentUser = null;
    otpRetryCount = 0;
    if (otpTimer) clearInterval(otpTimer);
    clearOTPInputs();
    toast.clear();
    showPage("loginPage");
  } else if (event === "SIGNED_IN" && session?.user) {
    currentUser = session.user;
  } else if (event === "PASSWORD_RECOVERY") {
    console.log("Password recovery detected - handled by reset-password.html");
  }
});

// Handle browser events
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentUser) {
    checkAuth();
  }
});

window.addEventListener("online", () => {
  console.log("Network connection restored");
  toast.show("success", "Connection Restored", "You are back online!");
});

window.addEventListener("offline", () => {
  console.log("Network connection lost");
  toast.show(
    "error",
    "Connection Lost",
    "Please check your internet connection."
  );
});

window.addEventListener("error", (error) => {
  console.error("Uncaught error:", error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

console.log("SkillShare app.js loaded successfully! 🚀");
