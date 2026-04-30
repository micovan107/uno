import { db, auth } from './config-firebase.js';
import { ref, get, set, update, query, orderByChild, equalTo, runTransaction, serverTimestamp, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { sendEmail } from './send-notification.js';

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('group-page-active'); // Thêm class để xác định trang nhóm

    // Ẩn header chính của trang web khi vào trang nhóm
    const mainHeader = document.getElementById('main-header');
    if (mainHeader) {
        mainHeader.style.display = 'none';
    }

    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('id');

    if (!groupId) {
        document.body.innerHTML = "<h1>Không tìm thấy ID của nhóm.</h1>";
        return;
    }

    // Lấy các element từ DOM
    const groupHeader = document.getElementById('group-header');
    const groupPostsContainer = document.getElementById('group-posts');
    const tagList = document.getElementById('tag-list');
    const memberList = document.getElementById('member-list');

    let currentUser = null;
    let currentGroupData = null;
    let allPosts = []; // Lưu trữ tất cả bài đăng để lọc
    let memberRolesMap = {}; // Cache để lưu vai trò thành viên
    const defaultAvatar = 'https://res.cloudinary.com/dofqagf8j/image/upload/v1714154135/default-group-avatar.png';
    const defaultUserAvatar = 'https://res.cloudinary.com/dofqagf8j/image/upload/v1714154135/default-user-avatar.png';

    // --- BIẾN ICON ---
    const shareIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
    const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;


    // --- RENDER FUNCTIONS ---

    // Render header của nhóm
    const renderGroupHeader = (groupData, user, isMember, isCreator) => {
        const groupAvatar = groupData.avatarUrl || defaultAvatar;

        // Logic để tạo các nút hành động
        let actionsHtml = '';
        if (user) {
            // Nút mời thành viên được tách ra để tái sử dụng
            const inviteButtonHtml = `<button id="invite-member-btn" class="action-button secondary icon-button" title="Mời thành viên">${shareIconSvg}</button>`;

            if (isCreator) {
                actionsHtml = `
                    ${inviteButtonHtml}
                    <a href="/manage-group.html?id=${groupId}" class="action-button secondary">Quản lý</a>
                `;
            } else if (isMember) {
                actionsHtml = `
                    ${inviteButtonHtml}
                    <button id="leave-group-btn" class="action-button secondary">Rời Nhóm</button>
                `;
            } else {
                actionsHtml = `<button id="join-group-btn" class="action-button primary">Tham Gia Nhóm</button>`;
            }
        } else {
            actionsHtml = `<a href="/login.html" class="action-button primary">Đăng Nhập</a>`;
        }

        groupHeader.innerHTML = `
            <div class="group-header-content">
                <div class="group-info">
                    <img src="${groupAvatar}" alt="Avatar nhóm" class="group-avatar">
                    <div class="group-info-details">
                        <div class="group-name-and-home">
                            <h2 id="group-name">${groupData.displayName}</h2>
                            <a href="/" class="action-button secondary home-link-button">Trang chủ</a>
                        </div>
                        <p id="group-description">${groupData.description}</p>
                    </div>
                </div>
                <div class="group-actions-and-search">
                    <div class="group-search">
                        <input type="search" id="post-search-input" placeholder="Tìm kiếm trong nhóm...">
                    </div>
                    <div id="group-actions" class="group-actions">
                        ${actionsHtml}
                    </div>
                </div>
            </div>
        `;

        // Thêm event listener cho các nút vừa tạo
        const joinBtn = document.getElementById('join-group-btn');
        if (joinBtn) joinBtn.onclick = handleJoinGroup;

        const leaveBtn = document.getElementById('leave-group-btn');
        if (leaveBtn) leaveBtn.onclick = handleLeaveGroup;

        const inviteBtn = document.getElementById('invite-member-btn');
        if (inviteBtn) inviteBtn.onclick = handleInvite;

        const searchInput = document.getElementById('post-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }
    };

    // Render form tạo bài đăng
    const renderCreatePostForm = (user) => {
        const container = document.getElementById('create-post-form-container');
        if (!container) return;

        if (!user) {
            container.innerHTML = '<p class="login-prompt">Vui lòng <a href="/login.html">đăng nhập</a> để đăng bài.</p>';
            return;
        }

        container.innerHTML = `
            <div class="create-post-form">
                <img src="${user.photoURL || defaultUserAvatar}" alt="Avatar của bạn" class="user-avatar">
                <div class="form-content">
                    <input type="text" id="post-title-input" placeholder="Bạn đang nghĩ gì?">
                    <div class="form-actions">
                         <a href="/create-post.html?group=${groupId}" class="action-button primary">Tạo bài viết</a>
                    </div>
                </div>
            </div>
        `;
    };

    // Hàm xử lý tìm kiếm bài đăng
    const handleSearch = (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const currentActiveTag = tagList.querySelector('li.active')?.dataset.tag || 'all';

        let postsToFilter = allPosts;
        // Nếu không phải là "Tất cả", lọc theo tag trước
        if (currentActiveTag !== 'all') {
            postsToFilter = allPosts.filter(p => p.tag === currentActiveTag);
        }

        if (!searchTerm) {
            renderPosts(postsToFilter); // Nếu không có từ khóa, hiển thị lại bài theo tag
            return;
        }

        const filteredPosts = postsToFilter.filter(post => {
            const title = post.title?.toLowerCase() || '';
            const content = post.content?.toLowerCase() || '';
            const author = post.authorName?.toLowerCase() || '';
            return title.includes(searchTerm) || content.includes(searchTerm) || author.includes(searchTerm);
        });

        renderPosts(filteredPosts);
    };


    // Hàm xử lý mời thành viên
    const handleInvite = async (e) => {
        const button = e.currentTarget;
        if (!button) return;

        const inviteUrl = window.location.href;
        const success = await copyTextToClipboard(inviteUrl);

        if (success) {
            button.innerHTML = checkIconSvg;
            button.disabled = true;
            setTimeout(() => {
                button.innerHTML = shareIconSvg;
                button.disabled = false;
            }, 2000);
        } else {
            alert('Không thể tự động sao chép. Vui lòng sao chép link trên thanh địa chỉ của bạn.');
        }
    };

    // Hàm sao chép văn bản vào clipboard (hỗ trợ cả API mới và cũ)
    async function copyTextToClipboard(text) {
        // Thử API Clipboard hiện đại trước (yêu cầu môi trường an toàn)
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('Lỗi Clipboard API (hiện đại), đang thử phương pháp cũ...', err);
            }
        }

        // Phương pháp dự phòng (legacy) cho các môi trường không an toàn
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (err) {
            console.error('Lỗi khi sao chép bằng phương pháp cũ (execCommand)', err);
            document.body.removeChild(textArea);
            return false;
        }
    }

    // --- REACTION FUNCTIONS ---
    const reactionEmojis = {
        like: '👍',
        love: '❤️',
        haha: '😂',
        wow: '😮',
        sad: '😢',
        angry: '😠'
    };

    const loadAndRenderReactions = async (postId) => {
        const summaryContainer = document.getElementById(`reaction-summary-${postId}`);
        const reactBtn = document.querySelector(`.react-btn[data-post-id="${postId}"]`);
        if (!summaryContainer || !reactBtn) return;

        const postRef = ref(db, `posts/${postId}`);
        const postSnap = await get(postRef);
        const reactionCounts = postSnap.exists() ? postSnap.val().reactionCounts : {};

        summaryContainer.innerHTML = '';
        let totalReactions = 0;

        if (reactionCounts) {
            const sortedReactions = Object.entries(reactionCounts)
                .filter(([_, count]) => count > 0)
                .sort((a, b) => b[1] - a[1]);

            sortedReactions.slice(0, 3).forEach(([type, _]) => {
                const icon = document.createElement('span');
                icon.className = 'summary-icon';
                icon.textContent = reactionEmojis[type];
                summaryContainer.appendChild(icon);
            });

            totalReactions = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
            
            if (totalReactions > 0) {
                const countSpan = document.createElement('span');
                countSpan.className = 'summary-count';
                countSpan.textContent = totalReactions;
                summaryContainer.appendChild(countSpan);
            }
        }

        // Cập nhật nút "Thích" nếu user đã react
        if (currentUser) {
            const userReactionRef = ref(db, `reactions/${postId}/${currentUser.uid}`);
            const userReactionSnap = await get(userReactionRef);
            if (userReactionSnap.exists()) {
                const reactionType = userReactionSnap.val().type;
                reactBtn.innerHTML = `${reactionEmojis[reactionType]} ${reactionType.charAt(0).toUpperCase() + reactionType.slice(1)}`;
                reactBtn.classList.add('reacted'); 
            } else {
                reactBtn.innerHTML = `👍 Thích`;
                reactBtn.classList.remove('reacted');
            }
        }
    };

    const handleReaction = async (postId, reactionType) => {
        if (!currentUser) {
            alert("Vui lòng đăng nhập để thả cảm xúc!");
            return;
        }

        const userId = currentUser.uid;
        const reactionRef = ref(db, `reactions/${postId}/${userId}`);
        const reactionCountsRef = ref(db, `posts/${postId}/reactionCounts`);

        const oldReactionSnap = await get(reactionRef);
        const oldReactionType = oldReactionSnap.exists() ? oldReactionSnap.val().type : null;

        const isUnreacting = oldReactionType === reactionType;

        // Transaction để cập nhật số lượng một cách an toàn
        await runTransaction(reactionCountsRef, (currentCounts) => {
            if (!currentCounts) {
                currentCounts = {};
            }
            // Giảm count của reaction cũ nếu có
            if (oldReactionType) {
                currentCounts[oldReactionType] = (currentCounts[oldReactionType] || 1) - 1;
            }
            // Nếu không phải là bỏ reaction, tăng count của reaction mới
            if (!isUnreacting) {
                currentCounts[reactionType] = (currentCounts[reactionType] || 0) + 1;
            }
            return currentCounts;
        });

        // Lưu/xóa reaction của user
        if (isUnreacting) {
            await set(reactionRef, null);
        } else {
            await set(reactionRef, { type: reactionType });
        }

        // Cập nhật UI ngay lập tức
        loadAndRenderReactions(postId);
    };

    // Render danh sách bài đăng
    const renderPosts = (postsToRender) => {
        groupPostsContainer.innerHTML = '';
        if (postsToRender.length === 0) {
            groupPostsContainer.innerHTML = '<p>Không có bài viết nào phù hợp.</p>';
            return;
        }
        postsToRender.forEach(post => {
            const postElement = document.createElement('article');
            postElement.className = 'post-item';
            postElement.dataset.postId = post.id; // Thêm post-id vào article
            
            let mediaHtml = '';
            if (post.imageUrl) {
                mediaHtml = `<img src="${post.imageUrl}" alt="Nội dung ảnh" class="post-image">`;
            } else if (post.videoUrl && post.videoUrl.includes('youtube.com/watch')) {
                const videoId = new URL(post.videoUrl).searchParams.get('v');
                mediaHtml = `<div class="youtube-video-container"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
            }

            postElement.innerHTML = `
                <div class="post-header-info">
                    <img src="${post.authorAvatar || defaultUserAvatar}" alt="${post.authorName}">
                    <div>
                        <a href="profile.html?uid=${post.authorId}" class="post-author">${post.authorName}</a>
                        ${post.authorRole && post.authorRole !== 'Thành viên' ? `<span class="author-role-label" style="background-color: ${post.authorRoleColor}; color: white;">${post.authorRole}</span>` : ''}
                        <p class="post-timestamp">${new Date(post.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    ${post.tag ? `<div class="post-tag">${post.tag}</div>` : ''}
                </div>
                <h3><a href="post.html?id=${post.id}">${post.title}</a></h3>
                <div class="post-content-body">
                    ${mediaHtml}
                    <p>${post.content || ''}</p>
                </div>
                <div class="post-footer">
                    <div class="post-stats">
                        <div class="reaction-summary" id="reaction-summary-${post.id}"></div>
                        <span class="comment-count-display" id="comment-count-${post.id}">💬 ${post.commentCount || 0}</span>
                    </div>
                    <div class="post-actions">
                        <div class="reaction-container">
                            <button class="action-btn react-btn" data-post-id="${post.id}">👍 Thích</button>
                            <div class="reaction-popup">
                                ${Object.entries(reactionEmojis).map(([type, emoji]) => 
                                    `<span class="reaction-icon" data-reaction="${type}">${emoji}</span>`
                                ).join('')}
                            </div>
                        </div>
                        <button class="action-btn toggle-comments-btn" data-post-id="${post.id}">Bình luận</button>
                    </div>
                </div>
                <div class="comments-section" id="comments-section-${post.id}" style="display: none;"></div>
            `;
            groupPostsContainer.appendChild(postElement);
        });

        // Gắn sự kiện sau khi tất cả các bài đăng đã được thêm vào DOM
        attachPostEventListeners();

        // Tải và hiển thị reaction cho mỗi bài
        postsToRender.forEach(post => {
            loadAndRenderReactions(post.id);
        });
    };

    // Gắn các event listener cho các nút của bài đăng
    const attachPostEventListeners = () => {
        document.querySelectorAll('.toggle-comments-btn').forEach(button => {
            // Xóa listener cũ để tránh gắn nhiều lần
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', (e) => {
                const postId = e.target.dataset.postId;
                toggleComments(postId);
            });
        });

        document.querySelectorAll('.reaction-icon').forEach(icon => {
            const newIcon = icon.cloneNode(true);
            icon.parentNode.replaceChild(newIcon, icon);
            newIcon.addEventListener('click', (e) => {
                const reactionType = e.target.dataset.reaction;
                const postId = e.target.closest('.post-item').dataset.postId;
                handleReaction(postId, reactionType);
                // Đóng popup sau khi chọn
                e.target.closest('.reaction-popup').style.display = 'none';
            });
        });
        
        document.querySelectorAll('.react-btn').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', (e) => {
                const postId = e.target.dataset.postId;
                // Mặc định là 'like' khi nhấn nút chính
                handleReaction(postId, 'like');
            });
        });
    };



    // Hiển thị/ẩn và tải bình luận
    const toggleComments = async (postId) => {
        const commentsSection = document.getElementById(`comments-section-${postId}`);
        if (!commentsSection) return;

        const isVisible = commentsSection.style.display === 'block';

        if (isVisible) {
            commentsSection.style.display = 'none';
        } else {
            commentsSection.style.display = 'block';
            commentsSection.innerHTML = '<p class="loading-text">Đang tải bình luận...</p>';
            await loadAndRenderComments(postId);
        }
    };

    // Tải và render bình luận cho một bài đăng
    const loadAndRenderComments = async (postId) => {
        const commentsSection = document.getElementById(`comments-section-${postId}`);
        if (!commentsSection) return;

        // Xóa nội dung cũ (ví dụ: "Đang tải...")
        commentsSection.innerHTML = '';

        // Luôn hiển thị form để bình luận chính (ở đầu)
        const mainCommentFormContainer = document.createElement('div');
        mainCommentFormContainer.className = 'comment-form-container main-comment-form';
        commentsSection.appendChild(mainCommentFormContainer);
        renderCommentForm(postId, null, mainCommentFormContainer);

        // Tạo container cho danh sách bình luận
        const commentListElement = document.createElement('div');
        commentListElement.className = 'comment-list';
        commentsSection.appendChild(commentListElement);

        const commentsRef = ref(db, `comments/${postId}`);
        const snapshot = await get(commentsRef);

        if (!snapshot.exists()) {
            commentListElement.innerHTML = '<p>Chưa có bình luận nào.</p>';
        } else {
            const allComments = snapshot.val();
            const commentList = Object.keys(allComments).map(id => ({ id, ...allComments[id] }));

            // Xây dựng cây bình luận
            const commentTree = {};
            const rootComments = [];
            commentList.forEach(comment => {
                if (comment.parentId) {
                    if (!commentTree[comment.parentId]) {
                        commentTree[comment.parentId] = [];
                    }
                    commentTree[comment.parentId].push(comment);
                } else {
                    rootComments.push(comment);
                }
            });

            // Sắp xếp bình luận gốc và con theo thời gian
            rootComments.sort((a, b) => a.createdAt - b.createdAt);
            for (const parentId in commentTree) {
                commentTree[parentId].sort((a, b) => a.createdAt - b.createdAt);
            }

            // Render cây
            rootComments.forEach(comment => {
                renderCommentTree(comment, commentTree, 0, commentListElement, postId);
            });
        }
    };


    // Render cây bình luận (đệ quy)
    const renderCommentTree = (comment, tree, depth, parentElement, postId) => {
        const threadDiv = document.createElement('div');
        threadDiv.className = 'comment-thread';
        
        const commentItem = createCommentItem(comment, postId); // Truyền postId vào
        threadDiv.appendChild(commentItem);

        const replies = tree[comment.id];
        if (replies && replies.length > 0) {
            const repliesDiv = document.createElement('div');
            repliesDiv.className = 'replies';
            repliesDiv.style.display = 'none'; // Ẩn ban đầu

            const showRepliesBtn = document.createElement('button');
            showRepliesBtn.className = 'show-replies-btn action-btn';
            showRepliesBtn.textContent = `--- hiện ${replies.length} câu trả lời ---`;
            
            threadDiv.appendChild(showRepliesBtn);
            threadDiv.appendChild(repliesDiv);

            let repliesRendered = false;
            showRepliesBtn.addEventListener('click', () => {
                const isHidden = repliesDiv.style.display === 'none';
                repliesDiv.style.display = isHidden ? 'block' : 'none';
                showRepliesBtn.textContent = isHidden ? `--- ẩn ${replies.length} câu trả lời ---` : `--- hiện ${replies.length} câu trả lời ---`;

                if (isHidden && !repliesRendered) {
                    replies.forEach(reply => renderCommentTree(reply, tree, depth + 1, repliesDiv, postId));
                    repliesRendered = true;
                }
            });
        }

        parentElement.appendChild(threadDiv);
    };

    // Tạo HTML cho một mục bình luận
    const createCommentItem = (comment, postId) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'comment-item';
        itemDiv.id = `comment-${comment.id}`;

        itemDiv.innerHTML = `
            <img src="${comment.authorAvatar || defaultUserAvatar}" alt="${comment.authorName}" class="comment-avatar">
            <div class="comment-content">
                <div class="comment-header">
                    <a href="profile.html?uid=${comment.authorId}" class="author-name">${comment.authorName}</a>
                    <span class="timestamp">• ${new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div class="comment-body-and-actions">
                    <div class="comment-body">
                        <p>${comment.body || ''}</p>
                    </div>
                    <div class="comment-actions">
                        <button class="reply-btn" data-comment-id="${comment.id}" data-post-id="${postId}">Trả lời</button>
                    </div>
                </div>
                <div class="reply-form-container" id="reply-form-for-${comment.id}"></div>
            </div>
        `;

        // Gắn sự kiện cho nút "Trả lời"
        itemDiv.querySelector('.reply-btn').addEventListener('click', (e) => {
            const commentId = e.target.dataset.commentId;
            const formContainer = document.getElementById(`reply-form-for-${commentId}`);
            
            // Đóng các form khác và mở form này
            document.querySelectorAll('.reply-form-container').forEach(c => c.innerHTML = '');
            renderCommentForm(postId, commentId, formContainer);
        });

        return itemDiv;
    };

    // Render form để viết bình luận (cho cả bình luận chính và trả lời)
    const renderCommentForm = (postId, parentId, containerElement) => {
        // Kiểm tra xem người dùng đã đăng nhập chưa
        if (!currentUser) {
            containerElement.innerHTML = '<p>Vui lòng <a href="/login.html">đăng nhập</a> để bình luận.</p>';
            return;
        }

        containerElement.innerHTML = `
            <div class="comment-form">
                <img src="${currentUser.photoURL || defaultUserAvatar}" alt="Avatar của bạn" class="comment-avatar">
                <div class="comment-input-area">
                    <textarea placeholder="Viết bình luận..."></textarea>
                    <div class="comment-form-actions">
                        <button class="submit-comment-btn">Gửi</button>
                        ${parentId ? '<button class="cancel-reply-btn" type="button">Hủy</button>' : ''}
                    </div>
                </div>
            </div>
        `;

        const textarea = containerElement.querySelector('textarea');
        const submitBtn = containerElement.querySelector('.submit-comment-btn');
        const cancelBtn = containerElement.querySelector('.cancel-reply-btn');

        submitBtn.addEventListener('click', async () => {
            const commentText = textarea.value.trim();
            if (!commentText) {
                alert("Vui lòng nhập nội dung bình luận.");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang gửi...';

            try {
                const commentData = {
                    postId: postId,
                    body: commentText,
                    authorId: currentUser.uid,
                    authorName: currentUser.displayName,
                    authorAvatar: currentUser.photoURL,
                    createdAt: serverTimestamp(),
                    parentId: parentId || null,
                };

                const newCommentRef = push(ref(db, `comments/${postId}`));
                await set(newCommentRef, commentData);

                // Cập nhật số lượng bình luận trên bài đăng
                const postRef = ref(db, `posts/${postId}`);
                await runTransaction(postRef, (post) => {
                    if (post) {
                        post.commentCount = (post.commentCount || 0) + 1;
                    }
                    return post;
                });

                // Tải lại bình luận cho bài đăng này
                loadAndRenderComments(postId);

            } catch (error) {
                console.error("Lỗi khi gửi bình luận:", error);
                alert("Đã xảy ra lỗi khi gửi bình luận của bạn.");
            } finally {
                // Không cần bật lại nút vì toàn bộ khu vực bình luận sẽ được vẽ lại
            }
        });

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                containerElement.innerHTML = ''; // Xóa form
            });
        }
    };




    // Render danh sách nhãn và xử lý filter
    const renderTags = (posts) => {
        const tags = [...new Set(posts.map(p => p.tag).filter(Boolean))]; // Lấy các nhãn duy nhất
        tagList.innerHTML = `<li class="active" data-tag="all">Tất cả</li>`; // Nút xem tất cả
        tags.forEach(tag => {
            const li = document.createElement('li');
            li.textContent = tag;
            li.dataset.tag = tag;
            tagList.appendChild(li);
        });

        // Thêm sự kiện click để lọc
        tagList.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                const selectedTag = e.target.dataset.tag;
                // Bỏ active ở tất cả các li khác
                tagList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                // Thêm active cho li được click
                e.target.classList.add('active');

                if (selectedTag === 'all') {
                    renderPosts(allPosts);
                } else {
                    const filteredPosts = allPosts.filter(p => p.tag === selectedTag);
                    renderPosts(filteredPosts);
                }
            }
        });
    };

    // Render danh sách thành viên
    const renderMembers = async () => {
        memberList.innerHTML = '<li>Đang tải...</li>';
        
        const membersRef = ref(db, `groups/${groupId}/members`);
        const labelsRef = ref(db, `groups/${groupId}/labels`);
        
        const [membersSnapshot, labelsSnapshot] = await Promise.all([get(membersRef), get(labelsRef)]);
        
        memberList.innerHTML = '';

        if (membersSnapshot.exists()) {
            const members = membersSnapshot.val();
            const memberIds = Object.keys(members);

            const customLabels = labelsSnapshot.exists() ? labelsSnapshot.val() : {};
            const labelColors = {
                'Trưởng nhóm': '#dc3545',
                'Phó nhóm': '#fd7e14',
                ...Object.fromEntries(Object.values(customLabels).map(l => [l.name, l.color]))
            };

            const memberPromises = memberIds.map(uid => get(ref(db, `users/${uid}`)));
            const memberSnapshots = await Promise.all(memberPromises);

            memberSnapshots.forEach(userSnapshot => {
                if (userSnapshot.exists()) {
                    const memberData = userSnapshot.val();
                    const memberRole = members[userSnapshot.key]?.role || 'Thành viên';
                    const roleColor = labelColors[memberRole] || '#6c757d';

                    const li = document.createElement('li');
                    li.innerHTML = `
                        <img src="${memberData.photoURL || defaultUserAvatar}" alt="${memberData.displayName}" class="member-avatar">
                        <div class="member-details">
                            <a href="profile.html?uid=${userSnapshot.key}" class="member-name">${memberData.displayName}</a>
                            ${memberRole !== 'Thành viên' ? `<span class="member-role-label" style="background-color: ${roleColor}; color: white;">${memberRole}</span>` : ''}
                        </div>
                    `;
                    memberList.appendChild(li);
                }
            });
        } else {
            memberList.innerHTML = '<li>Chưa có thành viên nào.</li>';
        }
    };



    // --- DATA LOADING & MAIN LOGIC ---

    // Hàm tải và hiển thị bài viết của nhóm
    const loadGroupPosts = async () => {
        try {
            const postsQuery = query(ref(db, 'posts'), orderByChild('groupId'), equalTo(groupId));
            const snapshot = await get(postsQuery);

            if (snapshot.exists()) {
                const postsData = snapshot.val();
                const postPromises = Object.keys(postsData).map(async (postId) => {
                    const post = postsData[postId];
                    post.id = postId; // Gán ID cho bài viết

                    // Lấy thông tin tác giả
                    const authorRef = ref(db, `users/${post.authorId}`);
                    const authorSnap = await get(authorRef);
                    if (authorSnap.exists()) {
                        post.authorName = authorSnap.val().displayName;
                        post.authorAvatar = authorSnap.val().photoURL;
                    }

                    // Lấy vai trò của tác giả trong nhóm (nếu có)
                    const authorRoleData = memberRolesMap[post.authorId];
                    if (authorRoleData) {
                        post.authorRole = authorRoleData.role;
                        post.authorRoleColor = authorRoleData.color;
                    }
                    
                    return post;
                });

                allPosts = (await Promise.all(postPromises)).sort((a, b) => b.createdAt - a.createdAt);
                
                renderPosts(allPosts);
                renderTags(allPosts);
            } else {
                groupPostsContainer.innerHTML = '<p>Chưa có bài viết nào trong nhóm này.</p>';
                renderTags([]); // Vẫn render để có nút "Tất cả"
            }
        } catch (error) {
            console.error("Lỗi khi tải bài viết của nhóm:", error);
            groupPostsContainer.innerHTML = '<p>Đã xảy ra lỗi khi tải bài viết.</p>';
        }
    };

    // Hàm cache vai trò thành viên để sử dụng khi tải bài viết
    const cacheMemberRoles = async () => {
        const membersRef = ref(db, `groups/${groupId}/members`);
        const labelsRef = ref(db, `groups/${groupId}/labels`);
        
        const [membersSnapshot, labelsSnapshot] = await Promise.all([get(membersRef), get(labelsRef)]);

        const customLabels = labelsSnapshot.exists() ? labelsSnapshot.val() : {};
        const labelColors = {
            'Trưởng nhóm': '#dc3545',
            'Phó nhóm': '#fd7e14',
            ...Object.fromEntries(Object.values(customLabels).map(l => [l.name, l.color]))
        };

        if (membersSnapshot.exists()) {
            const members = membersSnapshot.val();
            for (const userId in members) {
                const roleName = (typeof members[userId] === 'object' && members[userId].role) ? members[userId].role : 'Thành viên';
                memberRolesMap[userId] = {
                    role: roleName,
                    color: labelColors[roleName] || '#6c757d'
                };
            }
        }
    };

    // Hàm chính để khởi tạo trang
    const initializePage = async (user) => {
        const groupRef = ref(db, `groups/${groupId}`);
        try {
            const snapshot = await get(groupRef);
            if (snapshot.exists()) {
                currentGroupData = snapshot.val();
                
                // Cache vai trò thành viên trước khi tải bài viết
                await cacheMemberRoles();

                let isMember = false;
                let isCreator = false;
                if (user) {
                    isCreator = currentGroupData.creatorId === user.uid;
                    isMember = isCreator || (currentGroupData.members && !!currentGroupData.members[user.uid]);
                }

                renderGroupHeader(currentGroupData, user, isMember, isCreator);
                renderMembers();
                
                // Điều kiện để xem nội dung và đăng bài: nhóm công khai, hoặc là thành viên của nhóm riêng tư.
                const hasAccess = !(currentGroupData.privacy === 'private' && !isMember);

                if (hasAccess) {
                    renderCreatePostForm(user); // Hiển thị form tạo bài đăng
                    loadGroupPosts(); // Tải bài viết
                } else {
                    // Nếu không có quyền truy cập, hiển thị thông báo và xóa form tạo bài đăng
                    groupPostsContainer.innerHTML = '<div class="private-group-message"><i class="fa-solid fa-lock"></i><h3>Đây là một nhóm riêng tư</h3><p>Tham gia nhóm này để xem hoặc chia sẻ nội dung.</p></div>';
                    const formContainer = document.getElementById('create-post-form-container');
                    if (formContainer) formContainer.innerHTML = '';
                }

            } else {
                document.body.innerHTML = "<h1>Nhóm này không tồn tại hoặc đã bị xóa.</h1>";
            }
        } catch (error) {
            console.error("Lỗi khi tải thông tin nhóm:", error);
            document.body.innerHTML = "<h1>Đã xảy ra lỗi khi tải trang.</h1>";
        }
    };

    // --- ACTION HANDLERS ---

    const handleJoinGroup = async () => {
        if (!currentUser || !currentGroupData) return;

        const button = document.getElementById('join-group-btn');
        if (button) button.disabled = true;

        const userId = currentUser.uid;

        if (currentGroupData.privacy === 'private') {
            // Nhóm riêng tư -> Gửi yêu cầu tham gia
            const requestRef = ref(db, `groups/${groupId}/joinRequests/${userId}`);
            await set(requestRef, {
                uid: userId,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
                timestamp: serverTimestamp()
            });
            if (button) button.textContent = 'Đã Yêu Cầu';
            alert('Yêu cầu tham gia của bạn đã được gửi đến quản trị viên nhóm.');

            // Gửi email thông báo cho người tạo nhóm
            notifyGroupCreatorForNewRequest(groupId, currentUser);
        } else {
            // Nhóm công khai -> Tham gia ngay
            const updates = {};
            updates[`/groups/${groupId}/members/${userId}`] = { role: 'Thành viên', joinedAt: serverTimestamp() };
            updates[`/users/${userId}/groups/${groupId}`] = true;

            // Tăng memberCount
            const groupRef = ref(db, `groups/${groupId}`);
            await runTransaction(groupRef, (group) => {
                if (group) {
                    group.memberCount = (group.memberCount || 0) + 1;
                }
                return group;
            });

            await update(ref(db), updates);
            // Tải lại dữ liệu để cập nhật UI
            initializePage(currentUser);
        }
    };

    // --- HÀM GỬI THÔNG BÁO CHO NGƯỜI TẠO NHÓM ---
    const notifyGroupCreatorForNewRequest = async (groupId, requestingUser) => {
        try {
            // 1. Lấy thông tin nhóm để tìm creatorId
            const groupRef = ref(db, `groups/${groupId}`);
            const groupSnapshot = await get(groupRef);
            if (!groupSnapshot.exists()) return;

            const groupData = groupSnapshot.val();
            const creatorId = groupData.creatorId;

            // 2. Lấy thông tin chi tiết và trạng thái của người tạo nhóm
            const creatorRef = ref(db, `users/${creatorId}`);
            const creatorStatusRef = ref(db, `status/${creatorId}`);

            const [creatorSnapshot, creatorStatusSnapshot] = await Promise.all([
                get(creatorRef),
                get(creatorStatusRef)
            ]);

            if (!creatorSnapshot.exists()) return;

            const creatorData = creatorSnapshot.val();
            const creatorStatus = creatorStatusSnapshot.val();

            // 3. Kiểm tra nếu người tạo nhóm offline và có email thì gửi thông báo
            if (creatorStatus && creatorStatus.state === 'offline' && creatorData.email) {
                const manageGroupUrl = `${window.location.origin}/manage-group.html?id=${groupId}`;
                const subject = `Có yêu cầu tham gia mới cho nhóm "${groupData.displayName}"`;
                const htmlContent = `
                    <p>Chào ${creatorData.displayName},</p>
                    <p>Người dùng <b>${requestingUser.displayName}</b> muốn tham gia nhóm "<b>${groupData.displayName}</b>" của bạn.</p>
                    <p>Bạn có thể xem và duyệt yêu cầu tại đây:</p>
                    <p><a href="${manageGroupUrl}">${manageGroupUrl}</a></p>
                    <p>Trân trọng,<br>Đội ngũ Vex</p>
                `;

                await sendEmail(creatorData.email, creatorData.displayName, subject, htmlContent);
            }
        } catch (error) {
            console.error("Lỗi khi gửi thông báo cho người tạo nhóm:", error);
        }
    };

    const handleLeaveGroup = async () => {
        if (!currentUser || !currentGroupData) return;
        if (!confirm(`Bạn có chắc chắn muốn rời khỏi nhóm "${currentGroupData.displayName}" không?`)) return;

        const userId = currentUser.uid;

        const updates = {};
        updates[`/groups/${groupId}/members/${userId}`] = null;
        updates[`/users/${userId}/groups/${groupId}`] = null;

        // Giảm memberCount
        const groupRef = ref(db, `groups/${groupId}`);
        await runTransaction(groupRef, (group) => {
            if (group && group.members && group.members[userId]) {
                 group.memberCount = Math.max(0, (group.memberCount || 1) - 1);
            }
            return group;
        });

        await update(ref(db), updates);
        // Tải lại dữ liệu để cập nhật UI
        initializePage(currentUser);
    };

    // --- INITIALIZATION ---

    // Lắng nghe thay đổi trạng thái đăng nhập
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        initializePage(user); // Khởi tạo lại trang khi có thông tin người dùng
    });

});