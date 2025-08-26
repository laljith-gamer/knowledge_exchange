const sb = window.supabaseClient;

/* ---------- STATE VARIABLES ---------- */
let currentUser = null;
let videosLoaded = 0;
const videosPerPage = 10;
let uploadStartTime = null;
let isUploading = false;
let currentFilter = "all";
let currentCategory = "";

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

/* ---------- INITIALIZATION ---------- */
document.addEventListener("DOMContentLoaded", async () => {
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
    await loadUserProfile(session.user);
    bindDashboardEvents();

    // Load content based on current page
    if (
      window.location.pathname.includes("home.html") ||
      window.location.pathname === "/"
    ) {
      loadVideoFeed();
      loadNotifications();
    }

    if (window.location.pathname.includes("createone.html")) {
      initializeUploadForm();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    window.location.href = "index.html";
  }
});

/* ---------- USER PROFILE MANAGEMENT ---------- */
async function loadUserProfile(user) {
  try {
    // Get user profile from database
    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Profile load error:", error);
      return;
    }

    // Use profile data or fallback to auth metadata
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
    document.querySelectorAll(".user-avatar").forEach((avatar) => {
      if (!avatar.textContent || avatar.textContent === "👤") {
        avatar.textContent = username.charAt(0).toUpperCase();
      }
    });

    // Update form fields if on profile page
    const updateUsername = $("update-username");
    const updateEmail = $("update-email");
    if (updateUsername) updateUsername.value = username;
    if (updateEmail) updateEmail.value = user.email;
  } catch (error) {
    console.error("Load profile error:", error);
  }
}

/* ---------- EVENT BINDING ---------- */
function bindDashboardEvents() {
  // Logout functionality
  const logoutBtn = $("logout");
  if (logoutBtn) logoutBtn.onclick = logout;

  // Filter tabs
  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      document
        .querySelectorAll(".filter-tab")
        .forEach((t) => t.classList.remove("active"));
      e.target.classList.add("active");
      currentFilter = e.target.dataset.filter;
      videosLoaded = 0;
      loadVideoFeed();
    });
  });

  // Category filter
  const categoryFilter = $("category-filter");
  if (categoryFilter) {
    categoryFilter.addEventListener("change", (e) => {
      currentCategory = e.target.value;
      videosLoaded = 0;
      loadVideoFeed();
    });
  }

  // Story items
  document.querySelectorAll(".story-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const category = e.currentTarget.dataset.category;
      currentCategory = category;
      if (categoryFilter) categoryFilter.value = category;
      videosLoaded = 0;
      loadVideoFeed();
    });
  });

  // Load more button
  const loadMoreBtn = $("load-more");
  if (loadMoreBtn) loadMoreBtn.onclick = loadMoreVideos;

  // Notifications
  const notificationsBtn = $("notifications-btn");
  if (notificationsBtn) {
    notificationsBtn.onclick = toggleNotifications;
  }

  // Modal events
  const requestModal = $("request-modal");
  const closeModal = requestModal?.querySelector(".close-modal");
  const cancelRequest = $("cancel-request");
  const requestForm = $("request-form");

  if (closeModal)
    closeModal.onclick = () => requestModal.classList.add("hidden");
  if (cancelRequest)
    cancelRequest.onclick = () => requestModal.classList.add("hidden");
  if (requestForm) requestForm.onsubmit = handleSecretRequest;

  // Upload form events
  const uploadForm = $("upload-form");
  if (uploadForm) uploadForm.onsubmit = uploadVideo;

  const saveDraftBtn = $("save-draft");
  if (saveDraftBtn) saveDraftBtn.onclick = saveDraft;

  // Profile forms
  const updateProfileForm = $("update-profile");
  if (updateProfileForm) updateProfileForm.onsubmit = updateProfile;

  const changePasswordForm = $("change-password");
  if (changePasswordForm) changePasswordForm.onsubmit = changePassword;
}

