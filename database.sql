-- =====================================================
-- STEP 1: FORCE DROP ALL EXISTING OBJECTS
-- =====================================================

-- Drop triggers first
DO $$ 
BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    DROP TRIGGER IF EXISTS update_videos_search_vector ON videos;
    DROP TRIGGER IF EXISTS update_profile_stats_videos ON videos;
    DROP TRIGGER IF EXISTS update_profile_stats_follows ON user_follows;
    DROP TRIGGER IF EXISTS update_video_stats_likes ON video_likes;
    DROP TRIGGER IF EXISTS update_video_stats_comments ON video_comments;
    DROP TRIGGER IF EXISTS update_video_stats_requests ON secret_requests;
    DROP TRIGGER IF EXISTS trigger_notify_creator ON secret_requests;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Some triggers did not exist, continuing...';
END $$;

-- Drop functions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_video_search_vector() CASCADE;
DROP FUNCTION IF EXISTS update_profile_stats() CASCADE;
DROP FUNCTION IF EXISTS update_video_stats() CASCADE;
DROP FUNCTION IF EXISTS increment_video_views(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_has_video_access(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS grant_video_access(UUID, UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS get_creator_requests(UUID) CASCADE;
DROP FUNCTION IF EXISTS handle_request_decision(UUID, UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS notify_creator_of_request() CASCADE;
DROP FUNCTION IF EXISTS add_secret_request(UUID, UUID, UUID, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS add_video_comment(UUID, UUID, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_video_comments(UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS update_user_profile(UUID, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_privacy_settings(UUID, BOOLEAN, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS user_exists_by_email(TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_user_by_username(TEXT) CASCADE;

-- Drop all tables 
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS user_activity CASCADE;
DROP TABLE IF EXISTS video_analytics CASCADE;
DROP TABLE IF EXISTS video_access CASCADE;
DROP TABLE IF EXISTS secret_requests CASCADE;
DROP TABLE IF EXISTS comment_likes CASCADE;
DROP TABLE IF EXISTS video_comments CASCADE;
DROP TABLE IF EXISTS video_likes CASCADE;
DROP TABLE IF EXISTS user_follows CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;


-- =====================================================
-- STEP 2: CREATE ALL TABLES
-- =====================================================

-- Profiles table
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    full_name VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    instagram_handle VARCHAR(50),
    website_url TEXT,
    skills TEXT[] DEFAULT '{}',
    expertise_categories TEXT[] DEFAULT '{}',
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    videos_count INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT true,
    allow_requests BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Videos table
CREATE TABLE videos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER DEFAULT 0,
    category VARCHAR(50) DEFAULT 'general' 
        CHECK (category IN ('programming', 'cooking', 'art-design', 'business', 'fitness', 'music', 'general', 'photography', 'marketing', 'lifestyle')),
    is_secret BOOLEAN DEFAULT false,
    access_type VARCHAR(20) DEFAULT 'free' 
        CHECK (access_type IN ('free', 'paid', 'exchange', 'followers-only')),
    price DECIMAL(10,2),
    secret_preview TEXT,
    instagram_link TEXT,
    tags TEXT[] DEFAULT '{}',
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    requests_count INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_trending BOOLEAN DEFAULT false,
    search_vector tsvector,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User follows table
CREATE TABLE user_follows (
    follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- Video likes table
CREATE TABLE video_likes (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, video_id)
);

-- Video comments table
CREATE TABLE video_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES video_comments(id) ON DELETE CASCADE,
    likes_count INTEGER DEFAULT 0,
    is_edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comment likes table
CREATE TABLE comment_likes (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    comment_id UUID REFERENCES video_comments(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, comment_id)
);

-- Secret requests table
CREATE TABLE secret_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
    creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    reason TEXT NOT NULL,
    offer_type VARCHAR(20) NOT NULL
        CHECK (offer_type IN ('skill', 'payment', 'favor', 'collaboration')),
    offer_details TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    creator_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    UNIQUE(requester_id, video_id)
);

-- Video access table
CREATE TABLE video_access (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_method VARCHAR(20) DEFAULT 'request'
        CHECK (access_method IN ('request', 'purchase', 'follow', 'gift')),
    PRIMARY KEY (user_id, video_id)
);

-- Video analytics table
CREATE TABLE video_analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL
        CHECK (event_type IN ('view', 'like', 'unlike', 'comment', 'share', 'request', 'access_granted')),
    event_data JSONB DEFAULT '{}',
    user_agent TEXT,
    ip_address INET,
    referrer TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User activity table
CREATE TABLE user_activity (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) NOT NULL
        CHECK (type IN ('like', 'comment', 'follow', 'request', 'approval', 'mention', 'video_upload')),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_type VARCHAR(50),
    target_id UUID,
    is_read BOOLEAN DEFAULT false,
    is_seen BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- STEP 3: CREATE INDEXES
-- =====================================================

CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_created_at ON profiles(created_at DESC);
CREATE INDEX idx_profiles_followers ON profiles(followers_count DESC);

CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX idx_videos_category ON videos(category);
CREATE INDEX idx_videos_is_secret ON videos(is_secret);
CREATE INDEX idx_videos_is_published ON videos(is_published);
CREATE INDEX idx_videos_views_count ON videos(views_count DESC);
CREATE INDEX idx_videos_likes_count ON videos(likes_count DESC);

CREATE INDEX idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_id);
CREATE INDEX idx_video_likes_video_id ON video_likes(video_id);
CREATE INDEX idx_video_likes_user_id ON video_likes(user_id);
CREATE INDEX idx_video_comments_video_id ON video_comments(video_id);
CREATE INDEX idx_video_comments_user_id ON video_comments(user_id);

CREATE INDEX idx_secret_requests_video_id ON secret_requests(video_id);
CREATE INDEX idx_secret_requests_requester_id ON secret_requests(requester_id);
CREATE INDEX idx_secret_requests_creator_id ON secret_requests(creator_id);
CREATE INDEX idx_secret_requests_status ON secret_requests(status);

CREATE INDEX idx_video_access_user_id ON video_access(user_id);
CREATE INDEX idx_video_access_video_id ON video_access(video_id);

CREATE INDEX idx_video_analytics_video_id ON video_analytics(video_id);
CREATE INDEX idx_video_analytics_event_type ON video_analytics(event_type);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

CREATE INDEX idx_videos_search ON videos USING gin(search_vector);

-- =====================================================
-- STEP 4: ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 5: CREATE RLS POLICIES
-- =====================================================

-- Profiles policies
CREATE POLICY "profiles_select_policy" ON profiles
    FOR SELECT USING (is_public = true OR auth.uid() = id);

CREATE POLICY "profiles_insert_policy" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_policy" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Videos policies
CREATE POLICY "videos_select_policy" ON videos
    FOR SELECT USING (is_published = true);

CREATE POLICY "videos_insert_policy" ON videos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "videos_update_policy" ON videos
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "videos_delete_policy" ON videos
    FOR DELETE USING (auth.uid() = user_id);

-- Social interaction policies
CREATE POLICY "video_likes_select_policy" ON video_likes
    FOR SELECT USING (true);

CREATE POLICY "video_likes_insert_policy" ON video_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "video_likes_delete_policy" ON video_likes
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "video_comments_select_policy" ON video_comments
    FOR SELECT USING (true);

CREATE POLICY "video_comments_insert_policy" ON video_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "video_comments_update_policy" ON video_comments
    FOR UPDATE USING (auth.uid() = user_id);

-- Secret requests policies
CREATE POLICY "secret_requests_select_policy" ON secret_requests
    FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = creator_id);

CREATE POLICY "secret_requests_insert_policy" ON secret_requests
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "secret_requests_update_policy" ON secret_requests
    FOR UPDATE USING (auth.uid() = creator_id);

-- Notifications policies
CREATE POLICY "notifications_select_policy" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_policy" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- STEP 6: CREATE FUNCTIONS
-- =====================================================

-- User registration trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    username,
    full_name,
    bio,
    avatar_url,
    instagram_handle,
    website_url,
    skills,
    expertise_categories,
    followers_count,
    following_count,
    videos_count,
    total_views,
    total_likes,
    is_verified,
    is_public,
    allow_requests,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULL, -- bio can be null
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    NULL, -- instagram_handle can be null
    NULL, -- website_url can be null
    '{}', -- empty array for skills
    '{}', -- empty array for expertise_categories
    0,    -- followers_count
    0,    -- following_count
    0,    -- videos_count
    0,    -- total_views
    0,    -- total_likes
    false, -- is_verified
    true,  -- is_public
    true,  -- allow_requests
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Update video search vector
CREATE OR REPLACE FUNCTION update_video_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update profile statistics
CREATE OR REPLACE FUNCTION update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'videos' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE profiles SET videos_count = videos_count + 1 WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE profiles SET videos_count = GREATEST(videos_count - 1, 0) WHERE id = OLD.user_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'user_follows' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Update video statistics
CREATE OR REPLACE FUNCTION update_video_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'video_likes' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE videos SET likes_count = likes_count + 1 WHERE id = NEW.video_id;
      INSERT INTO video_analytics (video_id, user_id, event_type) 
      VALUES (NEW.video_id, NEW.user_id, 'like');
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.video_id;
      INSERT INTO video_analytics (video_id, user_id, event_type) 
      VALUES (OLD.video_id, OLD.user_id, 'unlike');
    END IF;
  ELSIF TG_TABLE_NAME = 'video_comments' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE videos SET comments_count = comments_count + 1 WHERE id = NEW.video_id;
      INSERT INTO video_analytics (video_id, user_id, event_type) 
      VALUES (NEW.video_id, NEW.user_id, 'comment');
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE videos SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.video_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'secret_requests' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE videos SET requests_count = requests_count + 1 WHERE id = NEW.video_id;
      INSERT INTO video_analytics (video_id, user_id, event_type) 
      VALUES (NEW.video_id, NEW.requester_id, 'request');
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE videos SET requests_count = GREATEST(requests_count - 1, 0) WHERE id = OLD.video_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Increment video views
CREATE OR REPLACE FUNCTION increment_video_views(video_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE videos 
  SET views_count = views_count + 1,
      updated_at = NOW()
  WHERE id = video_id;
  
  INSERT INTO video_analytics (video_id, user_id, event_type)
  VALUES (video_id, auth.uid(), 'view');
  
  UPDATE profiles 
  SET total_views = total_views + 1
  WHERE id = (SELECT user_id FROM videos WHERE id = video_id);
  
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to secret video
CREATE OR REPLACE FUNCTION user_has_video_access(video_id UUID, user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
  video_record videos%ROWTYPE;
BEGIN
  SELECT * INTO video_record FROM videos WHERE id = video_id;
  
  IF NOT FOUND OR NOT video_record.is_published THEN
    RETURN FALSE;
  END IF;
  
  IF NOT video_record.is_secret THEN
    RETURN TRUE;
  END IF;
  
  IF user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF user_id = video_record.user_id THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM video_access 
    WHERE video_id = video_record.id 
    AND user_id = user_has_video_access.user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to secret video
CREATE OR REPLACE FUNCTION grant_video_access(video_id UUID, user_id UUID, method VARCHAR(20) DEFAULT 'request')
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO video_access (user_id, video_id, access_method)
  VALUES (user_id, video_id, method)
  ON CONFLICT (user_id, video_id) DO NOTHING;
  
  INSERT INTO video_analytics (video_id, user_id, event_type)
  VALUES (video_id, user_id, 'access_granted');
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending requests for a creator
CREATE OR REPLACE FUNCTION get_creator_requests(p_creator_id UUID)
RETURNS TABLE (
  id UUID,
  video_title TEXT,
  requester_username TEXT,
  requester_email TEXT,
  reason TEXT,
  offer_type TEXT,
  offer_details TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  video_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sr.id,
    v.title as video_title,
    p.username as requester_username,
    au.email as requester_email,
    sr.reason,
    sr.offer_type,
    sr.offer_details,
    sr.status,
    sr.created_at,
    sr.video_id
  FROM secret_requests sr
  JOIN videos v ON sr.video_id = v.id
  JOIN profiles p ON sr.requester_id = p.id
  JOIN auth.users au ON sr.requester_id = au.id
  WHERE sr.creator_id = p_creator_id
  AND sr.status = 'pending'
  ORDER BY sr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve/reject requests
CREATE OR REPLACE FUNCTION handle_request_decision(
  p_request_id UUID,
  p_creator_id UUID,
  p_decision TEXT,
  p_response TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  request_record secret_requests%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN json_build_object('success', false, 'message', 'Invalid decision');
  END IF;
  
  SELECT * INTO request_record 
  FROM secret_requests 
  WHERE id = p_request_id AND creator_id = p_creator_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Request not found');
  END IF;
  
  UPDATE secret_requests 
  SET 
    status = p_decision,
    creator_response = p_response,
    responded_at = NOW()
  WHERE id = p_request_id;
  
  IF p_decision = 'approved' THEN
    INSERT INTO video_access (user_id, video_id, access_method)
    VALUES (request_record.requester_id, request_record.video_id, 'request')
    ON CONFLICT (user_id, video_id) DO NOTHING;
  END IF;
  
  INSERT INTO notifications (
    user_id, 
    type, 
    title, 
    message, 
    actor_id,
    target_type,
    target_id
  )
  VALUES (
    request_record.requester_id,
    CASE WHEN p_decision = 'approved' THEN 'approval' ELSE 'rejection' END,
    CASE WHEN p_decision = 'approved' 
         THEN 'Request Approved! 🎉' 
         ELSE 'Request Declined' END,
    CASE WHEN p_decision = 'approved'
         THEN 'Your request for secret knowledge has been approved!'
         ELSE 'Your request was not approved this time.' END,
    p_creator_id,
    'request',
    p_request_id
  );
  
  RETURN json_build_object('success', true, 'message', 'Request ' || p_decision);
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'Error processing request');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to notify creator of new requests
CREATE OR REPLACE FUNCTION notify_creator_of_request()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (
    user_id,
    type,
    title, 
    message,
    actor_id,
    target_type,
    target_id
  )
  VALUES (
    NEW.creator_id,
    'request',
    'New Secret Request! 🔔',
    'Someone wants to learn your secret knowledge',
    NEW.requester_id,
    'request', 
    NEW.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Safe function to add secret request
CREATE OR REPLACE FUNCTION public.add_secret_request(
  p_requester_id UUID,
  p_video_id UUID,
  p_creator_id UUID,
  p_reason TEXT,
  p_offer_type TEXT,
  p_offer_details TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  existing_request secret_requests%ROWTYPE;
BEGIN
  SELECT * INTO existing_request 
  FROM secret_requests 
  WHERE requester_id = p_requester_id AND video_id = p_video_id;
  
  IF FOUND THEN
    result := json_build_object(
      'success', false,
      'message', 'You have already requested access to this video',
      'existing_status', existing_request.status,
      'created_at', existing_request.created_at
    );
  ELSE
    INSERT INTO secret_requests (
      requester_id, video_id, creator_id, reason, 
      offer_type, offer_details, status, created_at
    ) VALUES (
      p_requester_id, p_video_id, p_creator_id, p_reason, 
      p_offer_type, p_offer_details, 'pending', NOW()
    );
    
    result := json_build_object(
      'success', true,
      'message', 'Request sent successfully!'
    );
  END IF;
  
  RETURN result;
END;
$$;

-- Function to add video comment
CREATE OR REPLACE FUNCTION public.add_video_comment(
  p_user_id UUID,
  p_video_id UUID,
  p_content TEXT,
  p_parent_comment_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_comment_id UUID;
  result JSON;
BEGIN
  INSERT INTO video_comments (
    user_id, video_id, content, parent_comment_id, created_at
  ) VALUES (
    p_user_id, p_video_id, p_content, p_parent_comment_id, NOW()
  ) RETURNING id INTO new_comment_id;
  
  result := json_build_object(
    'success', true,
    'comment_id', new_comment_id,
    'message', 'Comment added successfully'
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    result := json_build_object(
      'success', false,
      'message', 'Failed to add comment'
    );
    RETURN result;
END;
$$;

-- Function to get video comments
CREATE OR REPLACE FUNCTION public.get_video_comments(
  p_video_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  likes_count INTEGER,
  user_info JSON,
  parent_comment_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vc.id,
    vc.content,
    vc.created_at,
    vc.likes_count,
    json_build_object(
      'username', p.username,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url
    ) as user_info,
    vc.parent_comment_id
  FROM video_comments vc
  JOIN profiles p ON vc.user_id = p.id
  WHERE vc.video_id = p_video_id
  ORDER BY vc.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Function to update user profile
CREATE OR REPLACE FUNCTION public.update_user_profile(
  p_user_id UUID,
  p_username VARCHAR(30),
  p_full_name VARCHAR(100) DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_instagram_handle VARCHAR(50) DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  existing_user UUID;
BEGIN
  SELECT id INTO existing_user 
  FROM profiles 
  WHERE username = p_username AND id != p_user_id;
  
  IF FOUND THEN
    result := json_build_object(
      'success', false,
      'message', 'Username already taken'
    );
    RETURN result;
  END IF;
  
  UPDATE profiles SET
    username = p_username,
    full_name = COALESCE(p_full_name, full_name),
    bio = COALESCE(p_bio, bio),
    instagram_handle = COALESCE(p_instagram_handle, instagram_handle),
    website_url = COALESCE(p_website_url, website_url),
    updated_at = NOW()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    result := json_build_object(
      'success', false,
      'message', 'Profile not found'
    );
    RETURN result;
  END IF;
  
  UPDATE auth.users SET
    raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{username}',
      to_jsonb(p_username)
    ),
    raw_user_meta_data = jsonb_set(
      raw_user_meta_data,
      '{full_name}',
      to_jsonb(COALESCE(p_full_name, ''))
    )
  WHERE id = p_user_id;
  
  result := json_build_object(
    'success', true,
    'message', 'Profile updated successfully'
  );
  
  RETURN result;
END;
$$;

-- Function to update privacy settings
CREATE OR REPLACE FUNCTION public.update_privacy_settings(
  p_user_id UUID,
  p_is_public BOOLEAN,
  p_allow_requests BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  UPDATE profiles SET
    is_public = p_is_public,
    allow_requests = p_allow_requests,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    result := json_build_object(
      'success', false,
      'message', 'Profile not found'
    );
    RETURN result;
  END IF;
  
  result := json_build_object(
    'success', true,
    'message', 'Privacy settings updated successfully'
  );
  
  RETURN result;
END;
$$;

-- Function to check if user exists by email
CREATE OR REPLACE FUNCTION public.user_exists_by_email(email_input TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE LOWER(email) = LOWER(email_input)
  );
$$;

-- Function to get user email by username
CREATE OR REPLACE FUNCTION get_user_by_username(username_input text)
RETURNS TABLE(email text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  select u.email::text
  from auth.users u
  where u.raw_user_meta_data ->> 'username' = username_input
  limit 1;
$$;

-- =====================================================
-- STEP 7: CREATE TRIGGERS
-- =====================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_videos_search_vector
  BEFORE INSERT OR UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_video_search_vector();

CREATE TRIGGER update_profile_stats_videos
  AFTER INSERT OR DELETE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_profile_stats();

CREATE TRIGGER update_profile_stats_follows
  AFTER INSERT OR DELETE ON user_follows
  FOR EACH ROW EXECUTE FUNCTION update_profile_stats();

CREATE TRIGGER update_video_stats_likes
  AFTER INSERT OR DELETE ON video_likes
  FOR EACH ROW EXECUTE FUNCTION update_video_stats();

CREATE TRIGGER update_video_stats_comments
  AFTER INSERT OR DELETE ON video_comments
  FOR EACH ROW EXECUTE FUNCTION update_video_stats();

CREATE TRIGGER update_video_stats_requests
  AFTER INSERT OR DELETE ON secret_requests
  FOR EACH ROW EXECUTE FUNCTION update_video_stats();

CREATE TRIGGER trigger_notify_creator
  AFTER INSERT ON secret_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_creator_of_request();

-- =====================================================
-- STEP 8: STORAGE SETUP
-- =====================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Anyone can view videos" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their videos" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their videos" ON storage.objects;
  
  CREATE POLICY "Anyone can view videos" ON storage.objects
      FOR SELECT USING (bucket_id = 'videos');
  
  CREATE POLICY "Authenticated users can upload" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated');
      
  CREATE POLICY "Users can update their videos" ON storage.objects
      FOR UPDATE USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
  
  CREATE POLICY "Users can delete their videos" ON storage.objects
      FOR DELETE USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Storage policies handled';
END $$;

-- =====================================================
-- STEP 9: GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION public.handle_new_user TO authenticated;
GRANT EXECUTE ON FUNCTION update_video_search_vector TO authenticated;
GRANT EXECUTE ON FUNCTION update_profile_stats TO authenticated;
GRANT EXECUTE ON FUNCTION update_video_stats TO authenticated;
GRANT EXECUTE ON FUNCTION increment_video_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_video_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION grant_video_access(UUID, UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_creator_requests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_request_decision(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_creator_of_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_secret_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_video_comment TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_video_comments TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_privacy_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_exists_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_exists_by_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_user_by_username(TEXT) TO authenticated;

-- =====================================================
-- SUCCESS CONFIRMATION
-- =====================================================

SELECT 
  'SecretShare platform database created successfully! 🎉' as status,
  'All tables, triggers, and functions are ready.' as message,
  'Your frontend can now interact with the complete schema.' as note;
