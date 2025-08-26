const sb = window.supabaseClient;

/* ---------- STATE VARIABLES ---------- */
let currentUser = null;
let videosLoaded = 0;
const videosPerPage = 10;
let uploadStartTime = null;
let isUploading = false;

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

const formatUploadSpeed = (bytesPerSecond) => {
  if (bytesPerSecond === 0) return "0 KB/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return (
    parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  );
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
    loadUserData(session.user);
    bindDashboardEvents();

    // Load videos if on home page
    if (
      window.location.pathname.includes("home.html") ||
      window.location.pathname === "/"
    ) {
      loadVideoFeed();
    }

    // Initialize upload form if on create page
    if (window.location.pathname.includes("createone.html")) {
      initializeUploadForm();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    window.location.href = "index.html";
  }
});

/* ---------- USER DATA MANAGEMENT ---------- */
function loadUserData(user) {
  const profileName = $("profile-name");
  const profileEmail = $("profile-email");
  const profileDate = $("profile-date");

  const username = user.user_metadata?.username || "User";

  if (profileName) profileName.textContent = username;
  if (profileEmail) profileEmail.textContent = user.email;
  if (profileDate)
    profileDate.textContent = new Date(user.created_at).toLocaleDateString();

  // Update all user avatars on the page
  document.querySelectorAll(".user-avatar").forEach((avatar) => {
    if (!avatar.textContent || avatar.textContent === "👤") {
      avatar.textContent = username.charAt(0).toUpperCase();
    }
  });

  const updateUsername = $("update-username");
  const updateEmail = $("update-email");

  if (updateUsername) updateUsername.value = username;
  if (updateEmail) updateEmail.value = user.email;
}

/* ---------- EVENT BINDING ---------- */
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

  // Video upload form
  const uploadForm = $("upload-form");
  if (uploadForm) {
    uploadForm.onsubmit = uploadVideo;
  }

  // Load more videos
  const loadMoreBtn = $("load-more");
  if (loadMoreBtn) {
    loadMoreBtn.onclick = loadMoreVideos;
  }

  // Save draft functionality
  const saveDraftBtn = $("save-draft");
  if (saveDraftBtn) {
    saveDraftBtn.onclick = saveDraft;
  }

  // Prevent accidental page closure during upload
  window.addEventListener("beforeunload", (e) => {
    if (isUploading) {
      e.preventDefault();
      e.returnValue =
        "Video upload is in progress. Are you sure you want to leave?";
      return e.returnValue;
    }
  });
}

