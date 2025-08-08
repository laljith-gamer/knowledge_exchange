// Supabase Configuration
const SUPABASE_URL = "https://lnmrfqiozzmjbrugnpep.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubXJmcWlvenptamJydWducGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzg4MjAsImV4cCI6MjA2OTg1NDgyMH0.CUxbI2BWeQv-u0-IEuef7BtgfW98k23Apmj3zayth6k";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Configuration - UPDATE THIS URL TO YOUR RESET PASSWORD WEBSITE
const RESET_PASSWORD_WEBSITE_URL = "https://knowledge-exchange-eight.vercel.app/";

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
                this.toasts = this.toasts.filter(t => t !== toast);
            }, 300);
        }
    }
}

const toastManager = new ToastManager();

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
    console.log("SkillShare Application initialized");
    
    // Check if user is already logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        currentUser = session.user;
        currentUserEmail = session.user.email;
        showHome();
    } else {
        showLogin();
    }

    initializeEventListeners();
    initializePasswordStrength();
    initializeAnimations();
});

// Initialize event listeners
function initializeEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    // OTP form
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', handleOTPVerification);
    }
    
    // Forgot password form
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }
    
    // OTP input handling
    initializeOTPInputs();
    
    // Auth state listener
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session);
        
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            currentUserEmail = session.user.email;
            showHome();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentUserEmail = "";
            showLogin();
        }
    });

    // Add keyboard navigation
    document.addEventListener('keydown', handleKeyboardNavigation);
}

// Handle keyboard navigation
function handleKeyboardNavigation(e) {
    // ESC key to close modals or go back
    if (e.key === 'Escape') {
        hideLoading();
    }
    
    // Enter key on focused buttons
    if (e.key === 'Enter' && e.target.tagName === 'BUTTON') {
        e.target.click();
    }
}

// Login handler
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        toastManager.show('error', 'Missing Information', 'Please fill in all fields');
        return;
    }

    // Basic email validation
    if (!isValidEmail(email)) {
        toastManager.show('error', 'Invalid Email', 'Please enter a valid email address');
        return;
    }
    
    showLoading('Signing you in...');
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });
        
        if (error) {
            console.error('Login error:', error);
            
            if (error.message.includes('Invalid login credentials')) {
                toastManager.show('error', 'Login Failed', 'Invalid email or password. Please check your credentials and try again.');
            } else if (error.message.includes('Email not confirmed')) {
                currentUserEmail = email;
                showEmailVerification();
                toastManager.show('info', 'Email Not Verified', 'Please check your email and click the verification link before signing in.');
            } else if (error.message.includes('Too many requests')) {
                toastManager.show('error', 'Too Many Attempts', 'Please wait a moment before trying again.');
            } else {
                toastManager.show('error', 'Login Failed', error.message);
            }
            return;
        }
        
        currentUser = data.user;
        currentUserEmail = data.user.email;
        toastManager.show('success', 'Welcome Back!', `Good to see you again, ${data.user.user_metadata?.full_name || data.user.email}`);
        
    } catch (error) {
        console.error('Login error:', error);
        toastManager.show('error', 'Login Failed', 'An unexpected error occurred. Please try again.');
    } finally {
        hideLoading();
    }
}

// Signup handler
async function handleSignup(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('signupFullName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    if (!fullName || !username || !email || !password) {
        toastManager.show('error', 'Missing Information', 'Please fill in all fields');
        return;
    }

    // Validation checks
    if (!isValidEmail(email)) {
        toastManager.show('error', 'Invalid Email', 'Please enter a valid email address');
        return;
    }

    if (username.length < 3) {
        toastManager.show('error', 'Invalid Username', 'Username must be at least 3 characters long');
        return;
    }

    if (!isValidUsername(username)) {
        toastManager.show('error', 'Invalid Username', 'Username can only contain letters, numbers, and underscores');
        return;
    }

    if (!isPasswordStrong(password)) {
        toastManager.show('error', 'Weak Password', 'Please meet all password requirements');
        return;
    }
    
    showLoading('Creating your account...');
    
    try {
        // First check if username already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();

        if (existingUser) {
            toastManager.show('error', 'Username Taken', 'This username is already taken. Please choose another one.');
            hideLoading();
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    username: username,
                }
            }
        });
        
        if (error) {
            console.error('Signup error:', error);
            
            if (error.message.includes('already registered')) {
                toastManager.show('error', 'Email Already Exists', 'This email is already registered. Try signing in instead.');
            } else if (error.message.includes('Password should be')) {
                toastManager.show('error', 'Password Requirements', 'Password must be at least 6 characters long');
            } else {
                toastManager.show('error', 'Signup Failed', error.message);
            }
            return;
        }
        
        currentUserEmail = email;
        showEmailVerification();
        toastManager.show('success', 'Account Created!', 'Please check your email to verify your account before signing in');
        
    } catch (error) {
        console.error('Signup error:', error);
        toastManager.show('error', 'Signup Failed', 'An unexpected error occurred. Please try again.');
    } finally {
        hideLoading();
    }
}

