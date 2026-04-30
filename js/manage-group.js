import { db, auth } from './config-firebase.js';
import { ref, get, update, remove, query, orderByChild, equalTo, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- CẤU HÌNH CLOUDINARY ---
const CLOUDINARY_CLOUD_NAME = "dw8rpacnn";
const CLOUDINARY_UPLOAD_PRESET = "nguyentiennam";
// --------------------------

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('id');

    const managementContainer = document.getElementById('management-container');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    
    const groupNameTitle = document.getElementById('group-name-title');
    const manageForm = document.getElementById('manage-group-form');
    const displayNameInput = document.getElementById('group-display-name');
    const descriptionInput = document.getElementById('group-description');
    const avatarInput = document.getElementById('group-avatar');
    const avatarPreview = document.getElementById('avatar-preview');
    const deleteButton = document.getElementById('delete-group-btn');

    let currentUser = null;
    let currentGroupData = null;

    // Tab Management
    const tabNavigation = document.querySelector('.tab-navigation');
    const tabContents = document.querySelectorAll('.tab-content');

    tabNavigation.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-link')) {
            const tabId = e.target.dataset.tab;

            // Update active state for tab links
            tabNavigation.querySelectorAll('.tab-link').forEach(link => {
                link.classList.remove('active');
            });
            e.target.classList.add('active');

            // Show the selected tab content and hide others
            tabContents.forEach(content => {
                if (content.id === tabId) {
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            });
        }
    });

    if (!groupId) {
        showError("Không tìm thấy ID của nhóm.");
        return;
    }

    // Hàm hiển thị lỗi và ẩn nội dung chính
    function showError(message) {
        loadingMessage.style.display = 'none';
        managementContainer.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.querySelector('p').textContent = message;
    }

    // Hàm upload ảnh lên Cloudinary
    const uploadToCloudinary = async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            const data = await response.json();
            return data.secure_url || null;
        } catch (error) {
            console.error("Lỗi Cloudinary:", error);
            throw error;
        }
    };
    
    // Hiển thị ảnh xem trước khi chọn file mới
    avatarInput.addEventListener('change', () => {
        const file = avatarInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Avatar Preview"/>`;
            };
            reader.readAsDataURL(file);
        }
    });

    // Tải thông tin nhóm và kiểm tra quyền
    const loadAndVerify = async (user) => {
        const groupRef = ref(db, `groups/${groupId}`);
        const snapshot = await get(groupRef);

        if (!snapshot.exists()) {
            showError("Nhóm này không tồn tại.");
            return;
        }

        currentGroupData = snapshot.val();

        // Kiểm tra quyền: user phải tồn tại và là người tạo nhóm
        if (!user || user.uid !== currentGroupData.creatorId) {
            showError("Bạn không có quyền quản lý nhóm này.");
            return;
        }

        // Nếu có quyền, hiển thị form và điền dữ liệu
        loadingMessage.style.display = 'none';
        managementContainer.style.display = 'block';

        groupNameTitle.textContent = currentGroupData.displayName;
        displayNameInput.value = currentGroupData.displayName;
        descriptionInput.value = currentGroupData.description;
        if (currentGroupData.avatarUrl) {
            avatarPreview.innerHTML = `<img src="${currentGroupData.avatarUrl}" alt="Ảnh đại diện hiện tại"/>`;
        }

        // Điền thông tin quyền riêng tư
        const privacy = currentGroupData.privacy || 'public'; // Mặc định là public nếu không có
        const privacyRadio = document.querySelector(`input[name="privacy"][value="${privacy}"]`);
        if (privacyRadio) {
            privacyRadio.checked = true;
        }

        // Tải và hiển thị danh sách thành viên
        await loadAndRenderMembers(groupId);
        // Tải và hiển thị danh sách bài đăng để quản lý
        await loadAndRenderPostsForManagement(groupId);
        // Tải và hiển thị danh sách yêu cầu tham gia
        renderJoinRequests(groupId, currentGroupData.joinRequests || {});
    };

    // Render danh sách yêu cầu tham gia
    const renderJoinRequests = (groupId, requests) => {
        const container = document.getElementById('request-list-container');
        const badge = document.getElementById('requests-count-badge');
        container.innerHTML = '';
        const requestIds = Object.keys(requests);

        if (requestIds.length > 0) {
            badge.textContent = requestIds.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
            container.innerHTML = '<p>Không có yêu cầu tham gia nào.</p>';
            return;
        }

        requestIds.forEach(uid => {
            const request = requests[uid];
            const item = document.createElement('div');
            item.className = 'request-item';
            item.innerHTML = `
                <div class="request-info">
                    <img src="${request.photoURL || './img/user-default.png'}" alt="${request.displayName}">
                    <span>${request.displayName}</span>
                </div>
                <div class="request-actions">
                    <button class="approve-btn" data-uid="${uid}">Chấp Nhận</button>
                    <button class="reject-btn" data-uid="${uid}">Từ Chối</button>
                </div>
            `;
            container.appendChild(item);
        });

        // Thêm event listeners
        container.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', () => handleRequest(groupId, btn.dataset.uid, 'approve'));
        });
        container.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', () => handleRequest(groupId, btn.dataset.uid, 'reject'));
        });
    };

    // Xử lý yêu cầu tham gia
    const handleRequest = async (groupId, userId, action) => {
        const requestRef = ref(db, `groups/${groupId}/joinRequests/${userId}`);

        if (action === 'approve') {
            // Thay thế update từ gốc bằng các lệnh set/remove riêng lẻ, an toàn hơn
            const memberRef = ref(db, `groups/${groupId}/members/${userId}`);
            const userGroupRef = ref(db, `users/${userId}/joinedGroups/${groupId}`);
            const requestRef = ref(db, `groups/${groupId}/joinRequests/${userId}`);

            await Promise.all([
                set(memberRef, { role: 'Thành viên', joinedAt: Date.now() }),
                set(userGroupRef, true),
                remove(requestRef) // Xóa yêu cầu sau khi đã xử lý
            ]);

        } else { // reject
            await remove(requestRef);
        }

        // Tải lại dữ liệu để cập nhật UI
        loadAndVerify(currentUser);
    };

    // Xử lý sự kiện submit form cập nhật
    manageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = manageForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Đang lưu...';

        try {
            let newAvatarUrl = currentGroupData.avatarUrl;
            const avatarFile = avatarInput.files[0];

            if (avatarFile) {
                if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UPLOAD_PRESET") {
                    alert("Lỗi cấu hình: Vui lòng cập nhật Cloud Name và Upload Preset trong js/manage-group.js");
                    throw new Error("Chưa cấu hình Cloudinary.");
                }
                newAvatarUrl = await uploadToCloudinary(avatarFile);
            }

            const selectedPrivacy = document.querySelector('input[name="privacy"]:checked').value;

            const updates = {
                displayName: displayNameInput.value.trim(),
                description: descriptionInput.value.trim(),
                avatarUrl: newAvatarUrl,
                privacy: selectedPrivacy
            };

            const groupRef = ref(db, `groups/${groupId}`);
            await update(groupRef, updates);

            alert("Cập nhật thông tin nhóm thành công!");
            groupNameTitle.textContent = updates.displayName; // Cập nhật tiêu đề trang

        } catch (error) {
            console.error("Lỗi khi cập nhật nhóm:", error);
            alert("Đã có lỗi xảy ra. Vui lòng thử lại.");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Lưu Thay Đổi';
        }
    });

    // Xử lý sự kiện xóa nhóm
    deleteButton.addEventListener('click', async () => {
        const confirmation = prompt(`Hành động này không thể hoàn tác. Để xác nhận, gõ tên nhóm "${currentGroupData.displayName}" vào ô bên dưới:`);
        if (confirmation !== currentGroupData.displayName) {
            alert("Xác nhận không chính xác. Hành động xóa đã bị hủy.");
            return;
        }

        deleteButton.disabled = true;
        deleteButton.textContent = 'Đang xóa...';

        try {
            // TODO: Xóa tất cả bài viết, bình luận, và các dữ liệu liên quan đến nhóm.
            // Đây là một tác vụ phức tạp, tạm thời chúng ta chỉ xóa nhóm.
            
            const groupRef = ref(db, `groups/${groupId}`);
            await remove(groupRef);

            // Cũng cần xóa nhóm này khỏi danh sách các nhóm đã tham gia của tất cả thành viên
            // (Yêu cầu truy vấn phức tạp hơn)

            alert("Đã xóa nhóm thành công!");
            window.location.href = 'index.html';

        } catch (error) {
            console.error("Lỗi khi xóa nhóm:", error);
            alert("Đã có lỗi xảy ra khi xóa nhóm.");
            deleteButton.disabled = false;
            deleteButton.textContent = 'Xóa Nhóm Này';
        }
    });

    // Bắt đầu quá trình xác thực khi trạng thái đăng nhập thay đổi
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        loadAndVerify(user);
    });

    // --- QUẢN LÝ THÀNH VIÊN ---
    const memberListContainer = document.getElementById('member-list-container');

    const loadAndRenderMembers = async (groupId) => {
        const membersRef = ref(db, `groups/${groupId}/members`);
        const labelsRef = ref(db, `groups/${groupId}/labels`);
        
        const [membersSnapshot, labelsSnapshot] = await Promise.all([get(membersRef), get(labelsRef)]);

        if (!membersSnapshot.exists()) {
            memberListContainer.innerHTML = '<p>Chưa có thành viên nào trong nhóm.</p>';
            return;
        }

        const members = membersSnapshot.val();
        const memberIds = Object.keys(members);
        
        const customLabels = labelsSnapshot.exists() ? labelsSnapshot.val() : {};
        const labelColors = {
            'Trưởng nhóm': '#dc3545',
            'Phó nhóm': '#fd7e14',
            ...Object.fromEntries(Object.values(customLabels).map(l => [l.name, l.color]))
        };
        
        let memberListHtml = '';

        for (const userId of memberIds) {
            const userRef = ref(db, `users/${userId}`);
            const userSnapshot = await get(userRef);
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                const memberRole = members[userId].role || 'Thành viên';
                const roleColor = labelColors[memberRole] || '#6c757d'; // Màu xám mặc định

                memberListHtml += `
                    <div class="member-item" data-user-id="${userId}">
                        <div class="member-info">
                            <img src="${userData.photoURL || 'https://via.placeholder.com/40'}" alt="Avatar">
                            <span class="member-name">${userData.displayName}</span>
                            <span class="member-role-label" style="background-color: ${roleColor}; color: white;">${memberRole}</span>
                        </div>
                        <div class="member-actions">
                            <button class="change-role-btn">Thay đổi vai trò</button>
                            <button class="remove-btn remove-member-btn">Xóa</button>
                        </div>
                    </div>
                `;
            }
        }
        memberListContainer.innerHTML = memberListHtml;
    };

    // Xử lý sự kiện click trên container của danh sách thành viên (event delegation)
    memberListContainer.addEventListener('click', (e) => {
        const target = e.target;
        const memberItem = target.closest('.member-item');
        if (!memberItem) return;

        const userId = memberItem.dataset.userId;

        if (target.classList.contains('remove-member-btn')) {
            handleRemoveMember(userId);
        }

        if (target.classList.contains('change-role-btn')) {
            handleChangeMemberRole(userId);
        }
    });

    const handleRemoveMember = async (userId) => {
        if (!confirm('Bạn có chắc chắn muốn xóa thành viên này khỏi nhóm?')) {
            return;
        }
        
        const groupId = new URLSearchParams(window.location.search).get('id');
        const memberRef = ref(db, `groups/${groupId}/members/${userId}`);
        
        try {
            await remove(memberRef);
            // Cũng nên xóa group ID khỏi hồ sơ của user
            const userGroupRef = ref(db, `users/${userId}/joinedGroups/${groupId}`);
            await remove(userGroupRef);

            alert('Đã xóa thành viên thành công.');
            loadAndRenderMembers(groupId); // Tải lại danh sách
        } catch (error) {
            console.error("Lỗi khi xóa thành viên:", error);
            alert('Có lỗi xảy ra khi xóa thành viên.');
        }
    };

    const handleChangeMemberRole = async (userId) => {
        const groupId = new URLSearchParams(window.location.search).get('id');
        const labelsRef = ref(db, `groups/${groupId}/labels`);
        const snapshot = await get(labelsRef);
        
        const defaultLabels = ['Trưởng nhóm', 'Phó nhóm', 'Thành viên'];
        let availableLabels = [...defaultLabels];
        
        if (snapshot.exists()) {
            const customLabels = Object.values(snapshot.val()).map(l => l.name);
            availableLabels = [...new Set([...availableLabels, ...customLabels])]; // Gộp và loại bỏ trùng lặp
        }

        // Tạo một danh sách các lựa chọn cho prompt hoặc một modal trong tương lai
        const rolesString = availableLabels.map((role, index) => `${index + 1}: ${role}`).join('\n');
        const selection = prompt(`Chọn một vai trò cho thành viên:\n${rolesString}\n\nNhập số tương ứng:`);

        if (selection === null || selection.trim() === '') {
            return;
        }

        const selectedIndex = parseInt(selection.trim(), 10) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= availableLabels.length) {
            alert("Lựa chọn không hợp lệ.");
            return;
        }

        const newRole = availableLabels[selectedIndex];
        const memberRoleRef = ref(db, `groups/${groupId}/members/${userId}/role`);

        try {
            await update(memberRoleRef.parent, { role: newRole });
            alert('Cập nhật vai trò thành công!');
            loadAndRenderMembers(groupId); // Tải lại danh sách
        } catch (error) {
            console.error("Lỗi khi cập nhật vai trò:", error);
            alert('Có lỗi xảy ra khi cập nhật vai trò.');
        }
    };
});

