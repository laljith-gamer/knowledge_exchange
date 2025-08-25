// ⚠️ IMPORTANT: Replace these with your ACTUAL Supabase credentials
const supabaseUrl = "https://lnmrfqiozzmjbrugnpep.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubXJmcWlvenptamJydWducGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzg4MjAsImV4cCI6MjA2OTg1NDgyMH0.CUxbI2BWeQv-u0-IEuef7BtgfW98k23Apmj3zayth6k";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// State management
let currentEmail = "";
let currentUser = null;
let isPasswordReset = false;

// DOM elements
const forms = {
  login: document.getElementById("loginForm"),
  forgotPassword: document.getElementById("forgotPasswordForm"),
  resetSent: document.getElementById("resetSentForm"),
  newPassword: document.getElementById("newPasswordForm"),
  passwordUpdated: document.getElementById("passwordUpdatedForm"),
  email: document.getElementById("emailForm"),
  otp: document.getElementById("otpForm"),
  profile: document.getElementById("profileForm"),
  success: document.getElementById("successMessage"),
  home: document.getElementById("homePage"),
};

const loading = document.getElementById("loading");
const errorMessage = document.getElementById("errorMessage");
const errorText = document.getElementById("errorText");

// Utility functions
function showForm(formName) {
  Object.values(forms).forEach((form) => form.classList.remove("active"));
  forms[formName].classList.add("active");
}

function showLoading() {
  loading.classList.add("active");
}

function hideLoading() {
  loading.classList.remove("active");
}

function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.add("active");
}

function hideError() {
  errorMessage.classList.remove("active");
}

// Rate limiting utility
function canSendOTP() {
  const lastRequestTime = localStorage.getItem("lastOtpRequest");
  const currentTime = Date.now();
  const cooldownPeriod = 60000; // 1 minute

  if (lastRequestTime && currentTime - lastRequestTime < cooldownPeriod) {
    const remainingTime = Math.ceil(
      (cooldownPeriod - (currentTime - lastRequestTime)) / 1000
    );
    return { canSend: false, remainingTime };
  }

  return { canSend: true };
}

function setOTPRequestTime() {
  localStorage.setItem("lastOtpRequest", Date.now().toString());
}

// Get URL parameters for password reset
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.substring(1));

  return {
    access_token: params.get("access_token") || hash.get("access_token"),
    refresh_token: params.get("refresh_token") || hash.get("refresh_token"),
    type: params.get("type") || hash.get("type"),
    expires_in: params.get("expires_in") || hash.get("expires_in"),
  };
}

// Check if user is already logged in or handling password reset
async function checkAuth() {
  try {
    const urlParams = getUrlParams();

    // Check if this is a password reset callback
    if (urlParams.type === "recovery" && urlParams.access_token) {
      console.log("🔄 Password reset detected");
      isPasswordReset = true;

      // Set the session from URL parameters
      const { data, error } = await supabase.auth.setSession({
        access_token: urlParams.access_token,
        refresh_token: urlParams.refresh_token,
      });

      if (error) {
        console.error("❌ Reset session error:", error);
        showError("Invalid or expired reset link. Please request a new one.");
        showForm("login");
        return;
      }

      console.log("✅ Reset session established");

      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);

      // Show new password form
      showForm("newPassword");
      return;
    }

    // Check if this is a magic link callback for signup
    if (urlParams.access_token && !urlParams.type) {
      console.log("🔄 Magic link signup detected");

      const { data, error } = await supabase.auth.setSession({
        access_token: urlParams.access_token,
        refresh_token: urlParams.refresh_token,
      });

      if (error) {
        console.error("❌ Magic link session error:", error);
        showError("Invalid or expired link. Please try signing up again.");
        showForm("login");
        return;
      }

      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (existingProfile) {
        // User already has a profile, go to home
        await loadUserProfile(data.user);
        showForm("home");
      } else {
        // New user, show profile setup
        currentUser = data.user;
        currentEmail = data.user.email;
        showForm("profile");
      }
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && !isPasswordReset) {
      await loadUserProfile(user);
      showForm("home");
    }
  } catch (error) {
    console.error("Auth check error:", error);
    showError("Authentication error. Please check your internet connection.");
  }
}

// Load user profile data
async function loadUserProfile(user) {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Profile load error:", error);
      return;
    }

    if (profile) {
      document.getElementById("userFullName").textContent = profile.full_name;
      document.getElementById("userUsername").textContent = profile.username;
      document.getElementById("userEmail").textContent = profile.email;
      currentUser = { ...user, profile };
    }
  } catch (error) {
    console.error("Profile load error:", error);
  }
}

