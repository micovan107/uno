import { db, auth } from './config-firebase.js';
import { ref, get, push, set, serverTimestamp, update, increment, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { sendEmail } from './send-notification.js';

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('id');

    if (!postId) {
        document.body.innerHTML = "<h1>Không tìm thấy ID bài đăng.</h1>";
        return;
    }

    // Lấy các element từ DOM
    const postContentArea = document.getElementById('post-content-area');
    const mainCommentForm = document.getElementById('main-comment-form');
    const commentLoginPrompt = document.getElementById('comment-login-prompt');
    const commentsList = document.getElementById('comments-list');
    const commentCountSpan = document.getElementById('comment-count');
    const commentInputWrapper = mainCommentForm.querySelector('.comment-input-wrapper');
    const mediaPreviewContainer = document.getElementById('media-preview-container');
    const uploadMediaInput = document.getElementById('upload-media-input');
    const attachMediaLinkBtn = document.getElementById('attach-media-link-btn');

    let currentUser = null;
    const defaultUserAvatar = 'https://res.cloudinary.com/dofqagf8j/image/upload/v1714154135/default-user-avatar.png';
    let attachedMedia = []; // Mảng lưu trữ media sắp được đăng

    // --- TẢI DỮ LIỆU ---

    // Tải và hiển thị nội dung bài đăng
    const loadPost = async () => {
        const postRef = ref(db, `posts/${postId}`);
        const snapshot = await get(postRef);

        if (snapshot.exists()) {
            const post = snapshot.val();
            document.title = post.title; // Cập nhật tiêu đề trang

            let mediaHtml = '';
            if (post.imageUrl) {
                mediaHtml = `<img src="${post.imageUrl}" alt="Nội dung ảnh" class="post-body-image">`;
            } else if (post.videoUrl && post.videoUrl.includes('youtube.com/watch')) {
                const videoId = new URL(post.videoUrl).searchParams.get('v');
                mediaHtml = `<div class="youtube-video-container"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
            }

            postContentArea.innerHTML = `
                ${post.tag ? `<div class="post-tag">${post.tag}</div>` : ''}
                <h1>${post.title}</h1>
                <div class="post-meta-info">
                    Đăng bởi <a href="profile.html?uid=${post.authorId}">${post.authorName}</a>
                    trong <a href="group.html?id=${post.groupId}">${post.groupDisplayName || 'Không xác định'}</a>
                    • ${new Date(post.createdAt).toLocaleString('vi-VN')}
                </div>
                <div class="post-body">
                    <p>${post.content || ''}</p>
                    ${mediaHtml}
                </div>
                <div class="post-actions-footer">
                    <div class="reaction-summary"></div>
                    <div class="post-reactions"></div>
                </div>
            `;

            renderReactionUI(snapshot.key, postContentArea);

        } else {
            postContentArea.innerHTML = "<h1>Bài đăng không tồn tại hoặc đã bị xóa.</h1>";
        }
    };

    // Tải và xây dựng cây bình luận
    const loadComments = async () => {
        const commentsRef = ref(db, `comments/${postId}`);
        const snapshot = await get(commentsRef);

        commentsList.innerHTML = '';
        if (snapshot.exists()) {
            const allComments = [];
            snapshot.forEach(childSnapshot => {
                allComments.push({ id: childSnapshot.key, ...childSnapshot.val() });
            });

            commentCountSpan.textContent = allComments.length;

            const commentTree = buildCommentTree(allComments);

            commentTree
                .sort((a, b) => a.createdAt - b.createdAt)
                .forEach(comment => {
                    renderCommentTree(comment, commentsList);
                });
        } else {
            commentCountSpan.textContent = '0';
            commentsList.innerHTML = '<p>Chưa có bình luận nào. Hãy là người đầu tiên!</p>';
        }
    };

    const buildCommentTree = (comments) => {
        const commentMap = {};
        comments.forEach(comment => {
            commentMap[comment.id] = { ...comment, replies: [] };
        });

        const tree = [];
        comments.forEach(comment => {
            if (comment.parentId && commentMap[comment.parentId]) {
                commentMap[comment.parentId].replies.push(commentMap[comment.id]);
            } else {
                tree.push(commentMap[comment.id]);
            }
        });
        return tree;
    };

    const renderCommentTree = (comment, parentElement) => {
    const threadDiv = document.createElement('div');
    threadDiv.className = 'comment-thread';

    const itemDiv = createCommentItem(comment);
    threadDiv.appendChild(itemDiv);

    if (comment.replies && comment.replies.length > 0) {
        const repliesDiv = document.createElement('div');
        repliesDiv.className = 'replies';
        repliesDiv.style.display = 'none'; // Ẩn ban đầu

        const showRepliesBtn = document.createElement('button');
        showRepliesBtn.className = 'show-replies-btn action-btn';
        showRepliesBtn.textContent = `--- hiện ${comment.replies.length} câu trả lời ---`;
        
        threadDiv.appendChild(showRepliesBtn);
        threadDiv.appendChild(repliesDiv);

        let repliesRendered = false;
        showRepliesBtn.addEventListener('click', () => {
            const isHidden = repliesDiv.style.display === 'none';
            repliesDiv.style.display = isHidden ? 'block' : 'none';
            showRepliesBtn.textContent = isHidden ? `--- ẩn ${comment.replies.length} câu trả lời ---` : `--- hiện ${comment.replies.length} câu trả lời ---`;

            if (isHidden && !repliesRendered) {
                comment.replies
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .forEach(reply => {
                        renderCommentTree(reply, repliesDiv);
                    });
                repliesRendered = true;
            }
        });
    }

    parentElement.appendChild(threadDiv);
};

    const createCommentItem = (comment) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'comment-item';
        itemDiv.id = `comment-${comment.id}`;

        let mediaHtml = '';
        if (comment.media && comment.media.length > 0) {
            mediaHtml += '<div class="comment-media-container">';
            comment.media.forEach(item => {
                if (item.url && (item.url.includes('youtube.com/watch') || item.url.includes('youtu.be'))) {
                    let videoId = '';
                    try {
                        const urlObj = new URL(item.url);
                        if (urlObj.hostname === 'youtu.be') {
                            videoId = urlObj.pathname.slice(1);
                        } else {
                            videoId = urlObj.searchParams.get('v');
                        }
                    } catch (e) { console.error('Invalid video URL', e); }
                    
                    if (videoId) {
                        mediaHtml += `<div class="youtube-video-container"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
                    }
                } else if (item.url) {
                    mediaHtml += `<img src="${item.url}" alt="Ảnh bình luận" class="comment-image">`;
                }
            });
            mediaHtml += '</div>';
        }

        itemDiv.innerHTML = `
            <img src="${comment.authorAvatar || defaultUserAvatar}" alt="${comment.authorName}" class="comment-avatar">
            <div class="comment-content">
                <div class="comment-header">
                    <a href="profile.html?uid=${comment.authorId}" class="author-name">${comment.authorName}</a>
                    <span class="timestamp">• ${new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div class="comment-body">
                    ${comment.body || ''}
                    ${mediaHtml}
                </div>
                <div class="comment-actions">
                    <button class="reply-btn" data-comment-id="${comment.id}">Trả lời</button>
                </div>
                <div class="reply-form" id="reply-form-${comment.id}"></div>
            </div>
        `;
        
        return itemDiv;
    };

    // --- XỬ LÝ SỰ KIỆN ---

    // Gửi bình luận chính
    mainCommentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const commentText = mainCommentForm.querySelector('textarea').value.trim();
        
        // Kiểm tra xem có nội dung hoặc media không
        if (!commentText && attachedMedia.length === 0) {
            alert("Vui lòng nhập nội dung hoặc đính kèm media.");
            return;
        }

        // Lọc ra các media đã tải lên thành công
        const finalMedia = attachedMedia
            .filter(item => item.status === 'uploaded' || item.type === 'url')
            .map(item => ({ type: item.type, url: item.url }));

        const commentData = {
            body: commentText,
            media: finalMedia, // Lưu mảng media
            authorId: currentUser.uid,
            authorName: currentUser.displayName,
            authorAvatar: currentUser.photoURL,
            createdAt: serverTimestamp(),
            parentId: null
        };

        const newCommentRef = push(ref(db, `comments/${postId}`));
        await set(newCommentRef, commentData);

        // Cập nhật số lượng bình luận trên bài đăng
        const postRef = ref(db, `posts/${postId}`);
        await update(postRef, { commentCount: increment(1) });

        // Reset form và media
        mainCommentForm.reset();
        attachedMedia = [];
        renderMediaPreview();
        
        loadComments(); // Tải lại toàn bộ bình luận

        // Gửi thông báo cho tác giả bài đăng
        notifyPostAuthor(postId, currentUser, commentText);
    });

    // Xử lý khi nhấn nút "Trả lời"
    commentsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('reply-btn')) {
            if (!currentUser) {
                alert("Vui lòng đăng nhập để trả lời.");
                return;
            }
            const commentId = e.target.dataset.commentId;
            showReplyForm(commentId);
        }
    });

    // Hiển thị form trả lời
    const showReplyForm = (commentId) => {
        // Đóng tất cả các form trả lời khác
        document.querySelectorAll('.reply-form').forEach(form => form.style.display = 'none');

        const formContainer = document.getElementById(`reply-form-${commentId}`);
        formContainer.style.display = 'block';
        formContainer.innerHTML = `
            <textarea placeholder="Viết câu trả lời..."></textarea>
            <div class="reply-form-actions">
                <button class="submit-reply" data-parent-id="${commentId}">Gửi</button>
                <button class="cancel-reply" type="button">Hủy</button>
            </div>
        `;

        // Xử lý nút hủy
        formContainer.querySelector('.cancel-reply').onclick = () => {
            formContainer.style.display = 'none';
            formContainer.innerHTML = '';
        };

        // Xử lý nút gửi trả lời
        formContainer.querySelector('.submit-reply').onclick = async (e) => {
            const parentId = e.target.dataset.parentId;
            const replyText = formContainer.querySelector('textarea').value.trim();
            if (!replyText) return;

            const replyData = {
                body: replyText,
                authorId: currentUser.uid,
                authorName: currentUser.displayName,
                authorAvatar: currentUser.photoURL,
                createdAt: serverTimestamp(),
                parentId: parentId
            };

            const newCommentRef = push(ref(db, `comments/${postId}`));
            await set(newCommentRef, replyData);
            
            const postRef = ref(db, `posts/${postId}`);
            await update(postRef, { commentCount: increment(1) });

            loadComments(); // Tải lại toàn bộ cây bình luận

            // Gửi thông báo cho tác giả bài đăng
            notifyPostAuthor(postId, currentUser, replyText);
        };
    };

    // --- KHỞI TẠO ---

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            mainCommentForm.style.display = 'flex';
            commentLoginPrompt.style.display = 'none';

            // Thêm avatar người dùng vào form
            const existingAvatar = commentInputWrapper.querySelector('.comment-avatar');
            if (existingAvatar) {
                existingAvatar.remove();
            }
            const avatarImg = document.createElement('img');
            avatarImg.src = user.photoURL || defaultUserAvatar;
            avatarImg.alt = user.displayName;
            avatarImg.className = 'comment-avatar';
            commentInputWrapper.prepend(avatarImg);

            // Gắn sự kiện cho các nút chỉ một lần
            if (!mainCommentForm.dataset.eventsAttached) {
                mainCommentForm.dataset.eventsAttached = 'true';

                uploadMediaInput.addEventListener('change', handleMediaUpload);
                attachMediaLinkBtn.addEventListener('click', handleAttachLink);
            }

        } else {
            mainCommentForm.style.display = 'none';
            commentLoginPrompt.style.display = 'block';
        }
    });

    loadPost();
    loadComments();
});

