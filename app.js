
const SUPABASE_URL = 'https://lnmrfqiozzmjbrugnpep.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubXJmcWlvenptamJydWducGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzg4MjAsImV4cCI6MjA2OTg1NDgyMH0.CUxbI2BWeQv-u0-IEuef7BtgfW98k23Apmj3zayth6k';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global variables
let currentUserEmail = '';
let currentUser = null;
let otpRetryCount = 0;
const MAX_OTP_RETRIES = 3;

// Page Navigation Functions
function showPage(pageId) {
    console.log('Navigating to page:', pageId);
    
    // Hide all pages
    const pages = document.querySelectorAll('.page-section');
    pages.forEach(page => page.classList.remove('active'));
    
    // Show the selected page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        
        // Update page-specific content
        if (pageId === 'otpPage' && currentUserEmail) {
            const otpEmailElement = document.getElementById('otpEmail');
            if (otpEmailElement) {
                otpEmailElement.textContent = currentUserEmail;
            }
        }
        
        if (pageId === 'homePage') {
            updateWelcomeMessage();
        }
    } else {
        console.error('Page not found:', pageId);
    }
}

// Utility Functions
function showError(message, errorElementId = 'loginError') {
    console.error('Error:', message);
    hideAllMessages();
    const errorDiv = document.getElementById(errorElementId);
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        setTimeout(() => {
            errorDiv.classList.add('hidden');
        }, 8000);
    }
}

function showSuccess(message, successElementId) {
    console.log('Success:', message);
    hideAllMessages();
    const successDiv = document.getElementById(successElementId);
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.classList.remove('hidden');
        setTimeout(() => {
            successDiv.classList.add('hidden');
        }, 5000);
    }
}

function hideAllMessages() {
    const messages = document.querySelectorAll('.error-message, .success-message');
    messages.forEach(msg => msg.classList.add('hidden'));
}

function showLoader(buttonId, show = true) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const btnText = button.querySelector('.btn-text');
    const loader = button.querySelector('.loader');
    
    if (show) {
        button.disabled = true;
        if (btnText) btnText.style.opacity = '0';
        if (loader) loader.classList.remove('hidden');
    } else {
        button.disabled = false;
        if (btnText) btnText.style.opacity = '1';
        if (loader) loader.classList.add('hidden');
    }
}

function clearForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.reset();
    }
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    return usernameRegex.test(username) && username.length >= 3;
}

// Authentication Functions
async function handleSignupEmail(e) {
    e.preventDefault();
    hideAllMessages();
    
    const email = document.getElementById('signupEmail').value.trim();
    
    if (!validateEmail(email)) {
        showError('Please enter a valid email address', 'signupError');
        return;
    }
    
    showLoader('signupBtn', true);
    
    try {
        console.log('Requesting OTP for email:', email);
        
        // Request OTP - this should send a 6-digit code instead of magic link
        const { data, error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: undefined, // Disable magic link redirect
                data: {
                    // Additional user metadata if needed
                }
            }
        });
        
        if (error) {
            console.error('OTP request error:', error);
            throw error;
        }
        
        console.log('OTP request successful:', data);
        
        currentUserEmail = email;
        otpRetryCount = 0; // Reset retry count
        
        showSuccess('✅ Verification code sent to your email! Check your inbox and spam folder.', 'signupSuccess');
        
        setTimeout(() => {
            showPage('otpPage');
            clearForm('signupForm');
            
            // Focus on OTP input
            const otpInput = document.getElementById('otpCode');
            if (otpInput) {
                otpInput.focus();
            }
        }, 2000);
        
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Failed to send verification code. Please try again.';
        
        if (error.message.includes('rate_limit')) {
            errorMessage = 'Too many requests. Please wait a moment before trying again.';
        } else if (error.message.includes('invalid_email')) {
            errorMessage = 'Please enter a valid email address.';
        }
        
        showError(errorMessage, 'signupError');
    } finally {
        showLoader('signupBtn', false);
    }
}