// --- QUẢN LÝ NHÃN QUYỀN ---
document.addEventListener('DOMContentLoaded', () => {
    const createLabelForm = document.getElementById('create-label-form');
    const labelListContainer = document.getElementById('label-list-container');
    const groupId = new URLSearchParams(window.location.search).get('id');

    const defaultLabels = ['Trưởng nhóm', 'Phó nhóm'];

    const renderLabels = async () => {
        if (!groupId) return;
        const labelsRef = ref(db, `groups/${groupId}/labels`);
        const snapshot = await get(labelsRef);
        
        const customLabels = snapshot.exists() ? Object.values(snapshot.val()) : [];

        labelListContainer.innerHTML = '<h3>Nhãn hiện có</h3>';
        
        // Render nhãn mặc định
        const defaultLabelsData = [
            { name: 'Trưởng nhóm', color: '#dc3545' }, // Màu đỏ
            { name: 'Phó nhóm', color: '#fd7e14' }  // Màu cam
        ];

        defaultLabelsData.forEach(label => {
            labelListContainer.innerHTML += `
                <div class="label-item" data-label-name="${label.name}">
                    <div class="label-info">
                        <span class="label-name" style="background-color: ${label.color}; color: white;">${label.name}</span>
                        <span class="default-tag">(Mặc định)</span>
                    </div>
                    <div class="label-actions"></div>
                </div>
            `;
        });

        // Render nhãn tùy chỉnh
        customLabels.forEach(label => {
            labelListContainer.innerHTML += `
                <div class="label-item" data-label-name="${label.name}">
                    <div class="label-info">
                        <span class="label-name" style="background-color: ${label.color}; color: white;">${label.name}</span>
                    </div>
                    <div class="label-actions">
                        <button class="remove-btn remove-label-btn">Xóa</button>
                    </div>
                </div>
            `;
        });
    };

    createLabelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const labelNameInput = document.getElementById('label-name');
        const labelColorInput = document.getElementById('label-color');
        const labelName = labelNameInput.value.trim();
        const labelColor = labelColorInput.value;

        if (labelName && groupId) {
            const labelsRef = ref(db, `groups/${groupId}/labels`);
            const newLabelRef = push(labelsRef); // Sử dụng push để tạo ID duy nhất
            try {
                // Sử dụng set thay vì update để ghi dữ liệu mới
                await set(newLabelRef, { 
                    name: labelName,
                    color: labelColor 
                });
                labelNameInput.value = '';
                labelColorInput.value = '#cccccc'; // Reset màu
                renderLabels();
            } catch (error) {
                console.error("Lỗi khi tạo nhãn:", error);
                alert('Không thể tạo nhãn. Vui lòng thử lại.');
            }
        }
    });

    labelListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-label-btn')) {
            const labelItem = e.target.closest('.label-item');
            const labelName = labelItem.dataset.labelName;

            if (labelName && !defaultLabels.includes(labelName) && confirm(`Bạn có chắc muốn xóa nhãn "${labelName}"?`)) {
                const labelsRef = ref(db, `groups/${groupId}/labels`);
                const snapshot = await get(labelsRef);
                if (snapshot.exists()) {
                    let labelKeyToRemove = null;
                    snapshot.forEach((childSnapshot) => {
                        if (childSnapshot.val().name === labelName) {
                            labelKeyToRemove = childSnapshot.key;
                        }
                    });

                    if (labelKeyToRemove) {
                        const labelToRemoveRef = ref(db, `groups/${groupId}/labels/${labelKeyToRemove}`);
                        try {
                            await remove(labelToRemoveRef);
                            renderLabels();
                        } catch (error) {
                            console.error("Lỗi khi xóa nhãn:", error);
                            alert('Không thể xóa nhãn. Vui lòng thử lại.');
                        }
                    }
                }
            }
        }
    });

    // Initial render
    if (groupId) {
        renderLabels();
    }
});