// --- HÀM GỬI THÔNG BÁO CHO TÁC GIẢ BÀI ĐĂNG ---
const notifyPostAuthor = async (postId, commenter, commentContent) => {
    try {
        // 1. Lấy thông tin bài đăng để tìm authorId
        const postRef = ref(db, `posts/${postId}`);
        const postSnapshot = await get(postRef);
        if (!postSnapshot.exists()) return;

        const postData = postSnapshot.val();
        const authorId = postData.authorId;

        // Không gửi thông báo nếu người bình luận là tác giả
        if (commenter.uid === authorId) return;

        // 2. Lấy thông tin chi tiết và trạng thái của tác giả
        const authorRef = ref(db, `users/${authorId}`);
        const authorStatusRef = ref(db, `status/${authorId}`);

        const [authorSnapshot, authorStatusSnapshot] = await Promise.all([
            get(authorRef),
            get(authorStatusRef)
        ]);

        if (!authorSnapshot.exists()) return;

        const authorData = authorSnapshot.val();
        const authorStatus = authorStatusSnapshot.val();

        // 3. Kiểm tra nếu tác giả offline và có email thì gửi thông báo
        if (authorStatus && authorStatus.state === 'offline' && authorData.email) {
            const postUrl = `${window.location.origin}/post.html?id=${postId}`;
            const subject = `${commenter.displayName} đã bình luận về bài đăng của bạn`;
            const htmlContent = `
                <p>Chào ${authorData.displayName},</p>
                <p><b>${commenter.displayName}</b> đã để lại một bình luận mới trong bài đăng "<a href="${postUrl}">${postData.title}</a>" của bạn:</p>
                <blockquote style="border-left: 4px solid #ccc; padding-left: 1em; margin-left: 1em;">
                    ${commentContent}
                </blockquote>
                <p>Bạn có thể xem bình luận và trả lời tại đây: <a href="${postUrl}">${postUrl}</a></p>
                <p>Trân trọng,<br>Đội ngũ Vex</p>
            `;

            await sendEmail(authorData.email, authorData.displayName, subject, htmlContent);
        }
    } catch (error) {
        console.error("Lỗi khi gửi thông báo cho tác giả:", error);
    }
};