function initializeUploadForm() {
  // File input change handler
  const videoFile = $("video-file");
  if (videoFile) {
    videoFile.onchange = handleVideoSelect;
  }

  // Remove video handler
  const removeVideo = $("remove-video");
  if (removeVideo) {
    removeVideo.onclick = removeVideoPreview;
  }

  // Character counters
  const titleInput = $("video-title");
  const descInput = $("video-description");

  if (titleInput) {
    titleInput.addEventListener("input", () =>
      updateCharCount("video-title", 200)
    );
  }
  if (descInput) {
    descInput.addEventListener("input", () =>
      updateCharCount("video-description", 500)
    );
  }

  // Drag and drop functionality
  const uploadArea = $("video-upload-area");
  if (uploadArea) {
    uploadArea.addEventListener("dragover", handleDragOver);
    uploadArea.addEventListener("dragleave", handleDragLeave);
    uploadArea.addEventListener("drop", handleDrop);
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

  // Validate file type
  if (!file.type.startsWith("video/")) {
    showMessage("upload-message", "Please select a valid video file", "error");
    e.target.value = "";
    return;
  }

  // Check file size (100MB max)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    showMessage(
      "upload-message",
      `File size (${formatFileSize(
        file.size
      )}) exceeds 100MB limit. Please compress or choose a smaller file.`,
      "error"
    );
    e.target.value = "";
    return;
  }

  // Show file info
  showMessage(
    "upload-message",
    `Selected: ${file.name} (${formatFileSize(file.size)})`,
    "success"
  );

  // Show preview
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
      const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      titleInput.value = fileName.replace(/[_-]/g, " "); // Replace underscores and hyphens with spaces
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

  // Clean up object URL to prevent memory leaks
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

  // Validation
  if (!fileInput.files[0]) {
    showMessage("upload-message", "Please select a video file", "error");
    return;
  }

  if (!title) {
    showMessage("upload-message", "Please enter a title", "error");
    return;
  }

  if (title.length > 200) {
    showMessage(
      "upload-message",
      "Title is too long (max 200 characters)",
      "error"
    );
    return;
  }

  if (description.length > 500) {
    showMessage(
      "upload-message",
      "Description is too long (max 500 characters)",
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

    // Disable form controls
    uploadBtn.disabled = true;
    saveDraftBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
    uploadBtn.classList.add("loading");
    progressSection.style.display = "block";

    // Create unique filename
    const fileExt = file.name.split(".").pop().toLowerCase();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileName = `video_${timestamp}_${randomId}.${fileExt}`;
    const filePath = `${currentUser.id}/${fileName}`;

    progressStatus.textContent = "Preparing upload...";
    progressBar.style.width = "0%";

    let lastLoaded = 0;
    let lastTime = uploadStartTime;

    // Upload video to storage with progress tracking
    const { data: uploadData, error: uploadError } = await sb.storage
      .from("videos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          const currentTime = Date.now();
          const timeDiff = (currentTime - lastTime) / 1000; // seconds
          const bytesDiff = progress.loaded - lastLoaded;

          if (timeDiff > 0.5) {
            // Update speed every 500ms
            const speed = bytesDiff / timeDiff;
            const remainingBytes = progress.total - progress.loaded;
            const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

            progressBar.style.width = `${percent}%`;
            progressStatus.textContent = `Uploading: ${percent}% (${formatUploadSpeed(
              speed
            )}) - ETA: ${eta}s`;

            lastLoaded = progress.loaded;
            lastTime = currentTime;
          }
        },
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    progressStatus.textContent = "Getting video URL...";
    progressBar.style.width = "95%";

    // Get public URL
    const { data: urlData } = sb.storage.from("videos").getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      throw new Error("Failed to get video URL");
    }

    progressStatus.textContent = "Saving video details...";
    progressBar.style.width = "98%";

    // Save video details to database
    const { data: videoData, error: dbError } = await sb
      .from("videos")
      .insert({
        user_id: currentUser.id,
        title: title,
        description: description || null,
        video_url: urlData.publicUrl,
        is_published: true,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    progressBar.style.width = "100%";
    progressStatus.textContent = "Upload complete!";

    const uploadTime = Math.round((Date.now() - uploadStartTime) / 1000);
    showMessage(
      "upload-message",
      `Video uploaded successfully in ${uploadTime}s! 🎉`,
      "success"
    );

    // Reset form
    resetUploadForm();

    // Redirect to home after delay
    setTimeout(() => {
      window.location.href = "home.html";
    }, 2000);
  } catch (error) {
    console.error("Upload error:", error);
    showMessage(
      "upload-message",
      error.message || "Upload failed. Please try again.",
      "error"
    );

    // If upload failed, try to clean up any partial upload
    if (uploadStartTime) {
      const fileExt = file.name.split(".").pop().toLowerCase();
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const fileName = `video_${timestamp}_${randomId}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      sb.storage.from("videos").remove([filePath]).catch(console.error);
    }
  } finally {
    isUploading = false;
    uploadBtn.disabled = false;
    saveDraftBtn.disabled = false;
    uploadBtn.textContent = "🚀 Upload Video";
    uploadBtn.classList.remove("loading");

    setTimeout(() => {
      if (progressSection && progressSection.style.display !== "none") {
        progressSection.style.display = "none";
        progressBar.style.width = "0%";
      }
    }, 3000);
  }
}

function resetUploadForm() {
  const form = $("upload-form");
  if (form) {
    form.reset();
  }

  removeVideoPreview();

  // Reset character counters
  updateCharCount("video-title", 200);
  updateCharCount("video-description", 500);
}

async function saveDraft() {
  const title = $("video-title").value.trim();
  const description = $("video-description").value.trim();

  if (!title && !description) {
    showMessage("upload-message", "Nothing to save as draft", "warning");
    return;
  }

  try {
    const draftData = {
      title: title || "",
      description: description || "",
      timestamp: Date.now(),
    };

    localStorage.setItem("videoDraft", JSON.stringify(draftData));
    showMessage("upload-message", "Draft saved successfully! 💾", "success");
  } catch (error) {
    console.error("Error saving draft:", error);
    showMessage("upload-message", "Error saving draft", "error");
  }
}

// Load draft on page load
function loadDraft() {
  try {
    const draftData = localStorage.getItem("videoDraft");
    if (draftData) {
      const draft = JSON.parse(draftData);
      const titleInput = $("video-title");
      const descInput = $("video-description");

      if (titleInput && draft.title) {
        titleInput.value = draft.title;
        updateCharCount("video-title", 200);
      }

      if (descInput && draft.description) {
        descInput.value = draft.description;
        updateCharCount("video-description", 500);
      }

      showMessage("upload-message", "Draft loaded", "info");
    }
  } catch (error) {
    console.error("Error loading draft:", error);
  }
}

/* ---------- VIDEO FEED FUNCTIONALITY ---------- */
async function loadVideoFeed() {
  const loading = $("loading");
  const feedVideos = $("feed-videos");

  try {
    if (loading) loading.style.display = "block";

    const { data: videos, error } = await sb
      .from("videos")
      .select(
        `
        *,
        profiles:user_id (username, avatar_url, full_name)
      `
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(0, videosPerPage - 1);

    if (error) {
      console.error("Error loading videos:", error);
      throw error;
    }

    if (loading) loading.style.display = "none";

    if (videos && videos.length > 0) {
      feedVideos.innerHTML = ""; // Clear existing content
      videos.forEach((video) => {
        feedVideos.appendChild(createVideoCard(video));
      });
      videosLoaded = videos.length;

      // Show/hide load more button
      const loadMoreBtn = $("load-more");
      if (loadMoreBtn) {
        loadMoreBtn.style.display =
          videos.length < videosPerPage ? "none" : "block";
      }
    } else {
      feedVideos.innerHTML = `
        <div class="no-videos">
          <p>No videos yet. Be the first to upload! 🎬</p>
          <a href="createone.html" class="btn primary">Upload Video</a>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading videos:", error);
    if (loading) loading.style.display = "none";
    if (feedVideos) {
      feedVideos.innerHTML = `
        <div class="error">
          <p>Error loading videos. Please refresh the page.</p>
          <button onclick="loadVideoFeed()" class="btn secondary">Retry</button>
        </div>
      `;
    }
  }
}

async function loadMoreVideos() {
  const loadMoreBtn = $("load-more");
  const feedVideos = $("feed-videos");

  if (!loadMoreBtn || !feedVideos) return;

  try {
    loadMoreBtn.textContent = "Loading...";
    loadMoreBtn.disabled = true;

    const { data: videos, error } = await sb
      .from("videos")
      .select(
        `
        *,
        profiles:user_id (username, avatar_url, full_name)
      `
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(videosLoaded, videosLoaded + videosPerPage - 1);

    if (error) throw error;

    if (videos && videos.length > 0) {
      videos.forEach((video) => {
        feedVideos.appendChild(createVideoCard(video));
      });
      videosLoaded += videos.length;
    }

    if (videos.length < videosPerPage) {
      loadMoreBtn.style.display = "none";
    }
  } catch (error) {
    console.error("Error loading more videos:", error);
    showMessage("feed-message", "Error loading more videos", "error");
  } finally {
    loadMoreBtn.textContent = "Load More Videos";
    loadMoreBtn.disabled = false;
  }
}

function createVideoCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";

  const timeAgo = getTimeAgo(new Date(video.created_at));
  const username =
    video.profiles?.username || video.profiles?.full_name || "Unknown User";
  const avatarLetter = username.charAt(0).toUpperCase();

  card.innerHTML = `
    <div class="video-header">
      <div class="user-info">
        <div class="user-avatar">${avatarLetter}</div>
        <div class="user-details">
          <h4>${username}</h4>
          <span class="post-time">${timeAgo}</span>
        </div>
      </div>
    </div>
    
    <div class="video-container">
      <video controls preload="metadata" controlsList="nodownload">
        <source src="${video.video_url}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>
    
    <div class="video-content">
      <h3 class="video-title">${video.title}</h3>
      ${
        video.description
          ? `<p class="video-description">${video.description}</p>`
          : ""
      }
    </div>
    
    <div class="video-actions">
      <button class="action-btn like-btn" data-video-id="${video.id}">
        <span>❤️</span>
        <span class="like-count">${video.likes_count || 0} Likes</span>
      </button>
      <button class="action-btn view-btn" data-video-id="${video.id}">
        <span>👁️</span>
        <span>${video.views_count || 0} Views</span>
      </button>
      <button class="action-btn share-btn" data-video-id="${video.id}">
        <span>📤</span>
        <span>Share</span>
      </button>
    </div>
  `;

  // Add event listeners
  const likeBtn = card.querySelector(".like-btn");
  const viewBtn = card.querySelector(".view-btn");
  const shareBtn = card.querySelector(".share-btn");
  const videoElement = card.querySelector("video");

  if (likeBtn) likeBtn.onclick = () => toggleLike(video.id, likeBtn);
  if (shareBtn) shareBtn.onclick = () => shareVideo(video);
  if (videoElement) {
    videoElement.onplay = () => incrementViews(video.id, viewBtn);
  }

  return card;
}

async function toggleLike(videoId, likeBtn) {
  if (!currentUser) return;

  try {
    const { data: existingLike, error: checkError } = await sb
      .from("video_likes")
      .select()
      .eq("video_id", videoId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (existingLike) {
      // Unlike
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
      // Like
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
    showMessage("feed-message", "Error updating like", "error");
  }
}

async function incrementViews(videoId, viewBtn) {
  try {
    const { error } = await sb.rpc("increment_video_views", {
      video_id: videoId,
    });

    if (error) throw error;

    // Update UI
    if (viewBtn) {
      const viewSpan = viewBtn.querySelector("span:last-child");
      if (viewSpan) {
        const currentCount = parseInt(viewSpan.textContent) || 0;
        viewSpan.textContent = `${currentCount + 1} Views`;
      }
    }
  } catch (error) {
    console.error("Error incrementing views:", error);
  }
}

function shareVideo(video) {
  if (navigator.share) {
    navigator
      .share({
        title: video.title,
        text: video.description || "Check out this video!",
        url: video.video_url,
      })
      .catch(console.error);
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard
      .writeText(video.video_url)
      .then(() => {
        showMessage(
          "feed-message",
          "Video URL copied to clipboard! 📋",
          "success"
        );
      })
      .catch(() => {
        showMessage("feed-message", "Unable to share video", "error");
      });
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
    const { data, error } = await sb.auth.updateUser({
      data: { username: username },
    });

    if (error) throw error;

    showMessage("profile-message", "Profile updated successfully!", "success");
    loadUserData(data.user);
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
    const { error } = await sb.auth.updateUser({
      password: newPass,
    });

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

    // Clear any stored drafts
    localStorage.removeItem("videoDraft");

    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    window.location.href = "index.html";
  }
}

/* ---------- UTILITY FUNCTIONS ---------- */
// Load draft when create page loads
if (window.location.pathname.includes("createone.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(loadDraft, 100);
  });
}

// Auto-save draft every 30 seconds
setInterval(() => {
  if (window.location.pathname.includes("createone.html")) {
    const title = $("video-title")?.value.trim();
    const description = $("video-description")?.value.trim();

    if (title || description) {
      saveDraft();
    }
  }
}, 30000);

// Make functions globally available for debugging
window.debugFunctions = {
  loadVideoFeed,
  uploadVideo,
  currentUser: () => currentUser,
  isUploading: () => isUploading,
};