// --- QUẢN LÝ BÀI ĐĂNG VÀ BÌNH LUẬN ---
const loadAndRenderPostsForManagement = async (groupId) => {
    const container = document.querySelector('#posts.tab-content');
    container.innerHTML = '<h2>Quản lý bài đăng</h2><p>Đang tải bài đăng...</p>';

    const postsRef = query(ref(db, 'posts'), orderByChild('groupId'), equalTo(groupId));
    const snapshot = await get(postsRef);

    if (!snapshot.exists()) {
        container.innerHTML = '<h2>Quản lý bài đăng</h2><p>Chưa có bài đăng nào trong nhóm.</p>';
        return;
    }

    let postsHtml = '<h2>Quản lý bài đăng</h2>';
    const posts = snapshot.val();
    
    for (const postId in posts) {
        const post = posts[postId];
        postsHtml += `
            <div class="post-management-item" data-post-id="${postId}">
                <p><strong>Nội dung:</strong> ${post.content || '(Không có nội dung)'}</p>
                <p><small>Bởi: ${post.authorName || 'Không rõ'}</small></p>
                <button class="delete-post-btn danger-button" data-post-id="${postId}">Xóa Bài Đăng</button>
            </div>
        `;
    }
    container.innerHTML = postsHtml;

    // Thêm event listener cho các nút xóa
    container.querySelectorAll('.delete-post-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const postIdToDelete = e.target.dataset.postId;
            if (confirm(`Bạn có chắc chắn muốn xóa bài đăng này không? Hành động này không thể hoàn tác.`)) {
                await deletePost(postIdToDelete);
                // Tải lại danh sách bài đăng sau khi xóa
                await loadAndRenderPostsForManagement(groupId);
            }
        });
    });
};

// Hàm xóa bài đăng
const deletePost = async (postId) => {
    const postRef = ref(db, `posts/${postId}`);
    await remove(postRef);
    alert('Đã xóa bài đăng.');
};