import { db, auth } from './config-firebase.js';
import { ref, set, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- CẤU HÌNH CLOUDINARY ---
// !!! THAY THẾ CÁC GIÁ TRỊ NÀY BẰNG THÔNG TIN CỦA BẠN !!!
const CLOUDINARY_CLOUD_NAME = "dw8rpacnn";
const CLOUDINARY_UPLOAD_PRESET = "nguyentiennam";
// --------------------------

document.addEventListener('DOMContentLoaded', () => {
    const createGroupForm = document.getElementById('create-group-form');
    const avatarInput = document.getElementById('group-avatar');
    const avatarPreview = document.getElementById('avatar-preview');
    const submitButton = createGroupForm.querySelector('button[type="submit"]');

    let currentUser = null;

    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
        } else {
            console.log("User is not logged in. Redirecting to login page.");
            alert("Bạn cần đăng nhập để tạo nhóm.");
            window.location.href = '/login.html';
        }
    });

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
            return data.secure_url || null;
        } catch (error) {
            console.error("Lỗi Cloudinary:", error);
            throw error;
        }
    };

    // Hiển thị ảnh xem trước
    avatarInput.addEventListener('change', () => {
        const file = avatarInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Avatar Preview"/>`;
            };
            reader.readAsDataURL(file);
        } else {
            avatarPreview.innerHTML = '';
        }
    });

    createGroupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
            window.location.href = '/login.html';
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Đang tạo...';

        const groupId = createGroupForm['group-id'].value.trim();
        const groupDisplayName = createGroupForm['group-display-name'].value.trim();
        const groupDescription = createGroupForm['group-description'].value.trim();
        const privacy = document.querySelector('input[name="privacy"]:checked').value;
        const avatarFile = avatarInput.files[0];

        if (!groupId || !groupDisplayName || !groupDescription) {
            alert("Vui lòng điền đầy đủ thông tin cho nhóm.");
            submitButton.disabled = false;
            submitButton.textContent = 'Tạo Nhóm';
            return;
        }

        const groupIdPattern = /^[a-z0-9-]+$/;
        if (!groupIdPattern.test(groupId)) {
            alert("Tên nhóm (ID) chỉ được chứa chữ cái thường, số và dấu gạch ngang (-).");
            submitButton.disabled = false;
            submitButton.textContent = 'Tạo Nhóm';
            return;
        }

        const groupRef = ref(db, 'groups/' + groupId);

        try {
            const snapshot = await get(groupRef);
            if (snapshot.exists()) {
                alert("Tên nhóm này đã tồn tại. Vui lòng chọn một tên khác.");
                submitButton.disabled = false;
                submitButton.textContent = 'Tạo Nhóm';
                return;
            }

            let avatarUrl = "https://res.cloudinary.com/dofqagf8j/image/upload/v1714154135/default-group-avatar.png"; // Ảnh đại diện mặc định
            if (avatarFile) {
                 if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UPLOAD_PRESET") {
                    alert("Lỗi cấu hình: Vui lòng cập nhật Cloud Name và Upload Preset trong file js/create-group.js");
                    throw new Error("Chưa cấu hình Cloudinary.");
                }
                avatarUrl = await uploadToCloudinary(avatarFile);
            }

            const groupData = {
                id: groupId,
                displayName: groupDisplayName,
                description: groupDescription,
                avatarUrl: avatarUrl,
                privacy: privacy,
                creatorId: currentUser.uid,
                createdAt: new Date().toISOString(),
                memberCount: 1,
                members: {
                    [currentUser.uid]: true // Thêm người tạo vào danh sách thành viên
                }
            };

            // Sử dụng hai lệnh set riêng biệt thay vì update từ gốc
            const groupRef = ref(db, `groups/${groupId}`);
            const userGroupRef = ref(db, `users/${currentUser.uid}/groups/${groupId}`);

            await Promise.all([
                set(groupRef, groupData),
                set(userGroupRef, true)
            ]);

            alert("Tạo nhóm thành công!");
            window.location.href = `group.html?id=${groupId}`;

        } catch (error) {
            console.error("Lỗi khi tạo nhóm:", error);
            alert("Đã có lỗi xảy ra khi tạo nhóm. Vui lòng thử lại.");
            submitButton.disabled = false;
            submitButton.textContent = 'Tạo Nhóm';
        }
    });
});