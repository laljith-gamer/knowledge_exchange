const sb = window.supabaseClient;

/* ---------- STATE VARIABLES ---------- */
let currentUser = null;
let videosLoaded = 0;
const videosPerPage = 10;
let uploadStartTime = null;
let isUploading = false;
let currentFilter = "all";
let currentCategory = "";
let currentVideoIdForComments = null;

/* ---------- HELPER FUNCTIONS ---------- */
const $ = (id) => document.getElementById(id);

const showMessage = (id, msg, type = "info") => {
  const el = $(id);
  if (el) {
    el.textContent = msg;
    el.className = `message ${type}`;
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = "";
        el.className = "message";
      }
    }, 5000);
  }
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const getTimeAgo = (date) => {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

const updateCharCount = (inputId, maxLength) => {
  const input = $(inputId);
  if (!input) return;

  const counter = input.parentElement.querySelector(".char-count");
  if (counter) {
    const currentLength = input.value.length;
    counter.textContent = `${currentLength}/${maxLength}`;
    counter.style.color =
      currentLength > maxLength ? "var(--danger-color)" : "var(--muted-text)";
  }
};

const showLoadingOverlay = (show, message = "Processing...") => {
  const overlay = $("loading-overlay");
  if (overlay) {
    overlay.classList.toggle("hidden", !show);
    if (show && overlay.querySelector("p")) {
      overlay.querySelector("p").textContent = message;
    }
  }
};

/* ---------- INITIALIZATION ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM Content Loaded - Starting initialization...");

  try {
    const {
      data: { session },
      error,
    } = await sb.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      window.location.href = "index.html";
      return;
    }

    if (!session?.user) {
      window.location.href = "index.html";
      return;
    }

    currentUser = session.user;
    console.log("Current user:", currentUser);

    await loadUserProfile(session.user);

    // Wait for DOM to be fully ready, then bind events
    setTimeout(() => {
      console.log("Binding dashboard events...");
      bindDashboardEvents();

      // Load content based on current page
      const pathname = window.location.pathname;
      console.log("Current pathname:", pathname);

      if (
        pathname.includes("home.html") ||
        pathname === "/" ||
        pathname.endsWith("/")
      ) {
        console.log("Loading home content...");
        loadVideoFeed();
        loadNotifications();
      }

      if (pathname.includes("createone.html")) {
        console.log("Initializing upload form...");
        initializeUploadForm();
      }

      if (pathname.includes("profile.html")) {
        console.log("Loading profile data...");
        loadUserProfileData();
      }
    }, 300);
  } catch (error) {
    console.error("Initialization error:", error);
    window.location.href = "index.html";
  }
});

/* ---------- USER PROFILE MANAGEMENT ---------- */
async function loadUserProfile(user) {
  try {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Profile load error:", error);
      return;
    }

    const username =
      profile?.username || user.user_metadata?.username || "User";
    const fullName = profile?.full_name || user.user_metadata?.full_name || "";

    // Update UI elements
    const profileName = $("profile-name");
    const profileEmail = $("profile-email");
    const profileDate = $("profile-date");
    const modalUsername = $("modal-username");

    if (profileName) profileName.textContent = username;
    if (profileEmail) profileEmail.textContent = user.email;
    if (profileDate)
      profileDate.textContent = new Date(user.created_at).toLocaleDateString();
    if (modalUsername) modalUsername.textContent = username;

    // Update avatars
    document
      .querySelectorAll(
        ".user-avatar, #modal-avatar, #comment-user-avatar, #profile-avatar"
      )
      .forEach((avatar) => {
        if (avatar) {
          avatar.textContent = username.charAt(0).toUpperCase();
        }
      });
  } catch (error) {
    console.error("Load profile error:", error);
  }
}

async function loadUserProfileData() {
  try {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (profile) {
      // Update form fields
      if ($("update-username"))
        $("update-username").value = profile.username || "";
      if ($("update-fullname"))
        $("update-fullname").value = profile.full_name || "";
      if ($("update-bio")) $("update-bio").value = profile.bio || "";
      if ($("update-instagram"))
        $("update-instagram").value = profile.instagram_handle || "";
      if ($("update-website"))
        $("update-website").value = profile.website_url || "";

      // Update display elements
      if ($("profile-display-name"))
        $("profile-display-name").textContent =
          profile.username || "Unknown User";
      if ($("profile-display-email"))
        $("profile-display-email").textContent = currentUser.email;

      // Update stats
      if ($("videos-count"))
        $("videos-count").textContent = profile.videos_count || 0;
      if ($("followers-count"))
        $("followers-count").textContent = profile.followers_count || 0;
      if ($("following-count"))
        $("following-count").textContent = profile.following_count || 0;
      if ($("total-views"))
        $("total-views").textContent = profile.total_views || 0;

      // Update privacy settings
      if ($("profile-public"))
        $("profile-public").checked = profile.is_public !== false;
      if ($("allow-requests"))
        $("allow-requests").checked = profile.allow_requests !== false;

      // Update avatar
      const avatars = document.querySelectorAll(
        "#profile-avatar, #modal-avatar, #comment-user-avatar"
      );
      avatars.forEach((avatar) => {
        if (avatar) {
          avatar.textContent = (profile.username || "U")
            .charAt(0)
            .toUpperCase();
        }
      });

      updateBioCharCount();
    }
  } catch (error) {
    console.error("Error loading profile data:", error);
    showMessage("profile-message", "Error loading profile data", "error");
  }
}