async function handleOtpVerification(e) {
    e.preventDefault();
    hideAllMessages();
    
    const otpCode = document.getElementById('otpCode').value.trim();
    
    if (!currentUserEmail) {
        showError('Session expired. Please start the signup process again.', 'otpError');
        showPage('signupPage');
        return;
    }
    
    if (!otpCode || otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
        showError('Please enter a valid 6-digit verification code', 'otpError');
        return;
    }
    
    showLoader('otpBtn', true);
    
    try {
        console.log('Verifying OTP:', otpCode);
        
        const { data, error } = await supabase.auth.verifyOtp({
            email: currentUserEmail,
            token: otpCode,
            type: 'email'
        });
        
        if (error) {
            console.error('OTP verification error:', error);
            throw error;
        }
        
        if (!data.user) {
            throw new Error('Verification failed - no user data received');
        }
        
        console.log('OTP verification successful:', data.user.id);
        
        currentUser = data.user;
        
        // Check if user profile exists
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        if (profileError && profileError.code !== 'PGRST116') {
            console.error('Profile check error:', profileError);
            // Don't throw error, just proceed to profile creation
        }
        
        clearForm('otpForm');
        
        if (!profile) {
            showSuccess('✅ Email verified successfully! Please complete your profile.', 'otpSuccess');
            setTimeout(() => showPage('profilePage'), 1500);
        } else {
            showSuccess('✅ Welcome back to SkillShare!', 'otpSuccess');
            setTimeout(() => showPage('homePage'), 1500);
        }
        
    } catch (error) {
        console.error('OTP verification error:', error);
        
        let errorMessage = 'Invalid or expired verification code. Please try again.';
        
        if (error.message.includes('invalid_token')) {
            errorMessage = 'Invalid verification code. Please check and try again.';
        } else if (error.message.includes('expired')) {
            errorMessage = 'Verification code has expired. Please request a new one.';
        }
        
        showError(errorMessage, 'otpError');
        
        // Clear the OTP input for retry
        const otpInput = document.getElementById('otpCode');
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
        
    } finally {
        showLoader('otpBtn', false);
    }
}

async function resendOtp() {
    if (!currentUserEmail) {
        showError('Session expired. Please start the signup process again.', 'otpError');
        showPage('signupPage');
        return;
    }
    
    if (otpRetryCount >= MAX_OTP_RETRIES) {
        showError('Maximum retry attempts reached. Please start signup again.', 'otpError');
        showPage('signupPage');
        return;
    }
    
    try {
        console.log('Resending OTP to:', currentUserEmail);
        
        const { error } = await supabase.auth.signInWithOtp({
            email: currentUserEmail,
            options: {
                shouldCreateUser: false,
                emailRedirectTo: undefined
            }
        });
        
        if (error) {
            console.error('Resend OTP error:', error);
            throw error;
        }
        
        otpRetryCount++;
        
        showSuccess(`✅ New verification code sent! (${otpRetryCount}/${MAX_OTP_RETRIES})`, 'otpSuccess');
        
        // Clear the current OTP input
        const otpInput = document.getElementById('otpCode');
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
        
    } catch (error) {
        console.error('Resend OTP error:', error);
        showError('Failed to resend verification code. Please try again.', 'otpError');
    }
}

async function handleCompleteProfile(e) {
    e.preventDefault();
    hideAllMessages();
    
    const fullName = document.getElementById('fullName').value.trim();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validation
    if (!fullName || fullName.length < 2) {
        showError('Full name must be at least 2 characters long', 'profileError');
        return;
    }
    
    if (!validateUsername(username)) {
        showError('Username must be at least 3 characters and contain only letters, numbers, and underscores', 'profileError');
        return;
    }
    
    if (password.length < 6) {
        showError('Password must be at least 6 characters long', 'profileError');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Passwords do not match', 'profileError');
        return;
    }
    
    showLoader('profileBtn', true);
    
    try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            throw new Error('User not authenticated. Please try logging in again.');
        }
        
        currentUser = user;
        console.log('Creating profile for user:', user.id);
        
        // Check if username is available
        const { data: existingUser, error: checkError } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Username check error:', checkError);
            // Don't throw error, just proceed
        }
        
        if (existingUser) {
            throw new Error('Username is already taken. Please choose another username.');
        }
        
        // Update user password
        const { error: updateError } = await supabase.auth.updateUser({
            password: password
        });
        
        if (updateError) {
            console.error('Password update error:', updateError);
            throw updateError;
        }
        
        // Create profile
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: user.id,
                full_name: fullName,
                username: username,
                email: user.email
            });
        
        if (profileError) {
            console.error('Profile creation error:', profileError);
            throw profileError;
        }
        
        console.log('Profile created successfully');
        
        showSuccess('✅ Account created successfully! Welcome to SkillShare!', 'profileSuccess');
        clearForm('profileForm');
        
        setTimeout(() => {
            showPage('homePage');
        }, 2000);
        
    } catch (error) {
        console.error('Profile completion error:', error);
        showError(error.message || 'Failed to create your profile. Please try again.', 'profileError');
    } finally {
        showLoader('profileBtn', false);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    hideAllMessages();
    
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!identifier || !password) {
        showError('Please fill in all fields', 'loginError');
        return;
    }
    
    showLoader('loginBtn', true);
    
    try {
        let email = identifier;
        
        console.log('Attempting login with identifier:', identifier);
        
        // Check if identifier is username
        if (!identifier.includes('@')) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', identifier.toLowerCase())
                .single();
            
            if (profileError) {
                console.error('Username lookup error:', profileError);
                throw new Error('Username not found');
            }
            
            email = profile.email;
            console.log('Found email for username:', email);
        }
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            console.error('Login error:', error);
            throw error;
        }
        
        console.log('Login successful:', data.user.id);
        
        currentUser = data.user;
        clearForm('loginForm');
        showPage('homePage');
        
    } catch (error) {
        console.error('Login error:', error);
        
        let errorMessage = 'Invalid email/username or password. Please check your credentials and try again.';
        
        if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Invalid email/username or password.';
        } else if (error.message.includes('Email not confirmed')) {
            errorMessage = 'Please verify your email address before logging in.';
        }
        
        showError(errorMessage, 'loginError');
    } finally {
        showLoader('loginBtn', false);
    }
}

