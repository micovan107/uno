// JavaScript dành riêng cho trang profile.html
import { auth, db } from './auth.js';
import { ref, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

console.log("profile.js loaded");

const params = new URLSearchParams(window.location.search);
const userId = params.get('uid');

// Elements
const profileAvatar = document.getElementById('profile-avatar');
const profileDisplayName = document.getElementById('profile-display-name');
const profileUsername = document.getElementById('profile-username');
const postCount = document.getElementById('post-count');
const followerCount = document.getElementById('follower-count');
const followingCount = document.getElementById('following-count');
const userPostsContainer = document.getElementById('user-posts');
const usernamePosts = document.getElementById('username-posts');

// Hàm render bài đăng
const renderPost = (postId, postData) => {
    const postElement = document.createElement('article');
    postElement.className = 'post-item';
    postElement.innerHTML = `
        <h3><a href="post.html?id=${postId}">${postData.title}</a></h3>
        <p>${postData.content.substring(0, 150)}...</p>
        <div class="post-meta">
            <span>Trong <a href="group.html?id=${postData.group}">#${postData.group}</a></span>
            <span class="likes">❤️ ${postData.likes || 0}</span>
        </div>
    `;
    return postElement;
};


const loadUserProfile = async () => {
    if (!userId) {
        profileDisplayName.textContent = "Không tìm thấy người dùng.";
        return;
    }
    
    try {
        // Lấy thông tin user từ nhánh 'users'
        const userRef = ref(db, 'users/' + userId);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            profileAvatar.src = userData.photoURL || 'https://via.placeholder.com/150';
            profileDisplayName.textContent = userData.displayName;
            profileUsername.textContent = `@${userData.username || 'username'}`;
            usernamePosts.textContent = `@${userData.username || 'username'}`;
            followerCount.textContent = userData.followers || 0;
            followingCount.textContent = userData.following || 0;
        } else {
            profileDisplayName.textContent = "Người dùng không tồn tại";
            console.log("Không tìm thấy user trong Realtime Database.");
        }

    } catch (error) {
        console.error("Lỗi tải thông tin người dùng:", error);
        profileDisplayName.textContent = "Lỗi tải hồ sơ";
    }
};

const loadUserPosts = async () => {
    if (!userId) return;
    userPostsContainer.innerHTML = 'Đang tải bài viết...';
    try {
        const postsRef = ref(db, 'posts');
        const postsQuery = query(postsRef, orderByChild('authorId'), equalTo(userId));
        
        const snapshot = await get(postsQuery);
        userPostsContainer.innerHTML = '';
        
        if (snapshot.exists()) {
            const posts = snapshot.val();
            const postIds = Object.keys(posts);
            postCount.textContent = postIds.length; // Cập nhật số lượng bài đăng

            // Sắp xếp bài đăng theo thời gian tạo (mới nhất trước)
            postIds.sort((a, b) => new Date(posts[b].createdAt) - new Date(posts[a].createdAt));

            postIds.forEach(postId => {
                userPostsContainer.appendChild(renderPost(postId, posts[postId]));
            });
        } else {
            postCount.textContent = 0;
            userPostsContainer.innerHTML = '<p>Người dùng này chưa có bài viết nào.</p>';
        }
    } catch (error) {
        console.error("Lỗi tải bài viết của người dùng:", error);
        userPostsContainer.innerHTML = '<p>Không thể tải bài viết.</p>';
    }
};


document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
    loadUserPosts();
});