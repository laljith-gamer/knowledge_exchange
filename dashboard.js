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
  initializeSocialFeatures();
});

/* ---------- load user data ---------- */
function loadUserData(user) {
  // Update profile info if elements exist
  const profileName = $("profile-name");
  const profileEmail = $("profile-email");
  const profileDate = $("profile-date");
  const avatarText = $("avatar-text");
  const modalUsername = $("modal-username");
  const previewUsername = $("preview-username");

  const username = user.user_metadata?.username || "User";
  const firstLetter = username.charAt(0).toUpperCase();

  if (profileName) profileName.textContent = username;
  if (profileEmail) profileEmail.textContent = user.email;
  if (profileDate)
    profileDate.textContent = new Date(user.created_at).toLocaleDateString();
  if (avatarText) avatarText.textContent = firstLetter;
  if (modalUsername) modalUsername.textContent = username;
  if (previewUsername) previewUsername.textContent = username;

  // Pre-fill profile form if it exists
  const updateUsername = $("update-username");
  const updateEmail = $("update-email");

  if (updateUsername) updateUsername.value = username;
  if (updateEmail) updateEmail.value = user.email;
}

/* ---------- social media features ---------- */
function initializeSocialFeatures() {
  // Double tap functionality
  const doubleTapBtns = document.querySelectorAll(".double-tap-btn");
  doubleTapBtns.forEach((btn) => {
    let tapCount = 0;
    btn.addEventListener("click", (e) => {
      tapCount++;
      if (tapCount === 1) {
        setTimeout(() => {
          if (tapCount === 1) {
            // Single tap - show preview or basic info
            console.log("Single tap");
          } else if (tapCount === 2) {
            // Double tap - show request modal
            const postId = btn.dataset.postId;
            showRequestModal(postId);
          }
          tapCount = 0;
        }, 300);
      }
    });
  });

  // Preview form updates
  updatePreview();
}

/* ---------- request modal ---------- */
function showRequestModal(postId) {
  const modal = $("request-modal");
  if (modal) {
    modal.classList.remove("hidden");

    // Store post ID for form submission
    const form = $("request-form");
    if (form) {
      form.dataset.postId = postId;
    }
  }
}

function hideRequestModal() {
  const modal = $("request-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
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

  // Create secret form
  const createSecretForm = $("create-secret-form");
  if (createSecretForm) {
    createSecretForm.onsubmit = createSecret;

    // Form field listeners for preview
    ["secret-title", "secret-teaser", "secret-category"].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("input", updatePreview);
      }
    });

    // Teaching method change
    const teachingMethods = document.querySelectorAll(
      'input[name="teaching-method"]'
    );
    teachingMethods.forEach((method) => {
      method.addEventListener("change", (e) => {
        updatePreview();
        showMethodDetails(e.target.value);
      });
    });

    // Character counters
    const titleInput = $("secret-title");
    const teaserInput = $("secret-teaser");
    if (titleInput) {
      titleInput.addEventListener("input", () =>
        updateCharCount("secret-title", 100)
      );
    }
    if (teaserInput) {
      teaserInput.addEventListener("input", () =>
        updateCharCount("secret-teaser", 200)
      );
    }
  }

  // Request modal events
  const closeModal = document.querySelector(".close-modal");
  const cancelRequest = $("cancel-request");
  const requestForm = $("request-form");

  if (closeModal) closeModal.onclick = hideRequestModal;
  if (cancelRequest) cancelRequest.onclick = hideRequestModal;
  if (requestForm) requestForm.onsubmit = submitRequest;

  // Add step functionality
  const addStepBtn = $("add-step");
  if (addStepBtn) {
    addStepBtn.onclick = addStep;
  }

  // Remove step functionality
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-step")) {
      e.target.parentElement.remove();
    }
  });
}

