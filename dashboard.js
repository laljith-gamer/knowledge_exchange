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

    if (window.location.pathname.includes("profile.html")) {
      loadUserProfileData();
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
    const modalAvatar = $("modal-avatar");

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

/* ---------- VIDEO FEED FUNCTIONALITY ---------- */
async function loadVideoFeed() {
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

    const { data: videos, error } = await query;

    if (error) throw error;

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
  const commentBtn = card.querySelector(".comment-btn");
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

  if (commentBtn) {
    commentBtn.onclick = () => showCommentsModal(video.id);
  }

  if (videoElement) {
    videoElement.onplay = () => incrementViews(video.id);
  }

  return card;
}

/* ---------- COMMENTS FUNCTIONALITY ---------- */
function showCommentsModal(videoId) {
  currentVideoIdForComments = videoId;
  const modal = $("comments-modal");
  if (modal) {
    modal.classList.remove("hidden");
    loadVideoComments(videoId);

    // Update user avatar in comment form
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
      // Fallback to direct query if RPC doesn't exist
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
    // Try RPC function first
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
      // Fallback to direct insert
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
  try {
    // Check if user already has a pending/approved request
    const { data: existingRequest, error } = await sb
      .from("secret_requests")
      .select("status, created_at")
      .eq("video_id", videoId)
      .eq("requester_id", currentUser.id)
      .single();

    if (existingRequest) {
      const statusText =
        existingRequest.status === "pending"
          ? "Your request is pending approval"
          : `Your request was ${existingRequest.status}`;

      showMessage("profile-message", statusText, "info");
      return;
    }

    // No existing request, show modal
    const modal = $("request-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.dataset.videoId = videoId;

      // Focus first input
      setTimeout(() => {
        const reasonInput = $("request-reason");
        if (reasonInput) reasonInput.focus();
      }, 100);
    }
  } catch (error) {
    if (error.code === "PGRST116") {
      // No existing request found, show modal
      const modal = $("request-modal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.dataset.videoId = videoId;
      }
    } else {
      console.error("Error checking existing request:", error);
      showMessage("profile-message", "Error checking request status", "error");
    }
  }
}

async function handleSecretRequest(e) {
  e.preventDefault();

  const modal = $("request-modal");
  if (!modal) return;

  const videoId = modal.dataset.videoId;
  const reasonInput = $("request-reason");
  const offerDetailsInput = $("offer-details");

  if (!reasonInput || !offerDetailsInput) return;

  const reason = reasonInput.value.trim();
  const offerType = document.querySelector(
    'input[name="offer-type"]:checked'
  )?.value;
  const offerDetails = offerDetailsInput.value.trim();

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
    // Get creator ID for the video
    const { data: video, error: videoError } = await sb
      .from("videos")
      .select("user_id")
      .eq("id", videoId)
      .single();

    if (videoError) throw videoError;

    // Use the safe RPC function (if available) or direct insert with conflict handling
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
    } catch (rpcError) {
      console.log("RPC failed, trying direct insert:", rpcError);
      // Fallback to direct insert if RPC function doesn't exist
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
          // Duplicate key error
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

    // Handle response
    if (result && result.success !== false) {
      modal.classList.add("hidden");
      showMessage(
        "profile-message",
        result.message || "Request sent successfully! 🎉",
        "success"
      );

      // Reset form
      reasonInput.value = "";
      offerDetailsInput.value = "";
      const checkedRadio = document.querySelector(
        'input[name="offer-type"]:checked'
      );
      if (checkedRadio) checkedRadio.checked = false;

      // Reload the feed to update request counts
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

    // Handle specific error cases
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

    // Close modal after error
    setTimeout(() => modal.classList.add("hidden"), 2000);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Request";
    }
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
    if (fileInput) {
      fileInput.files = files;
      handleVideoSelect({ target: fileInput });
    }
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
  const uploadArea = $("video-upload-area");

  if (preview && uploadArea) {
    const video = preview.querySelector("video");
    if (video) {
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
  }
}

function removeVideoPreview() {
  const preview = $("video-preview");
  const uploadArea = $("video-upload-area");
  const fileInput = $("video-file");

  if (preview && uploadArea && fileInput) {
    const video = preview.querySelector("video");
    if (video) {
      if (video.src && video.src.startsWith("blob:")) {
        URL.revokeObjectURL(video.src);
      }
      video.src = "";
    }

    preview.classList.add("hidden");
    uploadArea.style.display = "block";
    fileInput.value = "";
    showMessage("upload-message", "", "");
  }
}

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

  const usernameInput = $("update-username");
  const fullNameInput = $("update-fullname");
  const bioInput = $("update-bio");
  const instagramInput = $("update-instagram");
  const websiteInput = $("update-website");

  if (!usernameInput) return;

  const username = usernameInput.value.trim();
  const fullName = fullNameInput?.value.trim();
  const bio = bioInput?.value.trim();
  const instagram = instagramInput?.value.trim();
  const website = websiteInput?.value.trim();

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
    // Try RPC function first
    let result;
    try {
      const { data: rpcResult, error: rpcError } = await sb.rpc(
        "update_user_profile",
        {
          p_user_id: currentUser.id,
          p_username: username,
          p_full_name: fullName || null,
          p_bio: bio || null,
          p_instagram_handle: instagram || null,
          p_website_url: website || null,
        }
      );

      if (rpcError) throw rpcError;
      result = rpcResult;
    } catch (rpcError) {
      // Fallback to direct update
      console.log("RPC failed, trying direct update:", rpcError);

      // Check if username is already taken
      const { data: existingProfile } = await sb
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", currentUser.id)
        .single();

      if (existingProfile) {
        result = { success: false, message: "Username already taken" };
      } else {
        // Update profile
        const { error: updateError } = await sb
          .from("profiles")
          .update({
            username: username,
            full_name: fullName || null,
            bio: bio || null,
            instagram_handle: instagram || null,
            website_url: website || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentUser.id);

        if (updateError) throw updateError;

        // Update auth metadata
        await sb.auth.updateUser({
          data: {
            username: username,
            full_name: fullName || "",
          },
        });

        result = { success: true, message: "Profile updated successfully" };
      }
    }

    if (result && result.success) {
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

      // Reload profile data to update display
      await loadUserProfileData();
    } else {
      showMessage(
        "profile-message",
        result?.message || "Failed to update profile",
        "error"
      );
    }
  } catch (error) {
    console.error("Error updating profile:", error);
    showMessage(
      "profile-message",
      "Failed to update profile. Please try again.",
      "error"
    );
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

/* ---------- GLOBAL FUNCTIONS FOR DEBUGGING ---------- */
window.debugFunctions = {
  loadVideoFeed,
  uploadVideo,
  showRequestModal,
  showCommentsModal,
  currentUser: () => currentUser,
  isUploading: () => isUploading,
  clearFilters,
  handleSecretRequest,
  handleCommentSubmit,
  loadUserProfileData,
};