/* ---------- EVENT BINDING ---------- */
function bindDashboardEvents() {
  console.log("=== BINDING DASHBOARD EVENTS ===");

  // Logout functionality
  const logoutBtn = $("logout");
  if (logoutBtn) {
    logoutBtn.onclick = logout;
    console.log("✓ Logout button bound");
  }

  // Filter tabs - FIXED WITH PROPER EVENT BINDING
  const filterTabs = document.querySelectorAll(".filter-tab");
  console.log(`Found ${filterTabs.length} filter tabs`);

  filterTabs.forEach((tab, index) => {
    if (tab) {
      console.log(`Binding filter tab ${index}:`, tab.dataset.filter);

      // Remove any existing listeners
      tab.replaceWith(tab.cloneNode(true));
      const newTab = document.querySelectorAll(".filter-tab")[index];

      newTab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log("Filter tab clicked:", e.target.dataset.filter);

        // Remove active class from all tabs
        document
          .querySelectorAll(".filter-tab")
          .forEach((t) => t.classList.remove("active"));

        // Add active class to clicked tab
        e.target.classList.add("active");

        // Update filter
        currentFilter = e.target.dataset.filter;
        videosLoaded = 0;
        loadVideoFeed();
      });
    }
  });

  // Category filter dropdown
  const categoryFilter = $("category-filter");
  if (categoryFilter) {
    categoryFilter.addEventListener("change", (e) => {
      console.log("Category filter changed:", e.target.value);
      currentCategory = e.target.value;
      videosLoaded = 0;
      loadVideoFeed();
    });
    console.log("✓ Category filter bound");
  }

  // Story items - FIXED WITH PROPER EVENT BINDING
  const storyItems = document.querySelectorAll(".story-item");
  console.log(`Found ${storyItems.length} story items`);

  storyItems.forEach((item, index) => {
    if (item) {
      console.log(`Binding story item ${index}:`, item.dataset.category);

      // Remove any existing listeners
      item.replaceWith(item.cloneNode(true));
      const newItem = document.querySelectorAll(".story-item")[index];

      newItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log("Story item clicked:", e.currentTarget.dataset.category);

        const category = e.currentTarget.dataset.category;
        currentCategory = category;

        if (categoryFilter) categoryFilter.value = category;
        videosLoaded = 0;
        loadVideoFeed();
      });
    }
  });

  // Load more button
  const loadMoreBtn = $("load-more");
  if (loadMoreBtn) {
    loadMoreBtn.onclick = loadMoreVideos;
    console.log("✓ Load more button bound");
  }

  // Notifications
  const notificationsBtn = $("notifications-btn");
  if (notificationsBtn) {
    notificationsBtn.onclick = toggleNotifications;
    console.log("✓ Notifications button bound");
  }

  // Modal events
  const requestModal = $("request-modal");
  const closeModals = document.querySelectorAll(".close-modal");
  const cancelRequest = $("cancel-request");
  const requestForm = $("request-form");

  closeModals.forEach((btn) => {
    btn.onclick = () => {
      const modal = btn.closest(".modal");
      if (modal) modal.classList.add("hidden");
    };
  });

  if (cancelRequest)
    cancelRequest.onclick = () => requestModal?.classList.add("hidden");
  if (requestForm) requestForm.onsubmit = handleSecretRequest;

  // Comment functionality
  const commentForm = $("comment-form");
  if (commentForm) commentForm.onsubmit = handleCommentSubmit;

  const commentInput = $("comment-input");
  if (commentInput) commentInput.oninput = updateCommentCharCount;

  // Upload form events
  const uploadForm = $("upload-form");
  if (uploadForm) uploadForm.onsubmit = uploadVideo;

  const saveDraftBtn = $("save-draft");
  if (saveDraftBtn) saveDraftBtn.onclick = saveDraft;

  // Profile functionality
  const updateProfileForm = $("update-profile-form");
  if (updateProfileForm) updateProfileForm.onsubmit = handleProfileUpdate;

  const changePasswordForm = $("change-password-form");
  if (changePasswordForm) changePasswordForm.onsubmit = handlePasswordChange;

  const savePrivacyBtn = $("save-privacy-settings");
  if (savePrivacyBtn) savePrivacyBtn.onclick = handlePrivacySettings;

  const bioInput = $("update-bio");
  if (bioInput) bioInput.oninput = updateBioCharCount;

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.classList.add("hidden");
    }
  });

  // **CRITICAL FIX: Event delegation for dynamically created buttons**
  document.addEventListener("click", function (e) {
    // Handle request access buttons
    if (
      e.target.classList.contains("double-tap-btn") ||
      e.target.closest(".double-tap-btn")
    ) {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.target.classList.contains("double-tap-btn")
        ? e.target
        : e.target.closest(".double-tap-btn");
      const videoId = btn.dataset.videoId;

      console.log(
        "Request access button clicked via delegation! Video ID:",
        videoId
      );

      if (videoId) {
        showRequestModal(videoId);
      } else {
        console.error("No video ID found on request button");
        showMessage("profile-message", "Error: No video ID found", "error");
      }
    }

    // Handle like buttons
    if (
      e.target.classList.contains("like-btn") ||
      e.target.closest(".like-btn")
    ) {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.target.classList.contains("like-btn")
        ? e.target
        : e.target.closest(".like-btn");
      const videoId = btn.dataset.videoId;

      if (videoId) {
        toggleLike(videoId, btn);
      }
    }

    // Handle comment buttons
    if (
      e.target.classList.contains("comment-btn") ||
      e.target.closest(".comment-btn")
    ) {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.target.classList.contains("comment-btn")
        ? e.target
        : e.target.closest(".comment-btn");
      const videoId = btn.dataset.videoId;

      if (videoId) {
        showCommentsModal(videoId);
      }
    }

    // Handle share buttons
    if (
      e.target.classList.contains("share-btn") ||
      e.target.closest(".share-btn")
    ) {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.target.classList.contains("share-btn")
        ? e.target
        : e.target.closest(".share-btn");
      const videoId = btn.dataset.videoId;

      if (videoId) {
        // Find the video data (you might need to store this differently)
        const postCard = btn.closest(".post-card");
        if (postCard) {
          const videoTitle =
            postCard.querySelector(".video-title")?.textContent ||
            "Check out this video";
          const videoDescription =
            postCard.querySelector(".video-description")?.textContent || "";

          shareVideo({
            id: videoId,
            title: videoTitle,
            description: videoDescription,
            secret_preview: videoDescription,
          });
        }
      }
    }
  });

  console.log("=== EVENT BINDING COMPLETE ===");
}

// GLOBAL FUNCTIONS FOR MANUAL TESTING
window.changeFilter = function (filter, element) {
  console.log("Manual filter change:", filter);

  // Remove active from all tabs
  document
    .querySelectorAll(".filter-tab")
    .forEach((tab) => tab.classList.remove("active"));

  // Add active to clicked tab
  if (element) element.classList.add("active");

  // Update global state
  currentFilter = filter;
  videosLoaded = 0;
  loadVideoFeed();
};

window.changeCategory = function (category) {
  console.log("Manual category change:", category);

  currentCategory = category;
  const categoryFilter = $("category-filter");
  if (categoryFilter) categoryFilter.value = category;

  videosLoaded = 0;
  loadVideoFeed();
};

function initializeUploadForm() {
  const videoFile = $("video-file");
  if (videoFile) {
    // Remove any existing event listeners to prevent duplicates
    videoFile.removeEventListener("change", handleVideoSelect);
    videoFile.addEventListener("change", handleVideoSelect);
    console.log("✓ Video file input bound successfully");
  }

  const removeVideo = $("remove-video");
  if (removeVideo) {
    removeVideo.removeEventListener("click", removeVideoPreview);
    removeVideo.addEventListener("click", removeVideoPreview);
    console.log("✓ Remove video button bound successfully");
  }

  // Character counters
  const titleInput = $("video-title");
  const descInput = $("video-description");
  const previewInput = $("secret-preview");

  if (titleInput)
    titleInput.addEventListener("input", () =>
      updateCharCount("video-title", 200)
    );
  if (descInput)
    descInput.addEventListener("input", () =>
      updateCharCount("video-description", 500)
    );
  if (previewInput)
    previewInput.addEventListener("input", () =>
      updateCharCount("secret-preview", 300)
    );

  // Secret options toggle
  const isSecretCheckbox = $("is-secret");
  const secretOptions = $("secret-options");
  const priceGroup = $("price-group");
  const accessTypeInputs = document.querySelectorAll(
    'input[name="access-type"]'
  );

  if (isSecretCheckbox && secretOptions) {
    isSecretCheckbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        secretOptions.classList.remove("hidden");
      } else {
        secretOptions.classList.add("hidden");
      }
    });
  }

  // Access type change handler
  accessTypeInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      if (e.target.value === "paid" && priceGroup) {
        priceGroup.style.display = "block";
        const priceInput = $("price");
        if (priceInput) priceInput.required = true;
      } else if (priceGroup) {
        priceGroup.style.display = "none";
        const priceInput = $("price");
        if (priceInput) priceInput.required = false;
      }
    });
  });

  // Drag and drop
  const uploadArea = $("video-upload-area");
  if (uploadArea) {
    uploadArea.addEventListener("dragover", handleDragOver);
    uploadArea.addEventListener("dragleave", handleDragLeave);
    uploadArea.addEventListener("drop", handleDrop);
  }

  // Load draft
  loadDraft();
}

