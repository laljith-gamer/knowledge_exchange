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

let currentUser = null;

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = session.user;
  loadUserData(session.user);
  bindDashboardEvents();

  // Load videos if on home page
  if (window.location.pathname.includes("home.html")) {
    loadVideoFeed();
  }
});

/* ---------- load user data ---------- */
function loadUserData(user) {
  const profileName = $("profile-name");
  const profileEmail = $("profile-email");
  const profileDate = $("profile-date");

  const username = user.user_metadata?.username || "User";

  if (profileName) profileName.textContent = username;
  if (profileEmail) profileEmail.textContent = user.email;
  if (profileDate)
    profileDate.textContent = new Date(user.created_at).toLocaleDateString();

  const updateUsername = $("update-username");
  const updateEmail = $("update-email");

  if (updateUsername) updateUsername.value = username;
  if (updateEmail) updateEmail.value = user.email;
}

/* ---------- dashboard events ---------- */
function bindDashboardEvents() {
  // Logout functionality
  const logoutBtn = $("logout");
  if (logoutBtn) {
    logoutBtn.onclick = logout;
  }

  // Video upload form
  const uploadForm = $("upload-form");
  if (uploadForm) {
    uploadForm.onsubmit = uploadVideo;

    // File input change
    const videoFile = $("video-file");
    if (videoFile) {
      videoFile.onchange = handleVideoSelect;
    }

    // Remove video
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
  }

  // Load more videos
  const loadMoreBtn = $("load-more");
  if (loadMoreBtn) {
    loadMoreBtn.onclick = loadMoreVideos;
  }
}

/* ---------- video upload ---------- */
function handleVideoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Check file size (100MB max)
  if (file.size > 100 * 1024 * 1024) {
    showMessage("upload-message", "File size must be less than 100MB", "error");
    e.target.value = "";
    return;
  }

  // Show preview
  const preview = $("video-preview");
  const video = preview.querySelector("video");
  const uploadArea = $("video-upload-area");

  video.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");
  uploadArea.style.display = "none";
}

function removeVideoPreview() {
  const preview = $("video-preview");
  const video = preview.querySelector("video");
  const uploadArea = $("video-upload-area");
  const fileInput = $("video-file");

  video.src = "";
  preview.classList.add("hidden");
  uploadArea.style.display = "block";
  fileInput.value = "";
}

async function uploadVideo(e) {
  e.preventDefault();

  const fileInput = $("video-file");
  const title = $("video-title").value.trim();
  const description = $("video-description").value.trim();

  if (!fileInput.files[0]) {
    showMessage("upload-message", "Please select a video file", "error");
    return;
  }

  if (!title) {
    showMessage("upload-message", "Please enter a title", "error");
    return;
  }

  const file = fileInput.files[0];
  const uploadBtn = $("upload-btn");
  const progressSection = $("upload-progress-section");
  const progressBar = $("upload-progress");
  const progressStatus = $("upload-status");

  try {
    // Disable form
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
    progressSection.style.display = "block";

    // Create unique filename
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}.${fileExt}`;
    const filePath = `videos/${currentUser.id}/${fileName}`;

    progressStatus.textContent = "Uploading video...";

    // Upload video to storage
    const { data: uploadData, error: uploadError } = await sb.storage
      .from("videos")
      .upload(filePath, file, {
        onUploadProgress: (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          progressBar.style.width = `${percent}%`;
          progressStatus.textContent = `Uploading: ${Math.round(percent)}%`;
        },
      });

    if (uploadError) throw uploadError;

    progressStatus.textContent = "Getting video URL...";

    // Get public URL
    const { data: urlData } = sb.storage.from("videos").getPublicUrl(filePath);

    progressStatus.textContent = "Saving video details...";

    // Save video details to database
    const { data: videoData, error: dbError } = await sb
      .from("videos")
      .insert({
        user_id: currentUser.id,
        title: title,
        description: description,
        video_url: urlData.publicUrl,
      })
      .select();

    if (dbError) throw dbError;

    showMessage("upload-message", "Video uploaded successfully! 🎉", "success");

    // Reset form
    e.target.reset();
    removeVideoPreview();
    progressSection.style.display = "none";

    // Redirect to home after delay
    setTimeout(() => {
      window.location.href = "home.html";
    }, 2000);
  } catch (error) {
    console.error("Upload error:", error);
    showMessage("upload-message", error.message || "Upload failed", "error");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "🚀 Upload Video";
    progressBar.style.width = "0%";
  }
}

/* ---------- video feed ---------- */
let videosLoaded = 0;
const videosPerPage = 10;

async function loadVideoFeed() {
  const loading = $("loading");
  const feedVideos = $("feed-videos");

  try {
    loading.style.display = "block";

    const { data: videos, error } = await sb
      .from("videos")
      .select(
        `
        *,
        profiles:user_id (username, avatar_url)
      `
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(0, videosPerPage - 1);

    if (error) throw error;

    loading.style.display = "none";

    if (videos && videos.length > 0) {
      videos.forEach((video) => {
        feedVideos.appendChild(createVideoCard(video));
      });
      videosLoaded = videos.length;
    } else {
      feedVideos.innerHTML =
        '<div class="no-videos"><p>No videos yet. Be the first to upload!</p></div>';
    }
  } catch (error) {
    console.error("Error loading videos:", error);
    loading.style.display = "none";
    feedVideos.innerHTML =
      '<div class="error"><p>Error loading videos</p></div>';
  }
}

async function loadMoreVideos() {
  const loadMoreBtn = $("load-more");
  const feedVideos = $("feed-videos");

  try {
    loadMoreBtn.textContent = "Loading...";
    loadMoreBtn.disabled = true;

    const { data: videos, error } = await sb
      .from("videos")
      .select(
        `
        *,
        profiles:user_id (username, avatar_url)
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
  } finally {
    loadMoreBtn.textContent = "Load More Videos";
    loadMoreBtn.disabled = false;
  }
}

function createVideoCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";

  const timeAgo = getTimeAgo(new Date(video.created_at));
  const username = video.profiles?.username || "Unknown User";
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
      <video controls preload="metadata">
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
        <span>${video.likes_count || 0} Likes</span>
      </button>
      <button class="action-btn">
        <span>👁️</span>
        <span>${video.views_count || 0} Views</span>
      </button>
    </div>
  `;

  // Add like functionality
  const likeBtn = card.querySelector(".like-btn");
  likeBtn.onclick = () => toggleLike(video.id, likeBtn);

  return card;
}

async function toggleLike(videoId, likeBtn) {
  try {
    const { data: existingLike } = await sb
      .from("video_likes")
      .select()
      .eq("video_id", videoId)
      .eq("user_id", currentUser.id)
      .single();

    if (existingLike) {
      // Unlike
      await sb
        .from("video_likes")
        .delete()
        .eq("video_id", videoId)
        .eq("user_id", currentUser.id);

      likeBtn.classList.remove("liked");
    } else {
      // Like
      await sb
        .from("video_likes")
        .insert({ video_id: videoId, user_id: currentUser.id });

      likeBtn.classList.add("liked");
    }
  } catch (error) {
    console.error("Error toggling like:", error);
  }
}

/* ---------- utility functions ---------- */
function updateCharCount(inputId, maxLength) {
  const input = $(inputId);
  const counter = input.parentElement.querySelector(".char-count");
  if (counter) {
    const currentLength = input.value.length;
    counter.textContent = `${currentLength}/${maxLength}`;
    counter.style.color = currentLength > maxLength ? "#dc3545" : "#6c757d";
  }
}

function getTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}
