const sb = window.supabaseClient;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const showMessage = (id, msg, type = "info") => {
  const el = $(id);
  if (el) {
    el.textContent = msg;
    el.className = `message ${type}`;
    setTimeout(() => (el.textContent = ""), 5000);
  }
};

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    window.location.href = "index.html";
    return;
  }

  loadUserData(session.user);
  bindDashboardEvents();
});

/* ---------- load user data ---------- */
function loadUserData(user) {
  // Update profile info if elements exist
  const profileName = $("profile-name");
  const profileEmail = $("profile-email");
  const profileDate = $("profile-date");
  const avatarText = $("avatar-text");

  if (profileName)
    profileName.textContent = user.user_metadata?.username || "User";
  if (profileEmail) profileEmail.textContent = user.email;
  if (profileDate)
    profileDate.textContent = new Date(user.created_at).toLocaleDateString();
  if (avatarText)
    avatarText.textContent = (user.user_metadata?.username || user.email)
      .charAt(0)
      .toUpperCase();

  // Pre-fill profile form if it exists
  const updateUsername = $("update-username");
  const updateEmail = $("update-email");

  if (updateUsername) updateUsername.value = user.user_metadata?.username || "";
  if (updateEmail) updateEmail.value = user.email;
}

/* ---------- dashboard events ---------- */
function bindDashboardEvents() {
  // Logout functionality
  const logoutBtn = $("logout");
  if (logoutBtn) {
    logoutBtn.onclick = logout;
  }

  // Profile update form
  const updateProfileForm = $("update-profile");
  if (updateProfileForm) {
    updateProfileForm.onsubmit = updateProfile;
  }

  // Change password form
  const changePasswordForm = $("change-password");
  if (changePasswordForm) {
    changePasswordForm.onsubmit = changePassword;
  }

  // Quick create form
  const quickCreateForm = $("quick-create-form");
  if (quickCreateForm) {
    quickCreateForm.onsubmit = quickCreate;
  }
}

/* ---------- profile update ---------- */
async function updateProfile(e) {
  e.preventDefault();
  const username = $("update-username").value.trim();

  if (!username) {
    showMessage("profile-message", "Username is required", "error");
    return;
  }

  try {
    const { data, error } = await sb.auth.updateUser({
      data: { username: username },
    });

    if (error) throw error;

    showMessage("profile-message", "Profile updated successfully!", "success");
    loadUserData(data.user);
  } catch (error) {
    showMessage("profile-message", error.message, "error");
  }
}

/* ---------- change password ---------- */
async function changePassword(e) {
  e.preventDefault();
  const newPass = $("new-pass").value;
  const confirmPass = $("confirm-pass").value;

  if (newPass !== confirmPass) {
    showMessage("profile-message", "Passwords do not match", "error");
    return;
  }

  if (newPass.length < 6) {
    showMessage(
      "profile-message",
      "Password must be at least 6 characters",
      "error"
    );
    return;
  }

  try {
    const { error } = await sb.auth.updateUser({
      password: newPass,
    });

    if (error) throw error;

    showMessage("profile-message", "Password changed successfully!", "success");
    e.target.reset();
  } catch (error) {
    showMessage("profile-message", error.message, "error");
  }
}

/* ---------- quick create ---------- */
async function quickCreate(e) {
  e.preventDefault();
  const type = $("item-type").value;
  const title = $("item-title").value.trim();
  const description = $("item-description").value.trim();

  if (!type || !title) {
    showMessage("create-message", "Type and title are required", "error");
    return;
  }

  // Simulate creating item (you can implement actual database logic here)
  showMessage(
    "create-message",
    `${type} "${title}" created successfully!`,
    "success"
  );
  e.target.reset();
}

/* ---------- logout ---------- */
async function logout() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}