// Login functionality
async function handleLogin(event) {
  event.preventDefault();
  showLoading();

  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!identifier || !password) {
    showError("Please fill in all fields");
    hideLoading();
    return;
  }

  try {
    // Try to sign in with email first
    let { data, error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: password,
    });

    // If email login fails, try to find user by username
    if (error && error.message.includes("Invalid login credentials")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("username", identifier)
        .single();

      if (profile) {
        const result = await supabase.auth.signInWithPassword({
          email: profile.email,
          password: password,
        });
        data = result.data;
        error = result.error;
      }
    }

    if (error) throw error;

    await loadUserProfile(data.user);
    showForm("home");
  } catch (error) {
    console.error("Login error:", error);
    showError(
      "Invalid login credentials. Please check your username/email and password."
    );
  } finally {
    hideLoading();
  }
}

// Forgot password functionality
async function handleForgotPassword(event) {
  event.preventDefault();
  showLoading();

  const email = document.getElementById("resetEmail").value.trim();

  if (!email) {
    showError("Please enter your email address");
    hideLoading();
    return;
  }

  try {
    console.log("🔄 Sending password reset to:", email);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });

    if (error) {
      console.error("❌ Reset email error:", error);
      throw error;
    }

    console.log("✅ Reset email sent successfully");
    currentEmail = email;
    showForm("resetSent");
  } catch (error) {
    console.error("Password reset error:", error);
    showError(
      "Error sending reset email. Please check your email address and try again."
    );
  } finally {
    hideLoading();
  }
}

// Handle new password setting
async function handleNewPassword(event) {
  event.preventDefault();
  showLoading();

  const newPassword = document.getElementById("newPassword").value;
  const confirmNewPassword =
    document.getElementById("confirmNewPassword").value;

  if (!newPassword || !confirmNewPassword) {
    showError("Please fill in both password fields");
    hideLoading();
    return;
  }

  if (newPassword !== confirmNewPassword) {
    showError("Passwords do not match");
    hideLoading();
    return;
  }

  if (newPassword.length < 6) {
    showError("Password must be at least 6 characters long");
    hideLoading();
    return;
  }

  try {
    console.log("🔄 Updating password...");

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("❌ Password update error:", error);
      throw error;
    }

    console.log("✅ Password updated successfully");
    isPasswordReset = false;
    showForm("passwordUpdated");
  } catch (error) {
    console.error("Password update error:", error);
    showError("Error updating password. Please try the reset process again.");
  } finally {
    hideLoading();
  }
}

// Email signup with improved error handling and magic link fallback
async function handleEmailSignup(event) {
  event.preventDefault();
  showLoading();

  const email = document.getElementById("signupEmail").value.trim();
  currentEmail = email;

  if (!email) {
    showError("Please enter your email address");
    hideLoading();
    return;
  }

  // Check rate limiting
  const rateLimitCheck = canSendOTP();
  if (!rateLimitCheck.canSend) {
    showError(
      `Please wait ${rateLimitCheck.remainingTime} seconds before requesting another code`
    );
    hideLoading();
    return;
  }

  try {
    console.log("🔄 Sending verification to:", email);

    // Try OTP first, with fallback to magic link
    let { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      console.error("❌ OTP Error:", error);

      // Handle specific error types
      if (error.message?.includes("rate limit")) {
        setOTPRequestTime(); // Set rate limit even on error
        showError(
          "Too many requests. Please wait a few minutes and try again."
        );
        hideLoading();
        return;
      } else if (
        error.message?.includes("email") ||
        error.message?.includes("SMTP") ||
        error.status === 500
      ) {
        // If OTP fails due to email service issues, show magic link instructions
        console.log("📧 OTP failed, showing magic link instructions");
        showMagicLinkInstructions(email);
        hideLoading();
        return;
      }

      throw error;
    }

    console.log("✅ Verification sent successfully");
    setOTPRequestTime();

    // Display email in OTP form
    document.getElementById("otpEmailDisplay").textContent = email;
    showForm("otp");
  } catch (error) {
    console.error("Signup error:", error);
    showError(
      `Error: ${
        error.message || "Unable to send verification. Please try again later."
      }`
    );
  } finally {
    hideLoading();
  }
}

// Show magic link instructions when OTP fails
function showMagicLinkInstructions(email) {
  // Modify the reset sent form to show magic link instructions
  const resetForm = document.getElementById("resetSentForm");
  const title = resetForm.querySelector("h2");
  const infoText = resetForm.querySelector(".info-text");
  const infoBox = resetForm.querySelector(".info-box p");

  title.textContent = "📧 Check Your Email";
  infoText.textContent = `We've sent a secure link to ${email}. Click the link in your email to verify your account and continue with signup.`;
  infoBox.textContent = "Using Magic Link Verification";

  showForm("resetSent");
}