// --- CẤU HÌNH CLOUDINARY ---
const CLOUDINARY_CLOUD_NAME = "dw8rpacnn";
const CLOUDINARY_UPLOAD_PRESET = "nguyentiennam";
// --------------------------

// --- MEDIA HANDLING FUNCTIONS ---

// Hàm upload ảnh lên Cloudinary
const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (data.secure_url) {
            return data.secure_url;
        } else {
            throw new Error('Không thể upload ảnh lên Cloudinary.');
        }
    } catch (error) {
        console.error("Lỗi Cloudinary:", error);
        throw error;
    }
};

// Xử lý khi nhấn nút đính kèm link
const handleAttachLink = () => {
    const url = prompt("Nhập URL của ảnh hoặc video (YouTube):");
    if (url) {
        const mediaItem = { type: 'url', url: url, status: 'uploaded' }; // Trạng thái là uploaded luôn
        attachedMedia.push(mediaItem);
        renderMediaPreview();
    }
};

// Xử lý khi người dùng chọn file
const handleMediaUpload = (event) => {
    const files = event.target.files;
    if (!files.length) return;

    for (const file of files) {
        if (file.type.startsWith('image/')) {
            uploadFileAndRenderPreview(file);
        } else {
            alert("Chỉ hỗ trợ tải lên tệp hình ảnh.");
        }
    }
    event.target.value = '';
};

