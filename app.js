// Supabase Configuration
const SUPABASE_URL = "https://lnmrfqiozzmjbrugnpep.supabase.co";
const SUPABASE_ANON_KEY ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubXJmcWlvenptamJydWducGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzg4MjAsImV4cCI6MjA2OTg1NDgyMH0.CUxbI2BWeQv-u0-IEuef7BtgfW98k23Apmj3zayth6k";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentEmail = '';
let currentUser = null;
let isPasswordReset = false;

// DOM elements
const forms = {
    login: document.getElementById('loginForm'),
    forgotPassword: document.getElementById('forgotPasswordForm'),
    resetSent: document.getElementById('resetSentForm'),
    newPassword: document.getElementById('newPasswordForm'),
    passwordUpdated: document.getElementById('passwordUpdatedForm'),
    email: document.getElementById('emailForm'),
    otp: document.getElementById('otpForm'),
    profile: document.getElementById('profileForm'),
    success: document.getElementById('successMessage'),
    home: document.getElementById('homePage')
};

const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// Utility functions
function showForm(formName) {
    Object.values(forms).forEach(form => form.classList.remove('active'));
    forms[formName].classList.add('active');
}

function showLoading() {
    loading.classList.add('active');
}

function hideLoading() {
    loading.classList.remove('active');
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.add('active');
}

function hideError() {
    errorMessage.classList.remove('active');
}

// Get URL parameters for password reset
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.substring(1));
    
    return {
        access_token: params.get('access_token') || hash.get('access_token'),
        refresh_token: params.get('refresh_token') || hash.get('refresh_token'),
        type: params.get('type') || hash.get('type'),
        expires_in: params.get('expires_in') || hash.get('expires_in')
    };
}

// Check if user is already logged in or handling password reset
async function checkAuth() {
    try {
        const urlParams = getUrlParams();
        
        // Check if this is a password reset callback
        if (urlParams.type === 'recovery' && urlParams.access_token) {
            isPasswordReset = true;
            
            // Set the session from URL parameters
            const { data, error } = await supabase.auth.setSession({
                access_token: urlParams.access_token,
                refresh_token: urlParams.refresh_token
            });
            
            if (error) throw error;
            
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show new password form
            showForm('newPassword');
            return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !isPasswordReset) {
            await loadUserProfile(user);
            showForm('home');
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showError('Authentication error. Please try again.');
    }
}

// Load user profile data
async function loadUserProfile(user) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        if (profile) {
            document.getElementById('userFullName').textContent = profile.full_name;
            document.getElementById('userUsername').textContent = profile.username;
            document.getElementById('userEmail').textContent = profile.email;
            currentUser = { ...user, profile };
        }
    } catch (error) {
        console.error('Profile load error:', error);
    }
}

// Login functionality
async function handleLogin(event) {
    event.preventDefault();
    showLoading();

    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!identifier || !password) {
        showError('Please fill in all fields');
        hideLoading();
        return;
    }

    try {
        // Try to sign in with email first
        let { data, error } = await supabase.auth.signInWithPassword({
            email: identifier,
            password: password
        });

        // If email login fails, try to find user by username
        if (error && error.message.includes('Invalid login credentials')) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', identifier)
                .single();

            if (profile) {
                const result = await supabase.auth.signInWithPassword({
                    email: profile.email,
                    password: password
                });
                data = result.data;
                error = result.error;
            }
        }

        if (error) throw error;

        await loadUserProfile(data.user);
        showForm('home');
    } catch (error) {
        showError('Invalid login credentials. Please check your username/email and password.');
    } finally {
        hideLoading();
    }
}

// Forgot password functionality
async function handleForgotPassword(event) {
    event.preventDefault();
    showLoading();

    const email = document.getElementById('resetEmail').value.trim();

    if (!email) {
        showError('Please enter your email address');
        hideLoading();
        return;
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });

        if (error) throw error;

        currentEmail = email;
        showForm('resetSent');
    } catch (error) {
        showError('Error sending reset email. Please try again.');
    } finally {
        hideLoading();
    }
}

// Handle new password setting
async function handleNewPassword(event) {
    event.preventDefault();
    showLoading();

    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (!newPassword || !confirmNewPassword) {
        showError('Please fill in both password fields');
        hideLoading();
        return;
    }

    if (newPassword !== confirmNewPassword) {
        showError('Passwords do not match');
        hideLoading();
        return;
    }

    if (newPassword.length < 6) {
        showError('Password must be at least 6 characters long');
        hideLoading();
        return;
    }

    try {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        isPasswordReset = false;
        showForm('passwordUpdated');
    } catch (error) {
        showError('Error updating password. Please try again.');
    } finally {
        hideLoading();
    }
}

// Email signup
async function handleEmailSignup(event) {
    event.preventDefault();
    showLoading();

    const email = document.getElementById('signupEmail').value.trim();
    currentEmail = email;

    if (!email) {
        showError('Please enter your email address');
        hideLoading();
        return;
    }

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: true
            }
        });

        if (error) throw error;

        // Display email in OTP form
        document.getElementById('otpEmailDisplay').textContent = email;
        showForm('otp');
    } catch (error) {
        showError('Error sending verification code. Please try again.');
    } finally {
        hideLoading();
    }
}

