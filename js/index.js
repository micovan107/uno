import { db, auth } from './config-firebase.js';
import { ref, get, query, orderByChild, limitToLast, runTransaction, push, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const groupList = document.getElementById('group-list');
    const hotPosts = document.getElementById('hot-posts');
    const fameLeaderboard = document.getElementById('fame-leaderboard');

    let currentUser = null;
    const defaultUserAvatar = 'https://res.cloudinary.com/dofqagf8j/image/upload/v1714154135/default-user-avatar.png';

    const reactionEmojis = {
        like: '👍',
        love: '❤️',
        haha: '😂',
        wow: '😮',
        sad: '😢',
        angry: '😠'
    };

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        // Tải lại bài đăng để cập nhật trạng thái reaction của người dùng
        fetchHotPosts(); 
    });

    // 1. Tải danh sách nhóm
    const fetchGroups = async () => {
        const groupsRef = ref(db, 'groups');
        try {
            const snapshot = await get(query(groupsRef, limitToLast(10)));
            if (snapshot.exists()) {
                groupList.innerHTML = '';
                snapshot.forEach(childSnapshot => {
                    const group = childSnapshot.val();
                    const groupAvatar = group.avatarUrl || 'https://via.placeholder.com/40';
                    const groupElement = document.createElement('li');
                    groupElement.innerHTML = `
                        <a href="/group.html?id=${childSnapshot.key}" class="group-item-link">
                            <img src="${groupAvatar}" alt="${group.displayName}" class="group-avatar">
                            <span>${group.displayName}</span>
                        </a>
                    `;
                    groupList.appendChild(groupElement);
                });
            } else {
                groupList.innerHTML = '<li>Chưa có nhóm nào.</li>';
            }
        } catch (error) {
            console.error("Lỗi khi tải danh sách nhóm:", error);
            groupList.innerHTML = '<li>Không thể tải danh sách nhóm.</li>';
        }
    };

    // Hàm trợ giúp để lấy tên nhóm
    const getGroupName = async (groupId) => {
        if (!groupId) return "Không xác định";
        const groupRef = ref(db, `groups/${groupId}/displayName`);
        const snapshot = await get(groupRef);
        return snapshot.exists() ? snapshot.val() : groupId;
    };

    // 2. Tải bài đăng hot
    const fetchHotPosts = async () => {
        const postsRef = ref(db, 'posts');
        try {
            const snapshot = await get(query(postsRef, orderByChild('createdAt'), limitToLast(10)));
            if (snapshot.exists()) {
                hotPosts.innerHTML = '';
                let posts = [];
                snapshot.forEach(childSnapshot => {
                    posts.push({ id: childSnapshot.key, ...childSnapshot.val() });
                });

                posts.reverse();

                for (const post of posts) {
                    if (!post.groupDisplayName && post.group) {
                        post.groupDisplayName = await getGroupName(post.group);
                    }

                    const postElement = document.createElement('div');
                    postElement.classList.add('post-item');
                    postElement.dataset.postId = post.id;

                    let contentSnippet = post.content ? `<p class="post-content-snippet">${post.content.substring(0, 150)}...</p>` : '';
                    let mediaElement = post.imageUrl ? `<img src="${post.imageUrl}" alt="Nội dung ảnh" class="post-media">` : '';

                    postElement.innerHTML = `
                        <div class="post-meta">
                            <a href="/profile.html?uid=${post.authorId}">
                                <img src="${post.authorAvatar || defaultUserAvatar}" alt="${post.authorName}" class="post-author-avatar">
                            </a>
                            <div class="post-details">
                                <div>
                                    <a href="/profile.html?uid=${post.authorId}" class="post-author-name">${post.authorName}</a>
                                    ${post.groupDisplayName ? `<span class="post-group-name"> trong <a href="/group.html?id=${post.groupId}">${post.groupDisplayName}</a></span>` : ''}
                                </div>
                                <div class="post-timestamp">${new Date(post.createdAt).toLocaleString('vi-VN')}</div>
                            </div>
                        </div>
                        <a href="/post.html?id=${post.id}" class="post-title-link">
                            <h3 class="post-title">${post.title}</h3>
                        </a>
                        ${contentSnippet}
                        ${mediaElement}
                        <div class="post-footer">
                            <div class="post-stats">
                                <div class="reaction-summary" id="reaction-summary-${post.id}"></div>
                                <span class="comment-count-display" id="comment-count-${post.id}">💬 ${post.commentCount || 0}</span>
                            </div>
                            <div class="post-actions">
                                <div class="reaction-container">
                                    <button class="action-btn react-btn" data-post-id="${post.id}">👍 Thích</button>
                                    <div class="reaction-popup">
                                        ${Object.entries(reactionEmojis).map(([type, emoji]) => `<span class="reaction-icon" data-reaction="${type}">${emoji}</span>`).join('')}
                                    </div>
                                </div>
                                <button class="action-btn toggle-comments-btn" data-post-id="${post.id}">Bình luận</button>
                            </div>
                        </div>
                        <div class="comments-section" id="comments-section-${post.id}" style="display: none;"></div>
                    `;
                    hotPosts.appendChild(postElement);
                    loadAndRenderReactions(post.id);
                }
                attachPostEventListeners();
            } else {
                hotPosts.innerHTML = '<p>Chưa có bài đăng nào.</p>';
            }
        } catch (error) {
            console.error("Lỗi khi tải bài đăng:", error);
            hotPosts.innerHTML = '<p>Không thể tải bài đăng.</p>';
        }
    };

    // Gắn các event listener cho các nút của bài đăng
    const attachPostEventListeners = () => {
        document.querySelectorAll('.toggle-comments-btn').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', (e) => toggleComments(e.target.dataset.postId));
        });

        document.querySelectorAll('.reaction-icon').forEach(icon => {
            const newIcon = icon.cloneNode(true);
            icon.parentNode.replaceChild(newIcon, icon);
            newIcon.addEventListener('click', (e) => {
                const reactionType = e.target.dataset.reaction;
                const postId = e.target.closest('.post-item').dataset.postId;
                handleReaction(postId, reactionType);
                e.target.closest('.reaction-popup').style.display = 'none';
            });
        });
        
        document.querySelectorAll('.react-btn').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', (e) => handleReaction(e.target.dataset.postId, 'like'));
        });
    };

    // --- REACTION & COMMENT FUNCTIONS (Copied and adapted from group.js) ---

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
            // Sắp xếp các reaction theo số lượng giảm dần
            const sortedReactions = Object.entries(reactionCounts)
                .filter(([_, count]) => count > 0)
                .sort((a, b) => b[1] - a[1]);

            // Hiển thị tối đa 3 icon reaction phổ biến nhất
            sortedReactions.slice(0, 3).forEach(([type, _]) => {
                const icon = document.createElement('span');
                icon.className = 'summary-icon';
                icon.textContent = reactionEmojis[type];
                summaryContainer.appendChild(icon);
            });

            // Tính tổng số reaction
            totalReactions = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
            
            // Hiển thị tổng số nếu có
            if (totalReactions > 0) {
                const countSpan = document.createElement('span');
                countSpan.className = 'summary-count';
                countSpan.textContent = totalReactions;
                summaryContainer.appendChild(countSpan);
            }
        }

        if (currentUser) {
            const userReactionRef = ref(db, `reactions/${postId}/${currentUser.uid}`);
            const userReactionSnap = await get(userReactionRef);
            if (userReactionSnap.exists()) {
                const reactionType = userReactionSnap.val().type;
                reactBtn.innerHTML = `${reactionEmojis[reactionType]} ${reactionType}`;
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
        const reactionRef = ref(db, `reactions/${postId}/${currentUser.uid}`);
        const reactionCountsRef = ref(db, `posts/${postId}/reactionCounts`);
        const oldReactionSnap = await get(reactionRef);
        const oldReactionType = oldReactionSnap.exists() ? oldReactionSnap.val().type : null;
        const isUnreacting = oldReactionType === reactionType;

        await runTransaction(reactionCountsRef, (currentCounts) => {
            if (!currentCounts) currentCounts = {};
            if (oldReactionType) currentCounts[oldReactionType] = (currentCounts[oldReactionType] || 1) - 1;
            if (!isUnreacting) currentCounts[reactionType] = (currentCounts[reactionType] || 0) + 1;
            return currentCounts;
        });

        if (isUnreacting) await set(reactionRef, null);
        else await set(reactionRef, { type: reactionType });

        loadAndRenderReactions(postId);
    };

    const toggleComments = (postId) => {
        const commentsSection = document.getElementById(`comments-section-${postId}`);
        if (!commentsSection) return;
        const isVisible = commentsSection.style.display === 'block';
        commentsSection.style.display = isVisible ? 'none' : 'block';
        if (!isVisible && !commentsSection.innerHTML) {
            loadAndRenderComments(postId);
        }
    };

    const loadAndRenderComments = async (postId) => {
        const commentsSection = document.getElementById(`comments-section-${postId}`);
        commentsSection.innerHTML = '<p>Đang tải bình luận...</p>';

        // Luôn hiển thị form bình luận chính trước
        renderCommentForm(postId, null, commentsSection); 

        const commentsRef = ref(db, `comments/${postId}`);
        const snapshot = await get(query(commentsRef, orderByChild('createdAt')));
        
        const listContainer = document.createElement('div');
        listContainer.className = 'comments-list-container';
        commentsSection.appendChild(listContainer);

        if (snapshot.exists()) {
            const allComments = snapshot.val();
            const tree = {};
            Object.keys(allComments).forEach(id => {
                const c = { id, ...allComments[id] };
                if (c.parentId) {
                    if (!tree[c.parentId]) tree[c.parentId] = [];
                    tree[c.parentId].push(c);
                }
            });
            listContainer.innerHTML = '';
            Object.keys(allComments).map(id => ({ id, ...allComments[id] })).filter(c => !c.parentId).forEach(c => renderCommentTree(c, tree, 0, listContainer));
        } else {
            listContainer.innerHTML = '<p>Chưa có bình luận nào.</p>';
        }
    };

    const renderCommentTree = (comment, tree, depth, parentElement) => {
    const threadDiv = document.createElement('div');
    threadDiv.className = 'comment-thread';
    threadDiv.appendChild(createCommentItem(comment));

    const replies = tree[comment.id];
    if (replies && replies.length > 0) {
        const repliesDiv = document.createElement('div');
        repliesDiv.className = 'replies';
        repliesDiv.style.display = 'none'; // Ẩn ban đầu

        const showRepliesBtn = document.createElement('button');
        showRepliesBtn.className = 'show-replies-btn action-btn'; // Thêm class action-btn cho styling
        showRepliesBtn.textContent = `--- hiện ${replies.length} câu trả lời ---`;
        
        threadDiv.appendChild(showRepliesBtn);
        threadDiv.appendChild(repliesDiv);

        let repliesRendered = false;
        showRepliesBtn.addEventListener('click', () => {
            const isHidden = repliesDiv.style.display === 'none';
            repliesDiv.style.display = isHidden ? 'block' : 'none';
            showRepliesBtn.textContent = isHidden ? `--- ẩn ${replies.length} câu trả lời ---` : `--- hiện ${replies.length} câu trả lời ---`;

            // Chỉ render replies lần đầu tiên click để tối ưu
            if (isHidden && !repliesRendered) {
                replies.forEach(reply => renderCommentTree(reply, tree, depth + 1, repliesDiv));
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
                        <button class="reply-btn" data-comment-id="${comment.id}" data-post-id="${comment.postId || comment.id}">Trả lời</button>
                    </div>
                </div>
                <div class="reply-form-container" id="reply-form-for-${comment.id}"></div>
            </div>
        `;
        itemDiv.querySelector('.reply-btn').addEventListener('click', (e) => {
            const formContainer = document.getElementById(`reply-form-for-${e.target.dataset.commentId}`);
            document.querySelectorAll('.reply-form-container').forEach(c => c.innerHTML = '');
            renderCommentForm(e.target.dataset.postId, e.target.dataset.commentId, formContainer);
        });
        return itemDiv;
    };

    const renderCommentForm = (postId, parentId, container) => {
        if (!currentUser) {
            container.innerHTML = `<p>Vui lòng <a href="/login.html">đăng nhập</a> để bình luận.</p>`;
            return;
        }
        const formId = parentId ? `reply-form-${parentId}` : `main-comment-form-${postId}`;
        container.innerHTML = `
            <form class="comment-form" id="${formId}">
                <textarea placeholder="${parentId ? 'Viết câu trả lời...' : 'Chia sẻ suy nghĩ...'}" required></textarea>
                <div class="comment-form-actions">
                    <button type="submit">Gửi</button>
                    ${parentId ? '<button type="button" class="cancel-reply-btn">Hủy</button>' : ''}
                </div>
            </form>
        `;
        const form = document.getElementById(formId);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = form.querySelector('textarea').value.trim();
            if (text) {
                await submitComment(postId, parentId, text);
                loadAndRenderComments(postId);
            }
        });
        if (parentId) {
            form.querySelector('.cancel-reply-btn').addEventListener('click', () => container.innerHTML = '');
        }
    };

    const submitComment = async (postId, parentId, text) => {
        if (!currentUser) return;
        const commentData = {
            postId: postId, body: text, authorId: currentUser.uid, authorName: currentUser.displayName,
            authorAvatar: currentUser.photoURL, createdAt: serverTimestamp(), parentId: parentId || null
        };
        await set(push(ref(db, `comments/${postId}`)), commentData);
        const postRef = ref(db, `posts/${postId}`);
        await runTransaction(postRef, (post) => {
            if (post) post.commentCount = (post.commentCount || 0) + 1;
            return post;
        });
        // Tải lại toàn bộ comment để đảm bảo đồng bộ
        loadAndRenderComments(postId);
    };

    // 3. Tải bảng xếp hạng
    const fetchFameLeaderboard = async () => {
        const usersRef = ref(db, 'users');
        try {
            const snapshot = await get(query(usersRef, orderByChild('followers'), limitToLast(5)));
            if (snapshot.exists()) {
                fameLeaderboard.innerHTML = '';
                const users = [];
                snapshot.forEach(childSnapshot => users.push({ uid: childSnapshot.key, ...childSnapshot.val() }));
                users.reverse().forEach(user => {
                    const userElement = document.createElement('li');
                    userElement.innerHTML = `
                        <a href="/profile.html?uid=${user.uid}" class="leaderboard-user-link">
                            <img src="${user.photoURL || defaultUserAvatar}" alt="${user.displayName}" class="leaderboard-user-avatar">
                            <span>${user.displayName} (${user.followers || 0} followers)</span>
                        </a>
                    `;
                    fameLeaderboard.appendChild(userElement);
                });
            } else {
                fameLeaderboard.innerHTML = '<li>Chưa có dữ liệu.</li>';
            }
        } catch (error) {
            console.error("Lỗi khi tải bảng xếp hạng:", error);
            fameLeaderboard.innerHTML = '<li>Không thể tải bảng xếp hạng.</li>';
        }
    };

    // Gọi các hàm để tải dữ liệu
    fetchGroups();
    fetchFameLeaderboard();
});