/* ---------- REQUEST MANAGEMENT FUNCTIONALITY ---------- */
async function loadCreatorRequests() {
  console.log("Loading creator requests...");

  const requestsList = $("requests-list");
  const requestsCount = $("pending-requests-count");

  if (!requestsList) {
    console.log("Requests list element not found, skipping...");
    return;
  }

  try {
    requestsList.innerHTML = `
      <div class="loading-requests">
        <div class="loading-spinner small"></div>
        <p>Loading requests...</p>
      </div>
    `;

    const { data: requests, error } = await sb.rpc("get_creator_requests", {
      p_creator_id: currentUser.id,
    });

    if (error) {
      console.log("RPC function not found, trying fallback query...");

      // Fallback direct query
      const { data: fallbackRequests, error: fallbackError } = await sb
        .from("secret_requests")
        .select(
          `
          id,
          reason,
          offer_type,
          offer_details,
          status,
          created_at,
          video_id,
          videos!inner(title),
          profiles!secret_requests_requester_id_fkey(username)
        `
        )
        .eq("creator_id", currentUser.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (fallbackError) throw fallbackError;

      const formattedRequests =
        fallbackRequests?.map((request) => ({
          id: request.id,
          video_title: request.videos?.title || "Unknown Video",
          requester_username: request.profiles?.username || "Unknown User",
          requester_email: "N/A",
          reason: request.reason,
          offer_type: request.offer_type,
          offer_details: request.offer_details,
          status: request.status,
          created_at: request.created_at,
          video_id: request.video_id,
        })) || [];

      renderRequestsList(formattedRequests, requestsList, requestsCount);
      return;
    }

    renderRequestsList(requests || [], requestsList, requestsCount);
  } catch (error) {
    console.error("Error loading requests:", error);
    requestsList.innerHTML = `
      <div class="error-requests">
        <p>Failed to load requests. Please try again.</p>
        <button onclick="loadCreatorRequests()" class="btn secondary small">Retry</button>
      </div>
    `;
  }
}

function renderRequestsList(requests, requestsList, requestsCount) {
  console.log(`Found ${requests?.length || 0} pending requests`);

  // Update requests count badge
  if (requestsCount) {
    const count = requests?.length || 0;
    if (count > 0) {
      requestsCount.textContent = count;
      requestsCount.style.display = "inline-block";
    } else {
      requestsCount.style.display = "none";
    }
  }

  if (requests && requests.length > 0) {
    requestsList.innerHTML = requests
      .map((request) => createRequestHTML(request))
      .join("");
  } else {
    requestsList.innerHTML = `
      <div class="no-requests">
        <p>No pending requests at the moment.</p>
        <p style="font-size: 14px; color: var(--muted-text);">When users request access to your secret videos, they'll appear here.</p>
      </div>
    `;
  }
}

function createRequestHTML(request) {
  const timeAgo = getTimeAgo(new Date(request.created_at));
  const avatarLetter = request.requester_username.charAt(0).toUpperCase();

  return `
    <div class="request-item" data-request-id="${request.id}">
      <div class="request-header">
        <div class="user-avatar small">${avatarLetter}</div>
        <div class="request-meta">
          <h4 class="request-username">${request.requester_username}</h4>
          <p class="request-video">wants to learn: <strong>${
            request.video_title
          }</strong></p>
          <span class="request-time">${timeAgo}</span>
        </div>
      </div>
      
      <div class="request-content">
        <div class="request-reason">
          <h5>Why they want to learn:</h5>
          <p>${request.reason}</p>
        </div>
        
        <div class="request-offer">
          <h5>What they're offering:</h5>
          <p><strong>${
            request.offer_type.charAt(0).toUpperCase() +
            request.offer_type.slice(1)
          }:</strong> ${request.offer_details}</p>
        </div>
      </div>
      
      <div class="request-actions">
        <button class="btn primary small" onclick="handleRequestDecision('${
          request.id
        }', 'approved')">
          ✅ Approve
        </button>
        <button class="btn secondary small" onclick="handleRequestDecision('${
          request.id
        }', 'rejected')">
          ❌ Decline  
        </button>
      </div>
    </div>
  `;
}

async function handleRequestDecision(requestId, decision) {
  console.log(`${decision} request:`, requestId);

  const response =
    decision === "approved"
      ? prompt("Optional: Add a message for the requester:")
      : prompt("Optional: Explain why you're declining:");

  try {
    // First try RPC function
    let result;
    try {
      const { data: rpcResult, error: rpcError } = await sb.rpc(
        "handle_request_decision",
        {
          p_request_id: requestId,
          p_creator_id: currentUser.id,
          p_decision: decision,
          p_response: response || null,
        }
      );

      if (rpcError) throw rpcError;
      result = rpcResult;
    } catch (rpcError) {
      console.log("RPC function not available, using manual approach...");

      // Manual approach
      const { error: updateError } = await sb
        .from("secret_requests")
        .update({
          status: decision,
          creator_response: response || null,
          responded_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("creator_id", currentUser.id);

      if (updateError) throw updateError;

      // If approved, grant access manually
      if (decision === "approved") {
        const { data: requestData } = await sb
          .from("secret_requests")
          .select("requester_id, video_id")
          .eq("id", requestId)
          .single();

        if (requestData) {
          await sb
            .from("video_access")
            .insert({
              user_id: requestData.requester_id,
              video_id: requestData.video_id,
              access_method: "request",
            })
            .onConflict("user_id,video_id")
            .ignore();
        }
      }

      result = { success: true };
    }

    if (result && result.success !== false) {
      showMessage(
        "profile-message",
        `Request ${decision} successfully! 🎉`,
        "success"
      );

      // Reload requests list
      loadCreatorRequests();

      // Reload video feed to update counts
      videosLoaded = 0;
      loadVideoFeed();
    } else {
      showMessage(
        "profile-message",
        result?.message || "Failed to process request",
        "error"
      );
    }
  } catch (error) {
    console.error("Error processing request:", error);
    showMessage(
      "profile-message",
      "Failed to process request. Please try again.",
      "error"
    );
  }
}

function showRequestsModal() {
  const modal = $("requests-modal");
  if (modal) {
    modal.classList.remove("hidden");
    loadCreatorRequests();
  } else {
    console.log("Requests modal not found - add the HTML modal to your page");
    showMessage(
      "profile-message",
      "Requests feature not available - contact developer",
      "info"
    );
  }
}

/* ---------- VIDEO FEED FUNCTIONALITY ---------- */
async function loadVideoFeed() {
  console.log(
    "Loading video feed with filter:",
    currentFilter,
    "category:",
    currentCategory
  );

  const loading = $("loading");
  const feedPosts = $("feed-posts");
  const loadMoreBtn = $("load-more");

  try {
    if (loading) loading.style.display = "block";
    if (feedPosts && videosLoaded === 0) {
      feedPosts.innerHTML =
        '<div id="loading" class="loading-container"><div class="loading-spinner"></div><p>Loading knowledge feed...</p></div>';
    }

    // Build query based on filters
    let query = sb
      .from("videos")
      .select(
        `
        *,
        profiles:user_id (
          username,
          full_name,
          avatar_url,
          is_verified
        )
      `
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(videosLoaded, videosLoaded + videosPerPage - 1);

    // Apply filters
    if (currentCategory) {
      query = query.eq("category", currentCategory);
    }

    if (currentFilter !== "all") {
      if (currentFilter === "free") {
        query = query.eq("access_type", "free");
      } else if (currentFilter === "paid") {
        query = query.eq("access_type", "paid");
      } else if (currentFilter === "exchange") {
        query = query.eq("access_type", "exchange");
      } else if (currentFilter === "following") {
        // Add following filter logic here
        const { data: following } = await sb
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", currentUser.id);

        if (following && following.length > 0) {
          const followingIds = following.map((f) => f.following_id);
          query = query.in("user_id", followingIds);
        } else {
          // If not following anyone, return empty result
          query = query.eq("user_id", "none");
        }
      }
    }

    console.log("Executing video query...");
    const { data: videos, error } = await query;

    if (error) throw error;

    console.log(`Loaded ${videos?.length || 0} videos`);

    if (loading) loading.style.display = "none";

    if (videos && videos.length > 0) {
      if (videosLoaded === 0 && feedPosts) {
        feedPosts.innerHTML = "";
      }

      for (const video of videos) {
        const videoCard = await createVideoCard(video);
        if (feedPosts) feedPosts.appendChild(videoCard);
      }

      videosLoaded += videos.length;

      if (loadMoreBtn) {
        loadMoreBtn.style.display =
          videos.length < videosPerPage ? "none" : "block";
      }
    } else if (videosLoaded === 0 && feedPosts) {
      feedPosts.innerHTML = `
        <div class="no-videos">
          <p>No videos found for the selected filters. 🔍</p>
          <button onclick="clearFilters()" class="btn secondary">Clear Filters</button>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading videos:", error);
    if (loading) loading.style.display = "none";
    if (feedPosts) {
      feedPosts.innerHTML = `
        <div class="error">
          <p>Error loading videos. Please refresh the page.</p>
          <button onclick="loadVideoFeed()" class="btn secondary">Retry</button>
        </div>
      `;
    }
  }
}

async function createVideoCard(video) {
  const card = document.createElement("article");
  card.className = "post-card";

  const timeAgo = getTimeAgo(new Date(video.created_at));
  const username =
    video.profiles?.username || video.profiles?.full_name || "Unknown User";
  const avatarLetter = username.charAt(0).toUpperCase();

  // Check if user has access to this video
  let hasAccess = true;
  if (video.is_secret) {
    try {
      const { data, error } = await sb.rpc("user_has_video_access", {
        video_id: video.id,
        user_id: currentUser?.id,
      });
      hasAccess = data || false;
    } catch (error) {
      console.error("Access check error:", error);
      hasAccess = false;
    }
  }

  // Determine content to show
  const showFullVideo = !video.is_secret || hasAccess;
  const videoContent = showFullVideo ? video.video_url : null;
  const description = showFullVideo ? video.description : video.secret_preview;

  // Access type display
  const getAccessTypeBadge = (accessType) => {
    switch (accessType) {
      case "free":
        return '<span class="method-tag free">💚 Free</span>';
      case "paid":
        return `<span class="method-tag paid">💰 $${video.price}</span>`;
      case "exchange":
        return '<span class="method-tag exchange">🔄 Exchange</span>';
      case "followers-only":
        return '<span class="method-tag followers">👥 Followers Only</span>';
      default:
        return "";
    }
  };

  card.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <div class="user-avatar">${avatarLetter}</div>
        <div class="user-details">
          <h4>${username} ${video.profiles?.is_verified ? "✅" : ""}</h4>
          <span class="post-time">${timeAgo} • ${video.category}</span>
        </div>
      </div>
      <button class="post-options">⋯</button>
    </div>
    
    <div class="post-content">
      ${
        video.is_secret && !hasAccess
          ? `
        <div class="post-image">
          <div class="content-preview ${video.category}">
            <h3>🔒 ${video.title}</h3>
            <p class="content-teaser">${
              description || "This is secret knowledge..."
            }</p>
            <div class="blur-overlay">
              <div class="unlock-icon">🔓</div>
              <p>Click button below to request access</p>
            </div>
          </div>
        </div>
        `
          : `
        <div class="video-container">
          <video controls preload="metadata" key="${video.id}">
            <source src="${videoContent}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
        `
      }
      
      <div class="post-description">
        <h3 class="video-title">${video.title}</h3>
        ${description ? `<p class="video-description">${description}</p>` : ""}
        ${
          video.tags && video.tags.length > 0
            ? `
          <div class="post-tags">
            ${video.tags
              .map((tag) => `<span class="tag">#${tag}</span>`)
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    </div>
    
    <div class="post-actions">
      ${
        video.is_secret && !hasAccess
          ? `
        <button class="action-btn double-tap-btn" data-video-id="${video.id}">
          <span class="heart-icon">🤍</span>
          <span>Request Access</span>
        </button>
        `
          : `
        <button class="action-btn like-btn" data-video-id="${video.id}">
          <span>❤️</span>
          <span class="like-count">${video.likes_count || 0} Likes</span>
        </button>
        `
      }
      <button class="action-btn comment-btn" data-video-id="${video.id}">
        <span>💬</span>
        <span>${video.comments_count || 0} Comments</span>
      </button>
      <button class="action-btn share-btn" data-video-id="${video.id}">
        <span>📤</span>
        <span>Share</span>
      </button>
    </div>
    
    <div class="post-stats">
      <p><strong>${
        video.requests_count || 0
      } people</strong> want to learn this ${
    video.is_secret ? "secret" : "technique"
  }</p>
      <div class="teaching-method">
        ${getAccessTypeBadge(video.access_type)}
      </div>
    </div>
  `;

  console.log(
    `Created video card for video ${video.id}, is_secret: ${video.is_secret}, hasAccess: ${hasAccess}`
  );

  return card;
}

/* ---------- COMMENTS FUNCTIONALITY ---------- */
function showCommentsModal(videoId) {
  console.log("Showing comments modal for video:", videoId);
  currentVideoIdForComments = videoId;
  const modal = $("comments-modal");
  if (modal) {
    modal.classList.remove("hidden");
    loadVideoComments(videoId);

    const commentAvatar = $("comment-user-avatar");
    if (commentAvatar && currentUser) {
      const username = currentUser.user_metadata?.username || "U";
      commentAvatar.textContent = username.charAt(0).toUpperCase();
    }
  }
}

async function loadVideoComments(videoId) {
  const commentsList = $("comments-list");
  if (!commentsList) return;

  try {
    commentsList.innerHTML = `
      <div class="loading-comments">
        <div class="loading-spinner small"></div>
        <p>Loading comments...</p>
      </div>
    `;

    const { data: comments, error } = await sb.rpc("get_video_comments", {
      p_video_id: videoId,
      p_limit: 50,
      p_offset: 0,
    });

    if (error) {
      const { data: fallbackComments, error: fallbackError } = await sb
        .from("video_comments")
        .select(
          `
          *,
          profiles:user_id (
            username,
            full_name,
            avatar_url
          )
        `
        )
        .eq("video_id", videoId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (fallbackError) throw fallbackError;

      const formattedComments = fallbackComments.map((comment) => ({
        ...comment,
        user_info: {
          username: comment.profiles?.username,
          full_name: comment.profiles?.full_name,
          avatar_url: comment.profiles?.avatar_url,
        },
      }));

      renderComments(formattedComments);
    } else {
      renderComments(comments || []);
    }
  } catch (error) {
    console.error("Error loading comments:", error);
    commentsList.innerHTML = `
      <div class="error-comments">
        <p>Failed to load comments. Please try again.</p>
        <button onclick="loadVideoComments('${videoId}')" class="btn secondary small">Retry</button>
      </div>
    `;
  }
}

function renderComments(comments) {
  const commentsList = $("comments-list");
  if (!commentsList) return;

  if (comments.length > 0) {
    commentsList.innerHTML = comments
      .map((comment) => createCommentHTML(comment))
      .join("");
  } else {
    commentsList.innerHTML = `
      <div class="no-comments">
        <p>No comments yet. Be the first to comment!</p>
      </div>
    `;
  }
}

function createCommentHTML(comment) {
  const userInfo = comment.user_info || {};
  const username = userInfo.username || userInfo.full_name || "Unknown User";
  const avatarLetter = username.charAt(0).toUpperCase();
  const timeAgo = getTimeAgo(new Date(comment.created_at));

  return `
    <div class="comment-item" data-comment-id="${comment.id}">
      <div class="comment-header">
        <div class="user-avatar small">${avatarLetter}</div>
        <div class="comment-meta">
          <span class="comment-username">${username}</span>
          <span class="comment-time">${timeAgo}</span>
        </div>
      </div>
      <div class="comment-content">
        <p>${comment.content}</p>
      </div>
      <div class="comment-actions">
        <button class="comment-action-btn" onclick="likeComment('${
          comment.id
        }')">
          <span>❤️</span>
          <span>${comment.likes_count || 0}</span>
        </button>
        <button class="comment-action-btn" onclick="replyToComment('${
          comment.id
        }')">
          <span>💬</span>
          <span>Reply</span>
        </button>
      </div>
    </div>
  `;
}

async function handleCommentSubmit(e) {
  e.preventDefault();

  const commentInput = $("comment-input");
  if (!commentInput) return;

  const content = commentInput.value.trim();

  if (!content) {
    showMessage("profile-message", "Please enter a comment", "error");
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";
  }

  try {
    let result;
    try {
      const { data: rpcResult, error: rpcError } = await sb.rpc(
        "add_video_comment",
        {
          p_user_id: currentUser.id,
          p_video_id: currentVideoIdForComments,
          p_content: content,
          p_parent_comment_id: null,
        }
      );

      if (rpcError) throw rpcError;
      result = rpcResult;
    } catch (rpcError) {
      const { data: insertResult, error: insertError } = await sb
        .from("video_comments")
        .insert({
          user_id: currentUser.id,
          video_id: currentVideoIdForComments,
          content: content,
          parent_comment_id: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      result = { success: true, comment_id: insertResult.id };
    }

    if (result && result.success !== false) {
      commentInput.value = "";
      updateCommentCharCount();
      loadVideoComments(currentVideoIdForComments);
      showMessage(
        "profile-message",
        "Comment posted successfully! 💬",
        "success"
      );
    } else {
      showMessage(
        "profile-message",
        result?.message || "Failed to post comment",
        "error"
      );
    }
  } catch (error) {
    console.error("Error posting comment:", error);
    showMessage(
      "profile-message",
      "Failed to post comment. Please try again.",
      "error"
    );
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Post Comment";
    }
  }
}

function updateCommentCharCount() {
  const commentInput = $("comment-input");
  const charCount = $("comment-char-count");

  if (commentInput && charCount) {
    const length = commentInput.value.length;
    charCount.textContent = `${length}/500`;
    charCount.style.color =
      length > 450 ? "var(--warning-color)" : "var(--muted-text)";
  }
}

/* ---------- SECRET REQUEST FUNCTIONALITY ---------- */
async function showRequestModal(videoId) {
  console.log("=== SHOW REQUEST MODAL ===");
  console.log("Video ID:", videoId);
  console.log("Current User:", currentUser);

  if (!videoId) {
    console.error("No video ID provided to showRequestModal");
    showMessage("profile-message", "Error: No video ID found", "error");
    return;
  }

  if (!currentUser) {
    console.error("No current user found");
    showMessage("profile-message", "Please log in to request access", "error");
    return;
  }

  try {
    console.log("Checking for existing request...");

    // Check if user already has a pending/approved request
    const { data: existingRequest, error } = await sb
      .from("secret_requests")
      .select("status, created_at")
      .eq("video_id", videoId)
      .eq("requester_id", currentUser.id)
      .single();

    if (existingRequest) {
      console.log("Existing request found:", existingRequest);
      const statusText =
        existingRequest.status === "pending"
          ? "Your request is pending approval"
          : `Your request was ${existingRequest.status}`;

      showMessage("profile-message", statusText, "info");
      return;
    }

    console.log("No existing request, showing modal...");

    // No existing request, show modal
    const modal = $("request-modal");
    if (!modal) {
      console.error("Request modal element not found!");
      showMessage("profile-message", "Error: Modal not found", "error");
      return;
    }

    console.log("Modal found, showing it...");
    modal.classList.remove("hidden");
    modal.dataset.videoId = videoId;

    console.log("Modal classes after show:", modal.className);
    console.log("Modal dataset:", modal.dataset);

    // Focus first input
    setTimeout(() => {
      const reasonInput = $("request-reason");
      if (reasonInput) {
        reasonInput.focus();
        console.log("Focused on reason input");
      } else {
        console.log("Reason input not found");
      }
    }, 100);
  } catch (error) {
    console.error("Error in showRequestModal:", error);

    if (error.code === "PGRST116") {
      // No existing request found, show modal
      console.log(
        "PGRST116 error (no existing request), showing modal anyway..."
      );
      const modal = $("request-modal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.dataset.videoId = videoId;
        console.log("Modal shown after PGRST116 error");
      }
    } else {
      console.error("Unexpected error checking existing request:", error);
      showMessage("profile-message", "Error checking request status", "error");
    }
  }
}

async function handleSecretRequest(e) {
  e.preventDefault();
  console.log("=== HANDLE SECRET REQUEST ===");

  const modal = $("request-modal");
  if (!modal) {
    console.error("Modal not found in handleSecretRequest");
    return;
  }

  const videoId = modal.dataset.videoId;
  console.log("Processing request for video ID:", videoId);

  const reasonInput = $("request-reason");
  const offerDetailsInput = $("offer-details");

  if (!reasonInput || !offerDetailsInput) {
    console.error("Required inputs not found");
    return;
  }

  const reason = reasonInput.value.trim();
  const offerType = document.querySelector(
    'input[name="offer-type"]:checked'
  )?.value;
  const offerDetails = offerDetailsInput.value.trim();

  console.log("Form data:", { reason, offerType, offerDetails });

  if (!reason || !offerType || !offerDetails) {
    showMessage("profile-message", "Please fill in all fields", "error");
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
  }

  try {
    const { data: video, error: videoError } = await sb
      .from("videos")
      .select("user_id")
      .eq("id", videoId)
      .single();

    if (videoError) throw videoError;

    console.log("Video creator ID:", video.user_id);

    let result;
    try {
      const { data: rpcResult, error: rpcError } = await sb.rpc(
        "add_secret_request",
        {
          p_requester_id: currentUser.id,
          p_video_id: videoId,
          p_creator_id: video.user_id,
          p_reason: reason,
          p_offer_type: offerType,
          p_offer_details: offerDetails,
        }
      );

      if (rpcError) throw rpcError;
      result = rpcResult;
      console.log("RPC result:", result);
    } catch (rpcError) {
      console.log("RPC failed, trying direct insert:", rpcError);
      const { error: insertError } = await sb.from("secret_requests").insert({
        video_id: videoId,
        requester_id: currentUser.id,
        creator_id: video.user_id,
        reason: reason,
        offer_type: offerType,
        offer_details: offerDetails,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          result = {
            success: false,
            message: "You have already requested access to this video",
          };
        } else {
          throw insertError;
        }
      } else {
        result = { success: true, message: "Request sent successfully!" };
      }
    }

    if (result && result.success !== false) {
      modal.classList.add("hidden");
      showMessage(
        "profile-message",
        result.message || "Request sent successfully! 🎉",
        "success"
      );

      reasonInput.value = "";
      offerDetailsInput.value = "";
      const checkedRadio = document.querySelector(
        'input[name="offer-type"]:checked'
      );
      if (checkedRadio) checkedRadio.checked = false;

      videosLoaded = 0;
      loadVideoFeed();
    } else {
      showMessage(
        "profile-message",
        result?.message || "You have already requested access to this video",
        "warning"
      );
      setTimeout(() => modal.classList.add("hidden"), 2000);
    }
  } catch (error) {
    console.error("Request error:", error);

    if (error.code === "23505") {
      showMessage(
        "profile-message",
        "You have already requested access to this video",
        "warning"
      );
    } else if (error.message && error.message.includes("duplicate")) {
      showMessage(
        "profile-message",
        "You have already requested access to this video",
        "warning"
      );
    } else {
      showMessage(
        "profile-message",
        "Failed to send request. Please try again.",
        "error"
      );
    }

    setTimeout(() => modal.classList.add("hidden"), 2000);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Request";
    }
  }
}

/* ---------- VIDEO UPLOAD FUNCTIONALITY - ENHANCED VIDEO PREVIEW ---------- */
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("dragover");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const fileInput = $("video-file");
    if (fileInput) {
      fileInput.files = files;
      handleVideoSelect({ target: fileInput });
    }
  }
}

function handleVideoSelect(e) {
  const file = e.target.files[0];
  const preview = $("video-preview");
  const uploadArea = $("video-upload-area");

  console.log("=== VIDEO FILE SELECTED ===");
  console.log("File:", file);

  if (!file) {
    console.log("No file selected");
    return;
  }

  if (!file.type.startsWith("video/")) {
    showMessage("upload-message", "Please select a valid video file", "error");
    e.target.value = "";
    return;
  }

  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    showMessage(
      "upload-message",
      `File size (${formatFileSize(file.size)}) exceeds 100MB limit`,
      "error"
    );
    e.target.value = "";
    return;
  }

  showMessage(
    "upload-message",
    `Selected: ${file.name} (${formatFileSize(file.size)})`,
    "success"
  );

  if (preview && uploadArea) {
    const video = preview.querySelector("video");
    if (video) {
      try {
        console.log("Setting up video preview...");

        // **CRITICAL FIX: Always revoke previous object URL first**
        if (video.src && video.src.startsWith("blob:")) {
          URL.revokeObjectURL(video.src);
          console.log("✅ Previous object URL revoked");
        }

        // Clear the video source completely
        video.src = "";
        video.removeAttribute("src");
        video.load();

        // Pause if playing
        if (!video.paused) {
          video.pause();
        }

        // Create new object URL
        const newVideoUrl = URL.createObjectURL(file);
        console.log("✅ New object URL created:", newVideoUrl);

        // Set new source and show preview
        video.src = newVideoUrl;
        video.load(); // **IMPORTANT: Force reload of video element**

        // Show preview, hide upload area
        preview.classList.remove("hidden");
        uploadArea.style.display = "none";

        console.log("✅ Video preview updated successfully");

        // Auto-fill title if empty
        const titleInput = $("video-title");
        if (titleInput && !titleInput.value.trim()) {
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          titleInput.value = fileName.replace(/[_-]/g, " ");
          updateCharCount("video-title", 200);
          console.log("✅ Title auto-filled:", titleInput.value);
        }

        // **IMPORTANT: Add event listeners for video load events**
        video.addEventListener(
          "loadeddata",
          () => {
            console.log("✅ Video data loaded successfully");
          },
          { once: true }
        );

        video.addEventListener(
          "error",
          (errorEvent) => {
            console.error("❌ Video load error:", errorEvent);
            showMessage(
              "upload-message",
              "Error loading video preview",
              "error"
            );
          },
          { once: true }
        );

        video.addEventListener(
          "canplay",
          () => {
            console.log("✅ Video can start playing");
          },
          { once: true }
        );
      } catch (error) {
        console.error("❌ Error creating video preview:", error);
        showMessage("upload-message", "Error creating video preview", "error");
      }
    } else {
      console.error("❌ Video element not found in preview container");
    }
  } else {
    console.error("❌ Preview container or upload area not found");
  }
}

function removeVideoPreview() {
  const preview = $("video-preview");
  const uploadArea = $("video-upload-area");
  const fileInput = $("video-file");

  console.log("=== REMOVING VIDEO PREVIEW ===");

  if (preview && uploadArea && fileInput) {
    const video = preview.querySelector("video");
    if (video) {
      console.log("Cleaning up video element...");

      // **CRITICAL: Properly clean up object URL to prevent memory leaks**
      if (video.src && video.src.startsWith("blob:")) {
        URL.revokeObjectURL(video.src);
        console.log("✅ Object URL revoked on removal");
      }

      // Clear video completely
      video.src = "";
      video.removeAttribute("src");
      video.load();

      // Pause if playing
      if (!video.paused) {
        video.pause();
        console.log("✅ Video paused");
      }

      // Remove any event listeners (they were set with { once: true }, so they should auto-remove)
    }

    // Reset UI state
    preview.classList.add("hidden");
    uploadArea.style.display = "block";
    fileInput.value = "";
    showMessage("upload-message", "", "");

    console.log("✅ Video preview removed successfully");
  } else {
    console.error("❌ Required elements not found for video removal");
  }
}

// **Add cleanup on page unload to prevent memory leaks**
window.addEventListener("beforeunload", () => {
  console.log("=== PAGE UNLOAD: Cleaning up video object URLs ===");

  // Clean up video preview
  const preview = $("video-preview");
  if (preview) {
    const video = preview.querySelector("video");
    if (video && video.src && video.src.startsWith("blob:")) {
      URL.revokeObjectURL(video.src);
      console.log("✅ Upload preview URL revoked on page unload");
    }
  }

  // Clean up any feed video elements with blob URLs
  document.querySelectorAll("video").forEach((video, index) => {
    if (video.src && video.src.startsWith("blob:")) {
      URL.revokeObjectURL(video.src);
      console.log(`✅ Feed video ${index} URL revoked on page unload`);
    }
  });
});

async function uploadVideo(e) {
  e.preventDefault();

  if (isUploading) {
    showMessage("upload-message", "Upload already in progress", "warning");
    return;
  }

  const fileInput = $("video-file");
  const titleInput = $("video-title");
  const descInput = $("video-description");
  const categoryInput = $("category");

  if (!fileInput?.files[0]) {
    showMessage("upload-message", "Please select a video file", "error");
    return;
  }

  const title = titleInput?.value.trim();
  const category = categoryInput?.value;

  if (!title || !category) {
    showMessage(
      "upload-message",
      "Please fill in all required fields",
      "error"
    );
    return;
  }

  const description = descInput?.value.trim();
  const secretPreviewInput = $("secret-preview");
  const secretPreview = secretPreviewInput?.value.trim() || "";
  const isSecretInput = $("is-secret");
  const isSecret = isSecretInput?.checked || false;
  const accessType =
    document.querySelector('input[name="access-type"]:checked')?.value ||
    "free";
  const priceInput = $("price");
  const price = priceInput?.value;
  const tagsInput = $("tags");
  const tags = tagsInput?.value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag);
  const instagramInput = $("instagram-link");
  const instagramLink = instagramInput?.value.trim();
  const durationInput = $("duration");
  const duration = parseInt(durationInput?.value) || 0;

  // Validation
  if (isSecret && !secretPreview) {
    showMessage(
      "upload-message",
      "Secret preview is required for secret knowledge",
      "error"
    );
    return;
  }

  if (accessType === "paid" && (!price || parseFloat(price) <= 0)) {
    showMessage(
      "upload-message",
      "Please set a valid price for paid content",
      "error"
    );
    return;
  }

  const file = fileInput.files[0];
  const uploadBtn = $("upload-btn");
  const saveDraftBtn = $("save-draft");
  const progressSection = $("upload-progress-section");
  const progressBar = $("upload-progress");
  const progressStatus = $("upload-status");

  try {
    isUploading = true;
    uploadStartTime = Date.now();

    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";
    }
    if (saveDraftBtn) saveDraftBtn.disabled = true;
    if (progressSection) progressSection.style.display = "block";

    // Create unique filename
    const fileExt = file.name.split(".").pop().toLowerCase();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileName = `video_${timestamp}_${randomId}.${fileExt}`;
    const filePath = `${currentUser.id}/${fileName}`;

    if (progressStatus) progressStatus.textContent = "Uploading video...";
    if (progressBar) progressBar.style.width = "0%";

    // Upload video to storage
    const { data: uploadData, error: uploadError } = await sb.storage
      .from("videos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          if (progressBar) progressBar.style.width = `${percent}%`;
          if (progressStatus)
            progressStatus.textContent = `Uploading: ${percent}%`;
        },
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    if (progressStatus) progressStatus.textContent = "Processing video...";
    if (progressBar) progressBar.style.width = "95%";

    // Get public URL
    const { data: urlData } = sb.storage.from("videos").getPublicUrl(filePath);
    if (!urlData?.publicUrl) throw new Error("Failed to get video URL");

    if (progressStatus) progressStatus.textContent = "Saving video details...";
    if (progressBar) progressBar.style.width = "98%";

    // Save video to database
    const { data: videoData, error: dbError } = await sb
      .from("videos")
      .insert({
        user_id: currentUser.id,
        title: title,
        description: description || null,
        secret_preview: isSecret ? secretPreview : null,
        video_url: urlData.publicUrl,
        category: category,
        is_secret: isSecret,
        access_type: accessType,
        price: accessType === "paid" ? parseFloat(price) : null,
        tags: tags.length > 0 ? tags : null,
        instagram_link: instagramLink || null,
        duration_seconds: duration,
        is_published: true,
      })
      .select()
      .single();

    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    if (progressBar) progressBar.style.width = "100%";
    if (progressStatus) progressStatus.textContent = "Upload complete!";

    const uploadTime = Math.round((Date.now() - uploadStartTime) / 1000);
    showMessage(
      "upload-message",
      `${
        isSecret ? "Secret" : "Video"
      } shared successfully in ${uploadTime}s! 🎉`,
      "success"
    );

    resetUploadForm();
    setTimeout(() => (window.location.href = "home.html"), 2000);
  } catch (error) {
    console.error("Upload error:", error);
    showMessage(
      "upload-message",
      error.message || "Upload failed. Please try again.",
      "error"
    );
  } finally {
    isUploading = false;
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "🚀 Share Secret";
    }
    if (saveDraftBtn) saveDraftBtn.disabled = false;

    setTimeout(() => {
      if (progressSection && progressSection.style.display !== "none") {
        progressSection.style.display = "none";
        if (progressBar) progressBar.style.width = "0%";
      }
    }, 3000);
  }
}

/* ---------- PROFILE UPDATE FUNCTIONALITY ---------- */
async function handleProfileUpdate(e) {
  e.preventDefault();
  console.log("=== PROFILE UPDATE START ===");

  const usernameInput = $("update-username");
  const fullNameInput = $("update-fullname");
  const bioInput = $("update-bio");
  const instagramInput = $("update-instagram");
  const websiteInput = $("update-website");

  if (!usernameInput) {
    console.error("Username input not found");
    return;
  }

  const username = usernameInput.value.trim();
  const fullName = fullNameInput?.value.trim() || null;
  const bio = bioInput?.value.trim() || null;
  const instagram = instagramInput?.value.trim() || null;
  const website = websiteInput?.value.trim() || null;

  console.log("Form data:", { username, fullName, bio, instagram, website });

  // Validation
  if (!username) {
    showMessage("profile-message", "Username is required", "error");
    return;
  }

  if (username.length < 3 || username.length > 30) {
    showMessage(
      "profile-message",
      "Username must be 3-30 characters long",
      "error"
    );
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showMessage(
      "profile-message",
      "Username can only contain letters, numbers, and underscores",
      "error"
    );
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";
  }

  try {
    console.log("Attempting profile update...");
    console.log("Current user ID:", currentUser.id);

    // Try the RPC function first
    const { data: rpcResult, error: rpcError } = await sb.rpc(
      "update_user_profile",
      {
        p_user_id: currentUser.id,
        p_username: username,
        p_full_name: fullName,
        p_bio: bio,
        p_instagram_handle: instagram,
        p_website_url: website,
      }
    );

    console.log("RPC Result:", rpcResult);
    console.log("RPC Error:", rpcError);

    if (rpcError) {
      console.error("RPC Error details:", rpcError);
      throw rpcError;
    }

    if (rpcResult && rpcResult.success) {
      console.log("✅ Profile updated successfully via RPC");

      showMessage(
        "profile-message",
        "Profile updated successfully! ✅",
        "success"
      );

      // Update the current user metadata
      currentUser.user_metadata = {
        ...currentUser.user_metadata,
        username: username,
        full_name: fullName,
      };

      // Update auth user metadata
      try {
        await sb.auth.updateUser({
          data: {
            username: username,
            full_name: fullName || "",
          },
        });
        console.log("✅ Auth metadata updated");
      } catch (authError) {
        console.log(
          "⚠️ Auth metadata update failed (non-critical):",
          authError
        );
      }

      // Reload profile data to update display
      setTimeout(() => loadUserProfileData(), 1000);
    } else {
      console.error("❌ RPC returned failure:", rpcResult);
      showMessage(
        "profile-message",
        rpcResult?.message || "Failed to update profile",
        "error"
      );
    }
  } catch (error) {
    console.error("❌ Profile update error:", error);

    // Try direct update as fallback
    console.log("🔄 Trying direct database update...");

    try {
      // Check if username is available first
      const { data: existingProfile, error: checkError } = await sb
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", currentUser.id)
        .single();

      if (existingProfile) {
        showMessage("profile-message", "Username already taken", "error");
        return;
      }

      // Direct update
      const { data: updateData, error: updateError } = await sb
        .from("profiles")
        .update({
          username: username,
          full_name: fullName,
          bio: bio,
          instagram_handle: instagram,
          website_url: website,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id)
        .select();

      console.log("Direct update result:", updateData);
      console.log("Direct update error:", updateError);

      if (updateError) {
        throw updateError;
      }

      console.log("✅ Profile updated successfully via direct update");
      showMessage(
        "profile-message",
        "Profile updated successfully! ✅",
        "success"
      );

      setTimeout(() => loadUserProfileData(), 1000);
    } catch (fallbackError) {
      console.error("❌ Fallback update failed:", fallbackError);

      if (fallbackError.code === "23505") {
        showMessage("profile-message", "Username already taken", "error");
      } else {
        showMessage(
          "profile-message",
          `Update failed: ${fallbackError.message}`,
          "error"
        );
      }
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Profile";
    }
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();

  const currentPasswordInput = $("current-password");
  const newPasswordInput = $("new-password");
  const confirmPasswordInput = $("confirm-password");

  if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput)
    return;

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword !== confirmPassword) {
    showMessage("profile-message", "New passwords do not match", "error");
    return;
  }

  if (newPassword.length < 6) {
    showMessage(
      "profile-message",
      "Password must be at least 6 characters",
      "error"
    );
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Changing...";
  }

  try {
    // Verify current password by attempting to sign in
    const { error: verifyError } = await sb.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });

    if (verifyError) {
      showMessage("profile-message", "Current password is incorrect", "error");
      return;
    }

    // Update password
    const { error } = await sb.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;

    showMessage(
      "profile-message",
      "Password changed successfully! 🔒",
      "success"
    );
    e.target.reset();
  } catch (error) {
    console.error("Error changing password:", error);
    showMessage(
      "profile-message",
      "Failed to change password. Please try again.",
      "error"
    );
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Change Password";
    }
  }
}

async function handlePrivacySettings() {
  const isPublicInput = $("profile-public");
  const allowRequestsInput = $("allow-requests");

  if (!isPublicInput || !allowRequestsInput) return;

  const isPublic = isPublicInput.checked;
  const allowRequests = allowRequestsInput.checked;

  try {
    // Try RPC function first
    let result;
    try {
      const { data: rpcResult, error: rpcError } = await sb.rpc(
        "update_privacy_settings",
        {
          p_user_id: currentUser.id,
          p_is_public: isPublic,
          p_allow_requests: allowRequests,
        }
      );

      if (rpcError) throw rpcError;
      result = rpcResult;
    } catch (rpcError) {
      // Fallback to direct update
      console.log("RPC failed, trying direct update:", rpcError);

      const { error: updateError } = await sb
        .from("profiles")
        .update({
          is_public: isPublic,
          allow_requests: allowRequests,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUser.id);

      if (updateError) throw updateError;
      result = {
        success: true,
        message: "Privacy settings updated successfully",
      };
    }

    if (result && result.success) {
      showMessage("profile-message", "Privacy settings updated! 🛡️", "success");
    } else {
      showMessage(
        "profile-message",
        result?.message || "Failed to update privacy settings",
        "error"
      );
    }
  } catch (error) {
    console.error("Error updating privacy settings:", error);
    showMessage(
      "profile-message",
      "Failed to update privacy settings",
      "error"
    );
  }
}

function updateBioCharCount() {
  const bioInput = $("update-bio");
  const charCount = $("bio-char-count");

  if (bioInput && charCount) {
    const length = bioInput.value.length;
    charCount.textContent = `${length}/500`;
    charCount.style.color =
      length > 450 ? "var(--warning-color)" : "var(--muted-text)";
  }
}

/* ---------- INTERACTION FUNCTIONS ---------- */
async function toggleLike(videoId, likeBtn) {
  if (!currentUser) return;

  try {
    const { data: existingLike, error: checkError } = await sb
      .from("video_likes")
      .select()
      .eq("video_id", videoId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") throw checkError;

    if (existingLike) {
      const { error: deleteError } = await sb
        .from("video_likes")
        .delete()
        .eq("video_id", videoId)
        .eq("user_id", currentUser.id);

      if (deleteError) throw deleteError;

      likeBtn.classList.remove("liked");
      const countSpan = likeBtn.querySelector(".like-count");
      if (countSpan) {
        const currentCount = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = `${Math.max(0, currentCount - 1)} Likes`;
      }
    } else {
      const { error: insertError } = await sb
        .from("video_likes")
        .insert({ video_id: videoId, user_id: currentUser.id });

      if (insertError) throw insertError;

      likeBtn.classList.add("liked");
      const countSpan = likeBtn.querySelector(".like-count");
      if (countSpan) {
        const currentCount = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = `${currentCount + 1} Likes`;
      }
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    showMessage("profile-message", "Error updating like", "error");
  }
}

async function incrementViews(videoId) {
  try {
    await sb.rpc("increment_video_views", { video_id: videoId });
  } catch (error) {
    console.error("Error incrementing views:", error);
  }
}

function shareVideo(video) {
  const shareData = {
    title: video.title,
    text:
      video.secret_preview ||
      video.description ||
      "Check out this secret knowledge!",
    url: window.location.origin + window.location.pathname,
  };

  if (navigator.share) {
    navigator.share(shareData).catch(console.error);
  } else {
    navigator.clipboard
      .writeText(shareData.url)
      .then(() =>
        showMessage(
          "profile-message",
          "Link copied to clipboard! 📋",
          "success"
        )
      )
      .catch(() =>
        showMessage("profile-message", "Unable to share video", "error")
      );
  }
}

/* ---------- NOTIFICATIONS ---------- */
async function loadNotifications() {
  try {
    const { data: notifications, error } = await sb
      .from("notifications")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const badge = $("notification-count");

    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = "block";
      } else {
        badge.style.display = "none";
      }
    }

    // Also load creator requests count
    loadCreatorRequests();
  } catch (error) {
    console.error("Notifications error:", error);
  }
}

function toggleNotifications() {
  const panel = $("notifications-panel");
  if (panel) {
    panel.classList.toggle("hidden");
  }
}

/* ---------- UTILITY FUNCTIONS ---------- */
function resetUploadForm() {
  const form = $("upload-form");
  if (form) form.reset();

  removeVideoPreview();

  updateCharCount("video-title", 200);
  updateCharCount("video-description", 500);
  const secretPreviewInput = $("secret-preview");
  if (secretPreviewInput) updateCharCount("secret-preview", 300);

  const secretOptions = $("secret-options");
  if (secretOptions) secretOptions.classList.add("hidden");

  const priceGroup = $("price-group");
  if (priceGroup) priceGroup.style.display = "none";
}

function saveDraft() {
  const titleInput = $("video-title");
  const descInput = $("video-description");
  const secretInput = $("secret-preview");
  const categoryInput = $("category");
  const isSecretInput = $("is-secret");
  const priceInput = $("price");
  const tagsInput = $("tags");
  const instagramInput = $("instagram-link");

  const draftData = {
    title: titleInput?.value || "",
    description: descInput?.value || "",
    secretPreview: secretInput?.value || "",
    category: categoryInput?.value || "",
    isSecret: isSecretInput?.checked || false,
    accessType:
      document.querySelector('input[name="access-type"]:checked')?.value ||
      "free",
    price: priceInput?.value || "",
    tags: tagsInput?.value || "",
    instagramLink: instagramInput?.value || "",
    timestamp: Date.now(),
  };

  localStorage.setItem("videoDraft", JSON.stringify(draftData));
  showMessage("upload-message", "Draft saved successfully! 💾", "success");
}

function loadDraft() {
  try {
    const draftData = localStorage.getItem("videoDraft");
    if (!draftData) return;

    const draft = JSON.parse(draftData);

    const titleInput = $("video-title");
    const descInput = $("video-description");
    const secretInput = $("secret-preview");
    const categoryInput = $("category");
    const isSecretInput = $("is-secret");
    const priceInput = $("price");
    const tagsInput = $("tags");
    const instagramInput = $("instagram-link");

    if (titleInput) titleInput.value = draft.title || "";
    if (descInput) descInput.value = draft.description || "";
    if (secretInput) secretInput.value = draft.secretPreview || "";
    if (categoryInput) categoryInput.value = draft.category || "";
    if (isSecretInput) isSecretInput.checked = draft.isSecret || false;
    if (priceInput) priceInput.value = draft.price || "";
    if (tagsInput) tagsInput.value = draft.tags || "";
    if (instagramInput) instagramInput.value = draft.instagramLink || "";

    if (draft.accessType) {
      const accessInput = document.querySelector(
        `input[name="access-type"][value="${draft.accessType}"]`
      );
      if (accessInput) accessInput.checked = true;
    }

    const secretOptions = $("secret-options");
    const priceGroup = $("price-group");

    if (draft.isSecret && secretOptions) {
      secretOptions.classList.remove("hidden");
    }

    if (draft.accessType === "paid" && priceGroup) {
      priceGroup.style.display = "block";
    }

    updateCharCount("video-title", 200);
    updateCharCount("video-description", 500);
    updateCharCount("secret-preview", 300);

    showMessage("upload-message", "Draft loaded", "info");
  } catch (error) {
    console.error("Error loading draft:", error);
  }
}

function clearFilters() {
  currentFilter = "all";
  currentCategory = "";

  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.classList.remove("active");
    if (tab.dataset.filter === "all") tab.classList.add("active");
  });

  const categoryFilter = $("category-filter");
  if (categoryFilter) categoryFilter.value = "";

  videosLoaded = 0;
  loadVideoFeed();
}

async function loadMoreVideos() {
  const loadMoreBtn = $("load-more");
  if (!loadMoreBtn) return;

  try {
    loadMoreBtn.textContent = "Loading...";
    loadMoreBtn.disabled = true;
    await loadVideoFeed();
  } catch (error) {
    console.error("Error loading more videos:", error);
    showMessage("profile-message", "Error loading more videos", "error");
  } finally {
    loadMoreBtn.textContent = "Load More Videos";
    loadMoreBtn.disabled = false;
  }
}

async function logout() {
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;

    localStorage.removeItem("videoDraft");
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    window.location.href = "index.html";
  }
}

/* ---------- PLACEHOLDER FUNCTIONS FOR MISSING FEATURES ---------- */
function likeComment(commentId) {
  console.log("Like comment:", commentId);
  // TODO: Implement comment liking functionality
}

function replyToComment(commentId) {
  console.log("Reply to comment:", commentId);
  // TODO: Implement comment reply functionality
}

/* ---------- AUTO-SAVE DRAFT ---------- */
if (window.location.pathname.includes("createone.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(loadDraft, 100);
  });

  setInterval(() => {
    if (window.location.pathname.includes("createone.html")) {
      const titleInput = $("video-title");
      const descInput = $("video-description");
      const title = titleInput?.value.trim();
      const description = descInput?.value.trim();
      if (title || description) saveDraft();
    }
  }, 30000);
}

/* ---------- GLOBAL DEBUG AND TESTING FUNCTIONS ---------- */
window.debugFunctions = {
  loadVideoFeed,
  uploadVideo,
  showRequestModal,
  showCommentsModal,
  showRequestsModal,
  loadCreatorRequests,
  handleRequestDecision,
  currentUser: () => currentUser,
  isUploading: () => isUploading,
  clearFilters,
  handleSecretRequest,
  handleCommentSubmit,
  loadUserProfileData,
  testVideoPreview: () => {
    console.log("=== VIDEO PREVIEW DEBUG ===");

    const fileInput = $("video-file");
    const preview = $("video-preview");
    const uploadArea = $("video-upload-area");

    console.log("File input:", fileInput);
    console.log("Preview element:", preview);
    console.log("Upload area:", uploadArea);

    if (preview) {
      const video = preview.querySelector("video");
      console.log("Video element:", video);
      if (video) {
        console.log("Video src:", video.src);
        console.log("Video duration:", video.duration);
        console.log("Video ready state:", video.readyState);
        console.log("Video paused:", video.paused);
      }
    }
  },
  debugClicks: () => {
    console.log("=== DEBUGGING CLICKS ===");

    const filterTabs = document.querySelectorAll(".filter-tab");
    console.log("Filter tabs found:", filterTabs.length);
    filterTabs.forEach((tab, index) => {
      console.log(`Tab ${index}:`, tab, "Dataset:", tab.dataset);
    });

    const storyItems = document.querySelectorAll(".story-item");
    console.log("Story items found:", storyItems.length);
    storyItems.forEach((item, index) => {
      console.log(`Story ${index}:`, item, "Dataset:", item.dataset);
    });

    const requestBtns = document.querySelectorAll(".double-tap-btn");
    console.log("Request buttons found:", requestBtns.length);
    requestBtns.forEach((btn, index) => {
      console.log(
        `Request button ${index}:`,
        btn,
        "Video ID:",
        btn.dataset.videoId
      );
    });

    if (filterTabs.length > 0) {
      console.log("Trying to click first filter tab...");
      filterTabs[0].click();
    }
  },
  testRequestModal: (videoId) => {
    console.log("Testing request modal with video ID:", videoId);
    showRequestModal(videoId);
  },
};

// Make key functions globally available
window.showRequestModal = showRequestModal;
window.showRequestsModal = showRequestsModal;
window.handleRequestDecision = handleRequestDecision;
window.changeFilter = window.changeFilter;
window.changeCategory = window.changeCategory;

console.log("✅ Dashboard.js loaded successfully!");
console.log("🔧 Debug functions available: window.debugFunctions");
console.log("🎬 Request modal function: window.showRequestModal()");
console.log("📹 Video preview debug: debugFunctions.testVideoPreview()");
console.log("📝 Request management: debugFunctions.showRequestsModal()");