async function handleLogout() {
    try {
        console.log('Logging out user');
        
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error);
            throw error;
        }
        
        // Clear state
        currentUserEmail = '';
        currentUser = null;
        otpRetryCount = 0;
        
        // Clear all forms
        clearForm('loginForm');
        clearForm('signupForm');
        clearForm('otpForm');
        clearForm('profileForm');
        
        hideAllMessages();
        showPage('loginPage');
        
        console.log('Logout successful');
        
    } catch (error) {
        console.error('Logout error:', error);
        showError('Error logging out. Please try again.', 'loginError');
    }
}

async function checkAuth() {
    try {
        console.log('Checking authentication status');
        
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            console.log('No authenticated user found');
            showPage('loginPage');
            return;
        }
        
        console.log('Authenticated user found:', user.id);
        currentUser = user;
        
        // Check if profile is complete
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (profileError && profileError.code !== 'PGRST116') {
            console.error('Profile check error:', profileError);
        }
        
        if (!profile) {
            console.log('Profile not found, showing profile page');
            showPage('profilePage');
        } else {
            console.log('Profile found, showing home page');
            showPage('homePage');
        }
        
    } catch (error) {
        console.error('Auth check error:', error);
        showPage('loginPage');
    }
}

async function updateWelcomeMessage() {
    if (!currentUser) return;
    
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, username')
            .eq('id', currentUser.id)
            .single();
        
        const welcomeEl = document.getElementById('userWelcome');
        if (welcomeEl && profile) {
            const displayName = profile.full_name || profile.username || 'User';
            welcomeEl.textContent = `Welcome, ${displayName}!`;
        }
    } catch (error) {
        console.error('Failed to load user profile for welcome message:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app');
    
    // Check authentication on page load
    checkAuth();
    
    // Navigation event listeners
    const goToSignup = document.getElementById('goToSignup');
    const goToLogin = document.getElementById('goToLogin');
    const backToSignup = document.getElementById('backToSignup');
    
    if (goToSignup) {
        goToSignup.addEventListener('click', (e) => {
            e.preventDefault();
            hideAllMessages();
            showPage('signupPage');
        });
    }
    
    if (goToLogin) {
        goToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            hideAllMessages();
            showPage('loginPage');
        });
    }
    
    if (backToSignup) {
        backToSignup.addEventListener('click', (e) => {
            e.preventDefault();
            hideAllMessages();
            currentUserEmail = '';
            otpRetryCount = 0;
            showPage('signupPage');
        });
    }
    
    // Form event listeners
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const otpForm = document.getElementById('otpForm');
    const profileForm = document.getElementById('profileForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignupEmail);
    }
    
    if (otpForm) {
        otpForm.addEventListener('submit', handleOtpVerification);
    }
    
    if (profileForm) {
        profileForm.addEventListener('submit', handleCompleteProfile);
    }
    
    // Button event listeners
    const resendOtpBtn = document.getElementById('resendOtp');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', resendOtp);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // OTP input enhancement
    const otpInput = document.getElementById('otpCode');
    if (otpInput) {
        otpInput.addEventListener('input', function(e) {
            // Only allow numbers
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            
            // Auto-submit when 6 digits are entered
            if (e.target.value.length === 6) {
                setTimeout(() => {
                    const otpForm = document.getElementById('otpForm');
                    if (otpForm) {
                        otpForm.dispatchEvent(new Event('submit'));
                    }
                }, 300);
            }
        });
        
        // Handle paste
        otpInput.addEventListener('paste', function(e) {
            setTimeout(() => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
            }, 0);
        });
    }
    
    // Navigation tabs in home page
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            navButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
        });
    });
    
    console.log('App initialization complete');
});

// Auth state listener
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event, session?.user?.id || 'no user');
    
    if (event === 'SIGNED_OUT') {
        currentUserEmail = '';
        currentUser = null;
        otpRetryCount = 0;
        hideAllMessages();
        showPage('loginPage');
    } else if (event === 'SIGNED_IN' && session?.user) {
        currentUser = session.user;
    }
});

// Handle browser refresh and navigation
window.addEventListener('beforeunload', () => {
    // Clear sensitive data before page unload
    if (!currentUser) {
        currentUserEmail = '';
        otpRetryCount = 0;
    }
});

// Error handling for uncaught errors
window.addEventListener('error', (error) => {
    console.error('Uncaught error:', error);
});

// Handle network errors
window.addEventListener('online', () => {
    console.log('Network connection restored');
});

window.addEventListener('offline', () => {
    console.log('Network connection lost');
    showError('Network connection lost. Please check your internet connection.', 'loginError');
});