// Forgot password handler - Updated to redirect to separate website
async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('forgotEmail').value.trim();
    
    if (!email) {
        toastManager.show('error', 'Email Required', 'Please enter your email address');
        return;
    }

    if (!isValidEmail(email)) {
        toastManager.show('error', 'Invalid Email', 'Please enter a valid email address');
        return;
    }
    
    showLoading('Sending reset link...');
    
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: RESET_PASSWORD_WEBSITE_URL,
        });
        
        if (error) {
            console.error('Forgot password error:', error);
            toastManager.show('error', 'Reset Failed', error.message);
            return;
        }
        
        toastManager.show('success', 'Reset Link Sent!', `Check your email at ${email} for the password reset link. You'll be redirected to complete the reset process.`);
        showLogin();
        
    } catch (error) {
        console.error('Forgot password error:', error);
        toastManager.show('error', 'Reset Failed', 'Unable to send reset email. Please try again.');
    } finally {
        hideLoading();
    }
}

// OTP verification handler
async function handleOTPVerification(e) {
    e.preventDefault();
    
    const otpInputs = document.querySelectorAll('.otp-input');
    const otpCode = Array.from(otpInputs).map(input => input.value).join('');
    
    if (otpCode.length !== 6) {
        toastManager.show('error', 'Incomplete Code', 'Please enter the complete 6-digit code');
        otpInputs.forEach(input => input.classList.add('error'));
        setTimeout(() => {
            otpInputs.forEach(input => input.classList.remove('error'));
        }, 2000);
        return;
    }
    
    showLoading('Verifying code...');
    
    try {
        const { data, error } = await supabase.auth.verifyOtp({
            email: currentUserEmail,
            token: otpCode,
            type: 'signup'
        });
        
        if (error) {
            console.error('OTP verification error:', error);
            toastManager.show('error', 'Invalid Code', 'The code you entered is incorrect or has expired');
            otpInputs.forEach(input => {
                input.classList.add('error');
                input.value = '';
            });
            setTimeout(() => {
                otpInputs.forEach(input => input.classList.remove('error'));
            }, 2000);
            return;
        }
        
        currentUser = data.user;
        currentUserEmail = data.user.email;
        toastManager.show('success', 'Account Verified!', 'Welcome to SkillShare!');
        
    } catch (error) {
        console.error('OTP verification error:', error);
        toastManager.show('error', 'Verification Failed', 'An unexpected error occurred. Please try again.');
    } finally {
        hideLoading();
    }
}

// Page navigation functions
function showLogin() {
    showPage('loginPage');
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.reset();
    }
}

function showSignup() {
    showPage('signupPage');
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.reset();
    }
}

function showEmailVerification() {
    showPage('verificationPage');
    const verificationEmail = document.getElementById('verificationEmail');
    if (verificationEmail) {
        verificationEmail.textContent = currentUserEmail;
    }
}

function showOTPVerification() {
    showPage('otpPage');
    const otpEmail = document.getElementById('otpEmail');
    if (otpEmail) {
        otpEmail.textContent = currentUserEmail;
    }
    startOTPTimer();
    focusFirstOTPInput();
}

function showForgotPassword() {
    showPage('forgotPasswordPage');
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) {
        forgotForm.reset();
    }
}

function showHome() {
    showPage('homePage');
}

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page-section').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        
        // Focus first input if it exists
        const firstInput = targetPage.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

// Password strength checker
function initializePasswordStrength() {
    const signupPassword = document.getElementById('signupPassword');
    
    if (signupPassword) {
        signupPassword.addEventListener('input', (e) => {
            updatePasswordStrength(e.target, 'passwordStrength', 'strengthFill', 'strengthText');
        });
    }
}

function updatePasswordStrength(input, strengthId, fillId, textId) {
    const password = input.value;
    const strengthContainer = document.getElementById(strengthId);
    const strengthFill = document.getElementById(fillId);
    const strengthText = document.getElementById(textId);
    
    if (!password) {
        strengthContainer?.classList.add('hidden');
        return;
    }
    
    strengthContainer?.classList.remove('hidden');
    
    const strength = calculatePasswordStrength(password);
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];
    
    if (strengthFill) {
        strengthFill.style.width = `${(strength + 1) * 25}%`;
        strengthFill.style.backgroundColor = colors[strength];
    }
    
    if (strengthText) {
        strengthText.textContent = labels[strength];
    }
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
    return password.length >= 8 &&
           /[a-z]/.test(password) &&
           /[A-Z]/.test(password) &&
           /[0-9]/.test(password) &&
           /[^A-Za-z0-9]/.test(password);
}