// Tải file lên và hiển thị preview
const uploadFileAndRenderPreview = async (file) => {
    const fileId = `media_${Date.now()}_${file.name}`;
    const mediaItem = {
        id: fileId,
        type: 'image',
        file: file,
        status: 'uploading', // Bắt đầu với trạng thái uploading
        url: null
    };
    attachedMedia.push(mediaItem);
    renderMediaPreview(); // Hiển thị preview với trạng thái loading

    try {
        const downloadURL = await uploadToCloudinary(file);
        const itemToUpdate = attachedMedia.find(item => item.id === fileId);
        if (itemToUpdate) {
            itemToUpdate.status = 'uploaded';
            itemToUpdate.url = downloadURL;
        }
    } catch (error) {
        console.error("Lỗi tải lên:", error);
        const itemToUpdate = attachedMedia.find(item => item.id === fileId);
        if (itemToUpdate) {
            itemToUpdate.status = 'error';
        }
    } finally {
        renderMediaPreview(); // Cập nhật lại UI sau khi upload xong hoặc lỗi
    }
};

// Render các bản xem trước media
const renderMediaPreview = () => {
    mediaPreviewContainer.innerHTML = '';
    attachedMedia.forEach((item, index) => {
        const previewItemDiv = document.createElement('div');
        previewItemDiv.className = 'media-preview-item';
        previewItemDiv.id = item.id || `media_url_${index}`;

        let previewContent = '';
        if (item.type === 'image') {
            const localUrl = URL.createObjectURL(item.file);
            previewContent = `<img src="${localUrl}" alt="Xem trước">`;
        } else if (item.type === 'url') {
            previewContent = `<div class="url-preview">🔗</div>`;
        }

        let statusIndicator = '';
        if (item.status === 'uploading') {
            statusIndicator = `<div class="upload-status">Đang tải...</div>`;
        } else if (item.status === 'error') {
            statusIndicator = `<div class="upload-status error">Lỗi</div>`;
        }

        previewItemDiv.innerHTML = `
            ${previewContent}
            <button class="remove-media-btn" data-index="${index}">×</button>
            ${statusIndicator}
        `;

        mediaPreviewContainer.appendChild(previewItemDiv);
    });

    // Gắn sự kiện cho các nút xóa
    document.querySelectorAll('.remove-media-btn').forEach(btn => {
        btn.onclick = (e) => {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            // TODO: Nếu cần, thêm logic hủy upload trên Cloudinary nếu đang diễn ra
            attachedMedia.splice(indexToRemove, 1);
            renderMediaPreview();
        };
    });
};