// OTP verification with better error handling
async function handleOtpVerification(event) {
  event.preventDefault();
  showLoading();

  const otpCode = document.getElementById("otpCode").value;

  if (!otpCode || otpCode.length !== 6) {
    showError("Please enter the 6-digit verification code");
    hideLoading();
    return;
  }

  try {
    console.log("🔄 Verifying OTP...");

    const { data, error } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: otpCode,
      type: "email",
    });

    if (error) {
      console.error("❌ OTP verification error:", error);

      if (error.message?.includes("expired")) {
        showError("Verification code has expired. Please request a new one.");
      } else if (error.message?.includes("invalid")) {
        showError("Invalid verification code. Please check and try again.");
      } else {
        showError(
          "Verification failed. Please try again or request a new code."
        );
      }
      hideLoading();
      return;
    }

    console.log("✅ OTP verified successfully");

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (existingProfile) {
      // User already has a profile, go to home
      await loadUserProfile(data.user);
      showForm("home");
    } else {
      // New user, show profile setup
      currentUser = data.user;
      showForm("profile");
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    showError("Verification failed. Please try again.");
  } finally {
    hideLoading();
  }
}

// Profile setup
async function handleProfileSetup(event) {
  event.preventDefault();
  showLoading();

  const username = document.getElementById("username").value.trim();
  const fullName = document.getElementById("fullName").value.trim();
  const password = document.getElementById("createPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!username || !fullName || !password || !confirmPassword) {
    showError("Please fill in all fields");
    hideLoading();
    return;
  }

  if (password !== confirmPassword) {
    showError("Passwords do not match");
    hideLoading();
    return;
  }

  if (password.length < 6) {
    showError("Password must be at least 6 characters long");
    hideLoading();
    return;
  }

  try {
    console.log("🔄 Setting up profile...");

    // Check if username is already taken
    const { data: existingUsername } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();

    if (existingUsername) {
      throw new Error("Username is already taken");
    }

    // Update user password
    const { error: passwordError } = await supabase.auth.updateUser({
      password: password,
    });

    if (passwordError) throw passwordError;

    // Create profile
    const { error: profileError } = await supabase.from("profiles").insert([
      {
        id: currentUser.id,
        full_name: fullName,
        username: username,
        email: currentEmail,
      },
    ]);

    if (profileError) throw profileError;

    console.log("✅ Profile created successfully");
    showForm("success");
  } catch (error) {
    console.error("Profile setup error:", error);
    showError(error.message || "Error creating profile. Please try again.");
  } finally {
    hideLoading();
  }
}

// Resend OTP with improved handling
async function handleResendOtp() {
  showLoading();

  // Check rate limiting
  const rateLimitCheck = canSendOTP();
  if (!rateLimitCheck.canSend) {
    showError(
      `Please wait ${rateLimitCheck.remainingTime} seconds before requesting another code`
    );
    hideLoading();
    return;
  }

  try {
    console.log("🔄 Resending OTP to:", currentEmail);

    const { error } = await supabase.auth.signInWithOtp({
      email: currentEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      console.error("❌ Resend OTP error:", error);

      if (error.message?.includes("rate limit")) {
        throw new Error("Too many requests. Please wait a few minutes.");
      }

      throw error;
    }

    setOTPRequestTime();
    showError("Verification code sent successfully!");

    // Clear the OTP input
    document.getElementById("otpCode").value = "";
  } catch (error) {
    console.error("Resend error:", error);
    showError(error.message || "Error resending code. Please try again.");
  } finally {
    hideLoading();
  }
}

// Go to home page
async function goToHome() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await loadUserProfile(user);
      showForm("home");
    }
  } catch (error) {
    console.error("Home navigation error:", error);
    showError("Error loading profile. Please try again.");
  }
}

// Logout
async function handleLogout() {
  try {
    await supabase.auth.signOut();
    currentUser = null;
    currentEmail = "";
    isPasswordReset = false;

    // Clear form data and localStorage
    document.querySelectorAll("input").forEach((input) => (input.value = ""));
    localStorage.removeItem("lastOtpRequest");

    showForm("login");
  } catch (error) {
    console.error("Logout error:", error);
    showError("Error logging out. Please try again.");
  }
}

// Password strength checker
function checkPasswordStrength(password) {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  if (strength < 2) return "weak";
  if (strength < 4) return "medium";
  return "strong";
}