function initializeUploadForm() {
  const videoFile = $("video-file");
  if (videoFile) videoFile.onchange = handleVideoSelect;

  const removeVideo = $("remove-video");
  if (removeVideo) removeVideo.onclick = removeVideoPreview;

  // Character counters
  const titleInput = $("video-title");
  const descInput = $("video-description");
  const previewInput = $("secret-preview");
  const tagsInput = $("tags");

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
      if (e.target.value === "paid") {
        priceGroup.style.display = "block";
        $("price").required = true;
      } else {
        priceGroup.style.display = "none";
        $("price").required = false;
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

/* ---------- VIDEO FEED FUNCTIONALITY ---------- */
async function loadVideoFeed() {
  const loading = $("loading");
  const feedPosts = $("feed-posts");
  const loadMoreBtn = $("load-more");

  try {
    if (loading) loading.style.display = "block";
    if (feedPosts && videosLoaded === 0)
      feedPosts.innerHTML =
        '<div id="loading" class="loading-container"><div class="loading-spinner"></div><p>Loading knowledge feed...</p></div>';

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

    const { data: videos, error } = await query;

    if (error) throw error;

    if (loading) loading.style.display = "none";

    if (videos && videos.length > 0) {
      if (videosLoaded === 0) {
        feedPosts.innerHTML = "";
      }

      for (const video of videos) {
        const videoCard = await createVideoCard(video);
        feedPosts.appendChild(videoCard);
      }

      videosLoaded += videos.length;

      if (loadMoreBtn) {
        loadMoreBtn.style.display =
          videos.length < videosPerPage ? "none" : "block";
      }
    } else if (videosLoaded === 0) {
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
              <p>Double tap to request access</p>
            </div>
          </div>
        </div>
      `
          : `
        <div class="video-container">
          <video controls preload="metadata">
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

  // Add event listeners
  const requestBtn = card.querySelector(".double-tap-btn");
  const likeBtn = card.querySelector(".like-btn");
  const shareBtn = card.querySelector(".share-btn");
  const videoElement = card.querySelector("video");

  if (requestBtn) {
    requestBtn.onclick = () => showRequestModal(video.id);
  }

  if (likeBtn) {
    likeBtn.onclick = () => toggleLike(video.id, likeBtn);
  }

  if (shareBtn) {
    shareBtn.onclick = () => shareVideo(video);
  }

  if (videoElement) {
    videoElement.onplay = () => incrementViews(video.id);
  }

  return card;
}

/* ---------- SECRET REQUEST FUNCTIONALITY ---------- */
function showRequestModal(videoId) {
  const modal = $("request-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.dataset.videoId = videoId;
  }
}

async function handleSecretRequest(e) {
  e.preventDefault();

  const modal = $("request-modal");
  const videoId = modal.dataset.videoId;
  const reason = $("request-reason").value.trim();
  const offerType = document.querySelector(
    'input[name="offer-type"]:checked'
  )?.value;
  const offerDetails = $("offer-details").value.trim();

  if (!reason || !offerType || !offerDetails) {
    showMessage("upload-message", "Please fill in all fields", "error");
    return;
  }

  try {
    // Get creator ID for the video
    const { data: video, error: videoError } = await sb
      .from("videos")
      .select("user_id")
      .eq("id", videoId)
      .single();

    if (videoError) throw videoError;

    // Submit request
    const { error } = await sb.from("secret_requests").insert({
      video_id: videoId,
      requester_id: currentUser.id,
      creator_id: video.user_id,
      reason: reason,
      offer_type: offerType,
      offer_details: offerDetails,
    });

    if (error) throw error;

    modal.classList.add("hidden");
    showMessage("upload-message", "Request sent successfully! 🎉", "success");

    // Reset form
    $("request-reason").value = "";
    $("offer-details").value = "";
    document.querySelector('input[name="offer-type"]:checked').checked = false;

    // Reload the feed to update request counts
    videosLoaded = 0;
    loadVideoFeed();
  } catch (error) {
    console.error("Request error:", error);
    showMessage(
      "upload-message",
      "Failed to send request. Please try again.",
      "error"
    );
  }
}

/* ---------- VIDEO UPLOAD FUNCTIONALITY ---------- */
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
    fileInput.files = files;
    handleVideoSelect({ target: fileInput });
  }
}

function handleVideoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

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

  const preview = $("video-preview");
  const video = preview.querySelector("video");
  const uploadArea = $("video-upload-area");

  try {
    video.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");
    uploadArea.style.display = "none";

    // Auto-fill title if empty
    const titleInput = $("video-title");
    if (titleInput && !titleInput.value.trim()) {
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      titleInput.value = fileName.replace(/[_-]/g, " ");
      updateCharCount("video-title", 200);
    }
  } catch (error) {
    console.error("Error creating video preview:", error);
    showMessage("upload-message", "Error creating video preview", "error");
  }
}

function removeVideoPreview() {
  const preview = $("video-preview");
  const video = preview.querySelector("video");
  const uploadArea = $("video-upload-area");
  const fileInput = $("video-file");

  if (video.src && video.src.startsWith("blob:")) {
    URL.revokeObjectURL(video.src);
  }

  video.src = "";
  preview.classList.add("hidden");
  uploadArea.style.display = "block";
  fileInput.value = "";
  showMessage("upload-message", "", "");
}

async function uploadVideo(e) {
  e.preventDefault();

  if (isUploading) {
    showMessage("upload-message", "Upload already in progress", "warning");
    return;
  }

  const fileInput = $("video-file");
  const title = $("video-title").value.trim();
  const description = $("video-description").value.trim();
  const secretPreview = $("secret-preview").value.trim();
  const category = $("category").value;
  const isSecret = $("is-secret").checked;
  const accessType =
    document.querySelector('input[name="access-type"]:checked')?.value ||
    "free";
  const price = $("price")?.value;
  const tags = $("tags")
    ?.value.split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag);
  const instagramLink = $("instagram-link")?.value.trim();
  const duration = parseInt($("duration")?.value) || 0;

  // Validation
  if (!fileInput.files[0]) {
    showMessage("upload-message", "Please select a video file", "error");
    return;
  }

  if (!title || !category) {
    showMessage(
      "upload-message",
      "Please fill in all required fields",
      "error"
    );
    return;
  }

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

    uploadBtn.disabled = true;
    saveDraftBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
    progressSection.style.display = "block";

    // Create unique filename
    const fileExt = file.name.split(".").pop().toLowerCase();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileName = `video_${timestamp}_${randomId}.${fileExt}`;
    const filePath = `${currentUser.id}/${fileName}`;

    progressStatus.textContent = "Uploading video...";
    progressBar.style.width = "0%";

    // Upload video to storage
    const { data: uploadData, error: uploadError } = await sb.storage
      .from("videos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          progressBar.style.width = `${percent}%`;
          progressStatus.textContent = `Uploading: ${percent}%`;
        },
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    progressStatus.textContent = "Processing video...";
    progressBar.style.width = "95%";

    // Get public URL
    const { data: urlData } = sb.storage.from("videos").getPublicUrl(filePath);
    if (!urlData?.publicUrl) throw new Error("Failed to get video URL");

    progressStatus.textContent = "Saving video details...";
    progressBar.style.width = "98%";

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

    progressBar.style.width = "100%";
    progressStatus.textContent = "Upload complete!";

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
    uploadBtn.disabled = false;
    saveDraftBtn.disabled = false;
    uploadBtn.textContent = "🚀 Share Secret";

    setTimeout(() => {
      if (progressSection && progressSection.style.display !== "none") {
        progressSection.style.display = "none";
        progressBar.style.width = "0%";
      }
    }, 3000);
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
    showMessage("upload-message", "Error updating like", "error");
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
        showMessage("upload-message", "Link copied to clipboard! 📋", "success")
      )
      .catch(() =>
        showMessage("upload-message", "Unable to share video", "error")
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
  updateCharCount("secret-preview", 300);

  $("secret-options").classList.add("hidden");
  $("price-group").style.display = "none";
}