/* ---------- preview updates ---------- */
function updatePreview() {
  const titleEl = $("secret-title");
  const teaserEl = $("secret-teaser");
  const categoryEl = $("secret-category");
  const teachingMethod = document.querySelector(
    'input[name="teaching-method"]:checked'
  );

  const previewTitle = $("preview-title");
  const previewTeaser = $("preview-teaser");
  const previewCategory = $("preview-category");
  const previewMethod = $("preview-method");

  if (previewTitle && titleEl) {
    previewTitle.textContent = titleEl.value || "Your Secret Title";
  }

  if (previewTeaser && teaserEl) {
    previewTeaser.textContent =
      teaserEl.value || "Your teaser will appear here...";
  }

  if (previewCategory && categoryEl) {
    const selectedOption = categoryEl.options[categoryEl.selectedIndex];
    previewCategory.textContent =
      selectedOption.textContent.split(" ").slice(1).join(" ") || "Category";
  }

  if (previewMethod && teachingMethod) {
    const methodLabels = {
      free: "💚 Teaching for Free",
      exchange: "🔄 Skill Exchange Only",
      contract: "💰 Contract Required",
      mood: "😊 Based on Mood",
    };
    previewMethod.textContent =
      methodLabels[teachingMethod.value] || "Select teaching method";
    previewMethod.className = `method-tag ${teachingMethod.value}`;
  }
}

function updateCharCount(inputId, maxLength) {
  const input = $(inputId);
  const counter = input.nextElementSibling;
  if (counter && counter.classList.contains("char-count")) {
    const currentLength = input.value.length;
    counter.textContent = `${currentLength}/${maxLength}`;
    counter.style.color = currentLength > maxLength ? "#dc3545" : "#6c757d";
  }
}

function showMethodDetails(method) {
  const exchangeDetails = $("exchange-details");
  const contractDetails = $("contract-details");

  if (exchangeDetails) {
    exchangeDetails.style.display = method === "exchange" ? "block" : "none";
  }

  if (contractDetails) {
    contractDetails.style.display = method === "contract" ? "block" : "none";
  }
}

/* ---------- form submissions ---------- */
async function createSecret(e) {
  e.preventDefault();

  const formData = {
    title: $("secret-title").value,
    category: $("secret-category").value,
    teaser: $("secret-teaser").value,
    content: $("secret-content").value,
    tags: $("secret-tags").value,
    teachingMethod: document.querySelector(
      'input[name="teaching-method"]:checked'
    )?.value,
    visibility: document.querySelector('input[name="visibility"]:checked')
      ?.value,
    allowComments: $("allow-comments")?.checked,
    notifyRequests: $("notify-requests")?.checked,
  };

  // Validate required fields
  if (
    !formData.title ||
    !formData.category ||
    !formData.teaser ||
    !formData.content
  ) {
    showMessage(
      "create-message",
      "Please fill in all required fields",
      "error"
    );
    return;
  }

  // Simulate saving (implement actual database logic here)
  showMessage("create-message", "Secret shared successfully! 🎉", "success");
  setTimeout(() => {
    window.location.href = "home.html";
  }, 2000);
}

async function submitRequest(e) {
  e.preventDefault();

  const postId = e.target.dataset.postId;
  const reason = $("request-reason").value;
  const offerType = document.querySelector(
    'input[name="offer-type"]:checked'
  )?.value;
  const offerDetails = $("offer-details").value;

  if (!reason || !offerType || !offerDetails) {
    alert("Please fill in all fields");
    return;
  }

  // Simulate request submission
  console.log("Request submitted:", {
    postId,
    reason,
    offerType,
    offerDetails,
  });

  hideRequestModal();
  showMessage("profile-message", "Request sent successfully!", "success");

  // Reset form
  e.target.reset();
}

function addStep() {
  const container = $("steps-container");
  const stepCount = container.querySelectorAll(".step-input").length + 1;

  const stepDiv = document.createElement("div");
  stepDiv.className = "step-input";
  stepDiv.innerHTML = `
    <input type="text" placeholder="Step ${stepCount}" name="step">
    <button type="button" class="remove-step">×</button>
  `;

  container.appendChild(stepDiv);
}

/* ---------- existing functions ---------- */
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

async function logout() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}