// --- REACTION FUNCTIONS ---
const reactionEmojis = {
    like: '👍',
    love: '❤️',
    haha: '😂',
    wow: '😮',
    sad: '😢',
    angry: '😡'
};

// Render giao diện reaction
const renderReactionUI = async (postId, postElement) => {
    const reactionsContainer = postElement.querySelector('.post-reactions');
    const summaryContainer = postElement.querySelector('.reaction-summary');
    if (!reactionsContainer || !summaryContainer) return;

    // 1. Lấy dữ liệu reaction mới nhất
    const postRef = ref(db, `posts/${postId}`);
    const postSnap = await get(postRef);
    const postData = postSnap.exists() ? postSnap.val() : {};
    const reactionCounts = postData.reactionCounts || {};
    const userReactions = postData.reactions || {};

    // 2. Render summary (icons + count)
    summaryContainer.innerHTML = '';
    let totalReactions = 0;
    const sortedReactions = Object.entries(reactionCounts)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    const summaryIcons = document.createElement('div');
    summaryIcons.className = 'summary-icons';
    sortedReactions.slice(0, 3).forEach(([type, _]) => {
        const icon = document.createElement('span');
        icon.className = 'summary-icon';
        icon.textContent = reactionEmojis[type];
        summaryIcons.appendChild(icon);
    });
    summaryContainer.appendChild(summaryIcons);

    totalReactions = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
    if (totalReactions > 0) {
        const countSpan = document.createElement('span');
        countSpan.className = 'summary-count';
        countSpan.textContent = totalReactions;
        summaryContainer.appendChild(countSpan);
    }

    // 3. Render nút reaction chính và popup
    const reactionButton = document.createElement('button');
    reactionButton.className = 'action-btn like-btn';
    reactionButton.innerHTML = '👍 Thích';
    
    // Cập nhật nút nếu user đã react
    if (auth.currentUser && userReactions[auth.currentUser.uid]) {
        const reactionType = userReactions[auth.currentUser.uid];
        reactionButton.innerHTML = `${reactionEmojis[reactionType]} ${reactionType.charAt(0).toUpperCase() + reactionType.slice(1)}`;
        reactionButton.classList.add('reacted');
    }
    reactionButton.onclick = () => handleReaction(postId, 'like', auth.currentUser?.uid);

    const popup = document.createElement('div');
    popup.className = 'reaction-popup';
    Object.keys(reactionEmojis).forEach(type => {
        const icon = document.createElement('span');
        icon.className = 'reaction-icon';
        icon.dataset.type = type;
        icon.textContent = reactionEmojis[type];
        icon.onclick = () => {
            if (!auth.currentUser) {
                alert('Vui lòng đăng nhập để thả cảm xúc!');
                return;
            }
            handleReaction(postId, type, auth.currentUser.uid);
            popup.style.display = 'none'; // Ẩn popup sau khi chọn
        };
        popup.appendChild(icon);
    });

    const reactionWrapper = document.createElement('div');
    reactionWrapper.className = 'reaction-container';
    reactionWrapper.appendChild(reactionButton);
    reactionWrapper.appendChild(popup);
    
    reactionsContainer.innerHTML = '';
    reactionsContainer.appendChild(reactionWrapper);
};

// Xử lý khi người dùng thả reaction
const handleReaction = async (postId, reactionType, userId) => {
    if (!userId) {
        alert("Vui lòng đăng nhập để thả cảm xúc!");
        return;
    }
    const postRef = ref(db, `posts/${postId}`);

    await runTransaction(postRef, (post) => {
        if (post) {
            if (!post.reactions) post.reactions = {};
            if (!post.reactionCounts) post.reactionCounts = {};

            const oldReaction = post.reactions[userId];
            const isUnreacting = oldReaction === reactionType;

            // Cập nhật reactionCounts
            if (oldReaction) {
                post.reactionCounts[oldReaction] = (post.reactionCounts[oldReaction] || 1) - 1;
            }
            if (!isUnreacting) {
                post.reactionCounts[reactionType] = (post.reactionCounts[reactionType] || 0) + 1;
            }

            // Cập nhật reaction của user
            if (isUnreacting) {
                delete post.reactions[userId];
            } else {
                post.reactions[userId] = reactionType;
            }
        }
        return post;
    });

    // Tải lại UI sau khi reaction
    const postElement = document.getElementById('post-content-area');
    if (postElement) {
        await renderReactionUI(postId, postElement);
    }
};