// Validation functions
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    return usernameRegex.test(username);
}

// OTP input handling
function initializeOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');
    
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // Remove non-numeric characters
            e.target.value = value.replace(/[^0-9]/g, '');
            
            if (e.target.value) {
                e.target.classList.add('filled');
                
                // Move to next input
                if (index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            } else {
                e.target.classList.remove('filled');
            }
        });
        
        input.addEventListener('keydown', (e) => {
            // Handle backspace
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
                otpInputs[index - 1].value = '';
                otpInputs[index - 1].classList.remove('filled');
            }
            
            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                otpInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
            
            pastedData.split('').forEach((digit, i) => {
                if (otpInputs[i]) {
                    otpInputs[i].value = digit;
                    otpInputs[i].classList.add('filled');
                }
            });
            
            // Focus last filled input or next empty one
            const lastIndex = Math.min(pastedData.length, otpInputs.length - 1);
            otpInputs[lastIndex].focus();
        });
    });
}

function focusFirstOTPInput() {
    const firstInput = document.querySelector('.otp-input');
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
            toastManager.show('error', 'Code Expired', 'The verification code has expired. Please request a new one.');
        }
    }, 1000);
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        const minutes = Math.floor(otpTimeLeft / 60);
        const seconds = otpTimeLeft % 60;
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Utility functions
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        button.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        button.setAttribute('aria-label', 'Show password');
    }
}

function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = overlay?.querySelector('.loading-text');
    if (text) {
        text.textContent = message;
    }
    overlay?.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay?.classList.add('hidden');
}

async function resendVerification() {
    if (!currentUserEmail) {
        toastManager.show('error', 'No Email', 'Please go back and enter your email address');
        return;
    }
    
    showLoading('Resending verification email...');
    
    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: currentUserEmail,
        });
        
        if (error) {
            console.error('Resend verification error:', error);
            toastManager.show('error', 'Resend Failed', error.message);
            return;
        }
        
        toastManager.show('success', 'Email Sent!', 'Check your email for the verification link');
    } catch (error) {
        console.error('Resend verification error:', error);
        toastManager.show('error', 'Resend Failed', 'Unable to resend email. Please try again.');
    } finally {
        hideLoading();
    }
}

async function resendOTP() {
    if (otpRetryCount >= MAX_OTP_RETRIES) {
        toastManager.show('error', 'Too Many Attempts', 'Please wait before requesting another code');
        return;
    }
    
    otpRetryCount++;
    showLoading('Sending new code...');
    
    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: currentUserEmail,
        });
        
        if (error) {
            console.error('Resend OTP error:', error);
            toastManager.show('error', 'Resend Failed', error.message);
            return;
        }
        
        // Clear existing OTP inputs
        document.querySelectorAll('.otp-input').forEach(input => {
            input.value = '';
            input.classList.remove('filled', 'error');
        });
        
        toastManager.show('success', 'Code Sent!', 'A new verification code has been sent');
        startOTPTimer();
        focusFirstOTPInput();
        
    } catch (error) {
        console.error('Resend OTP error:', error);
        toastManager.show('error', 'Resend Failed', 'Unable to send new code. Please try again.');
    } finally {
        hideLoading();
    }
}

async function logout() {
    showLoading('Signing out...');
    
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Logout error:', error);
            toastManager.show('error', 'Logout Failed', error.message);
            return;
        }
        
        currentUser = null;
        currentUserEmail = "";
        
        // Clear any timers
        if (otpTimer) {
            clearInterval(otpTimer);
        }
        
        // Reset retry counts
        otpRetryCount = 0;
        
        toastManager.show('success', 'Signed Out', 'Come back soon!');
        
    } catch (error) {
        console.error('Logout error:', error);
        toastManager.show('error', 'Logout Failed', 'Unable to sign out properly');
    } finally {
        hideLoading();
    }
}

// Enhanced animations and interactions
function initializeAnimations() {
    // Add entrance animations to elements
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
            }
        });
    }, observerOptions);
    
    // Observe all animated elements
    document.querySelectorAll('.animate-fade-in').forEach(el => {
        observer.observe(el);
    });

    // Add ripple effect to buttons
    document.querySelectorAll('.btn-primary, .btn-secondary').forEach(button => {
        button.addEventListener('click', createRippleEffect);
    });
}

function createRippleEffect(e) {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    const ripple = document.createElement('span');
    ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
    `;
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Add ripple animation CSS
if (!document.querySelector('#ripple-styles')) {
    const style = document.createElement('style');
    style.id = 'ripple-styles';
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        .btn-primary, .btn-secondary {
            position: relative;
            overflow: hidden;
        }
    `;
    document.head.appendChild(style);
}