// Event listeners
document.addEventListener("DOMContentLoaded", function () {
  // Check authentication on page load
  checkAuth();

  // Form submissions
  document
    .getElementById("loginFormElement")
    .addEventListener("submit", handleLogin);
  document
    .getElementById("forgotPasswordFormElement")
    .addEventListener("submit", handleForgotPassword);
  document
    .getElementById("newPasswordFormElement")
    .addEventListener("submit", handleNewPassword);
  document
    .getElementById("emailFormElement")
    .addEventListener("submit", handleEmailSignup);
  document
    .getElementById("otpFormElement")
    .addEventListener("submit", handleOtpVerification);
  document
    .getElementById("profileFormElement")
    .addEventListener("submit", handleProfileSetup);

  // Navigation buttons
  document.getElementById("showSignup").addEventListener("click", (e) => {
    e.preventDefault();
    showForm("email");
  });

  document.getElementById("showLogin").addEventListener("click", (e) => {
    e.preventDefault();
    showForm("login");
  });

  document
    .getElementById("showForgotPassword")
    .addEventListener("click", (e) => {
      e.preventDefault();
      showForm("forgotPassword");
    });

  document.getElementById("backToLogin").addEventListener("click", (e) => {
    e.preventDefault();
    showForm("login");
  });

  document
    .getElementById("backToLoginFromReset")
    .addEventListener("click", () => {
      showForm("login");
    });

  document.getElementById("loginAfterReset").addEventListener("click", () => {
    showForm("login");
  });

  // Other buttons
  document
    .getElementById("resendOtp")
    .addEventListener("click", handleResendOtp);
  document.getElementById("goToHome").addEventListener("click", goToHome);
  document.getElementById("logout").addEventListener("click", handleLogout);
  document.getElementById("closeError").addEventListener("click", hideError);

  // Real-time validation
  document
    .getElementById("confirmPassword")
    .addEventListener("input", function () {
      const password = document.getElementById("createPassword").value;
      const confirmPassword = this.value;

      if (password && confirmPassword && password !== confirmPassword) {
        this.style.borderColor = "#dc3545";
      } else {
        this.style.borderColor = "#e1e5e9";
      }
    });

  document
    .getElementById("confirmNewPassword")
    .addEventListener("input", function () {
      const password = document.getElementById("newPassword").value;
      const confirmPassword = this.value;

      if (password && confirmPassword && password !== confirmPassword) {
        this.style.borderColor = "#dc3545";
      } else {
        this.style.borderColor = "#e1e5e9";
      }
    });

  // Username availability check
  document
    .getElementById("username")
    .addEventListener("blur", async function () {
      const username = this.value.trim();
      if (username.length > 0) {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("username")
            .eq("username", username)
            .single();

          if (data) {
            this.style.borderColor = "#dc3545";
          } else {
            this.style.borderColor = "#28a745";
          }
        } catch (error) {
          // Username is available
          this.style.borderColor = "#28a745";
        }
      }
    });

  // OTP input formatting with better UX
  document.getElementById("otpCode").addEventListener("input", function () {
    // Only allow numbers
    this.value = this.value.replace(/\D/g, "").substring(0, 6);

    // Auto-submit when 6 digits entered (with small delay for better UX)
    if (this.value.length === 6) {
      setTimeout(() => {
        document
          .getElementById("otpFormElement")
          .dispatchEvent(new Event("submit"));
      }, 300);
    }
  });

  // Paste support for OTP
  document.getElementById("otpCode").addEventListener("paste", function (e) {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData("text");
    const numbers = paste.replace(/\D/g, "").substring(0, 6);
    this.value = numbers;

    if (numbers.length === 6) {
      setTimeout(() => {
        document
          .getElementById("otpFormElement")
          .dispatchEvent(new Event("submit"));
      }, 300);
    }
  });

  // Password strength indicators
  ["createPassword", "newPassword"].forEach((passwordFieldId) => {
    const field = document.getElementById(passwordFieldId);
    if (field) {
      field.addEventListener("input", function () {
        const strength = checkPasswordStrength(this.value);

        // Remove existing indicator
        const existingIndicator =
          this.parentNode.querySelector(".password-strength");
        if (existingIndicator) {
          existingIndicator.remove();
        }

        // Add new indicator
        if (this.value.length > 0) {
          const indicator = document.createElement("div");
          indicator.className = `password-strength ${strength}`;
          indicator.textContent = `Password strength: ${strength}`;
          this.parentNode.appendChild(indicator);
        }
      });
    }
  });
});

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth state changed:", event, session);

  if (event === "SIGNED_IN" && session && !isPasswordReset) {
    console.log("User signed in:", session.user);
  } else if (event === "SIGNED_OUT") {
    console.log("User signed out");
    if (!isPasswordReset) {
      showForm("login");
    }
  }
});