function saveDraft() {
  const draftData = {
    title: $("video-title")?.value || "",
    description: $("video-description")?.value || "",
    secretPreview: $("secret-preview")?.value || "",
    category: $("category")?.value || "",
    isSecret: $("is-secret")?.checked || false,
    accessType:
      document.querySelector('input[name="access-type"]:checked')?.value ||
      "free",
    price: $("price")?.value || "",
    tags: $("tags")?.value || "",
    instagramLink: $("instagram-link")?.value || "",
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

    if ($("video-title")) $("video-title").value = draft.title || "";
    if ($("video-description"))
      $("video-description").value = draft.description || "";
    if ($("secret-preview"))
      $("secret-preview").value = draft.secretPreview || "";
    if ($("category")) $("category").value = draft.category || "";
    if ($("is-secret")) $("is-secret").checked = draft.isSecret || false;
    if ($("price")) $("price").value = draft.price || "";
    if ($("tags")) $("tags").value = draft.tags || "";
    if ($("instagram-link"))
      $("instagram-link").value = draft.instagramLink || "";

    if (draft.accessType) {
      const accessInput = document.querySelector(
        `input[name="access-type"][value="${draft.accessType}"]`
      );
      if (accessInput) accessInput.checked = true;
    }

    if (draft.isSecret) {
      $("secret-options").classList.remove("hidden");
    }

    if (draft.accessType === "paid") {
      $("price-group").style.display = "block";
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
    showMessage("upload-message", "Error loading more videos", "error");
  } finally {
    loadMoreBtn.textContent = "Load More Videos";
    loadMoreBtn.disabled = false;
  }
}

/* ---------- PROFILE FUNCTIONS ---------- */
async function updateProfile(e) {
  e.preventDefault();
  const username = $("update-username").value.trim();

  if (!username) {
    showMessage("profile-message", "Username is required", "error");
    return;
  }

  try {
    const { error } = await sb.auth.updateUser({
      data: { username: username },
    });

    if (error) throw error;

    showMessage("profile-message", "Profile updated successfully!", "success");
    await loadUserProfile({
      ...currentUser,
      user_metadata: { ...currentUser.user_metadata, username },
    });
  } catch (error) {
    console.error("Profile update error:", error);
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
    const { error } = await sb.auth.updateUser({ password: newPass });
    if (error) throw error;

    showMessage("profile-message", "Password changed successfully!", "success");
    e.target.reset();
  } catch (error) {
    console.error("Password change error:", error);
    showMessage("profile-message", error.message, "error");
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

/* ---------- AUTO-SAVE DRAFT ---------- */
if (window.location.pathname.includes("createone.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(loadDraft, 100);
  });

  setInterval(() => {
    if (window.location.pathname.includes("createone.html")) {
      const title = $("video-title")?.value.trim();
      const description = $("video-description")?.value.trim();
      if (title || description) saveDraft();
    }
  }, 30000);
}

// Global functions for debugging
window.debugFunctions = {
  loadVideoFeed,
  uploadVideo,
  currentUser: () => currentUser,
  isUploading: () => isUploading,
  clearFilters,
};