// OTP verification
async function handleOtpVerification(event) {
    event.preventDefault();
    showLoading();

    const otpCode = document.getElementById('otpCode').value;

    if (!otpCode || otpCode.length !== 6) {
        showError('Please enter the 6-digit verification code');
        hideLoading();
        return;
    }

    try {
        const { data, error } = await supabase.auth.verifyOtp({
            email: currentEmail,
            token: otpCode,
            type: 'email'
        });

        if (error) throw error;

        // Check if profile already exists
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        if (existingProfile) {
            // User already has a profile, go to home
            await loadUserProfile(data.user);
            showForm('home');
        } else {
            // New user, show profile setup
            currentUser = data.user;
            showForm('profile');
        }
    } catch (error) {
        showError('Invalid verification code. Please try again.');
    } finally {
        hideLoading();
    }
}

// Profile setup
async function handleProfileSetup(event) {
    event.preventDefault();
    showLoading();

    const username = document.getElementById('username').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    const password = document.getElementById('createPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!username || !fullName || !password || !confirmPassword) {
        showError('Please fill in all fields');
        hideLoading();
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        hideLoading();
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        hideLoading();
        return;
    }

    try {
        // Check if username is already taken
        const { data: existingUsername } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();

        if (existingUsername) {
            throw new Error('Username is already taken');
        }

        // Update user password
        const { error: passwordError } = await supabase.auth.updateUser({
            password: password
        });

        if (passwordError) throw passwordError;

        // Create profile
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([
                {
                    id: currentUser.id,
                    full_name: fullName,
                    username: username,
                    email: currentEmail
                }
            ]);

        if (profileError) throw profileError;

        showForm('success');
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

// Resend OTP
async function handleResendOtp() {
    showLoading();

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email: currentEmail,
            options: {
                shouldCreateUser: true
            }
        });

        if (error) throw error;

        showError('Verification code sent successfully!');
    } catch (error) {
        showError('Error resending code. Please try again.');
    } finally {
        hideLoading();
    }
}

// Go to home page
async function goToHome() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await loadUserProfile(user);
            showForm('home');
        }
    } catch (error) {
        showError('Error loading profile. Please try again.');
    }
}

// Logout
async function handleLogout() {
    try {
        await supabase.auth.signOut();
        currentUser = null;
        currentEmail = '';
        isPasswordReset = false;
        
        // Clear form data
        document.querySelectorAll('input').forEach(input => input.value = '');
        
        showForm('login');
    } catch (error) {
        showError('Error logging out. Please try again.');
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
    
    if (strength < 2) return 'weak';
    if (strength < 4) return 'medium';
    return 'strong';
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication on page load
    checkAuth();

    // Form submissions
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('forgotPasswordFormElement').addEventListener('submit', handleForgotPassword);
    document.getElementById('newPasswordFormElement').addEventListener('submit', handleNewPassword);
    document.getElementById('emailFormElement').addEventListener('submit', handleEmailSignup);
    document.getElementById('otpFormElement').addEventListener('submit', handleOtpVerification);
    document.getElementById('profileFormElement').addEventListener('submit', handleProfileSetup);

    // Navigation buttons
    document.getElementById('showSignup').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('email');
    });

    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login');
    });

    document.getElementById('showForgotPassword').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('forgotPassword');
    });

    document.getElementById('backToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login');
    });

    document.getElementById('backToLoginFromReset').addEventListener('click', () => {
        showForm('login');
    });

    document.getElementById('loginAfterReset').addEventListener('click', () => {
        showForm('login');
    });

    // Other buttons
    document.getElementById('resendOtp').addEventListener('click', handleResendOtp);
    document.getElementById('goToHome').addEventListener('click', goToHome);
    document.getElementById('logout').addEventListener('click', handleLogout);
    document.getElementById('closeError').addEventListener('click', hideError);

    // Real-time validation
    document.getElementById('confirmPassword').addEventListener('input', function() {
        const password = document.getElementById('createPassword').value;
        const confirmPassword = this.value;
        
        if (password && confirmPassword && password !== confirmPassword) {
            this.style.borderColor = '#dc3545';
        } else {
            this.style.borderColor = '#e1e5e9';
        }
    });

    document.getElementById('confirmNewPassword').addEventListener('input', function() {
        const password = document.getElementById('newPassword').value;
        const confirmPassword = this.value;
        
        if (password && confirmPassword && password !== confirmPassword) {
            this.style.borderColor = '#dc3545';
        } else {
            this.style.borderColor = '#e1e5e9';
        }
    });

    // Username availability check
    document.getElementById('username').addEventListener('blur', async function() {
        const username = this.value.trim();
        if (username.length > 0) {
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('username', username)
                    .single();

                if (data) {
                    this.style.borderColor = '#dc3545';
                } else {
                    this.style.borderColor = '#28a745';
                }
            } catch (error) {
                // Username is available
                this.style.borderColor = '#28a745';
            }
        }
    });

    // OTP input formatting
    document.getElementById('otpCode').addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').substring(0, 6);
        
        // Auto-submit when 6 digits entered
        if (this.value.length === 6) {
            setTimeout(() => {
                document.getElementById('otpFormElement').dispatchEvent(new Event('submit'));
            }, 100);
        }
    });

    // Password strength indicators
    ['createPassword', 'newPassword'].forEach(passwordFieldId => {
        const field = document.getElementById(passwordFieldId);
        if (field) {
            field.addEventListener('input', function() {
                const strength = checkPasswordStrength(this.value);
                
                // Remove existing indicator
                const existingIndicator = this.parentNode.querySelector('.password-strength');
                if (existingIndicator) {
                    existingIndicator.remove();
                }
                
                // Add new indicator
                if (this.value.length > 0) {
                    const indicator = document.createElement('div');
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
    console.log('Auth state changed:', event, session);
    
    if (event === 'SIGNED_IN' && session && !isPasswordReset) {
        console.log('User signed in:', session.user);
    } else if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        if (!isPasswordReset) {
            showForm('login');
        }
    }
});

